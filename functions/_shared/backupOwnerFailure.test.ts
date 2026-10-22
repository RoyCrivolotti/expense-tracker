// @vitest-environment node
/**
 * One owner whose ledger cannot be backed up must not take the other owners' backups with it, and must not pass
 * unnoticed: the others are written, the bucket is still looked after, the failure is alerted, and then the run
 * throws so that the cron invocation shows as failed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BackupAlerts } from '../domain/ports/backupAlerts'
import type { ExpenseRepository } from '../domain/ports/expenseRepository'
import { memoryBackupStore } from '../../src/testing/memoryBackupStore'
import { manifestKey, ownerBackupKey } from './backupKeys'
import type { BackupPolicy } from './backupPolicy'
import { runAllBackups, runScheduledBackup, type BackupDeps } from './backupService'
import { runChunkedBackups } from './chunkedBackup'
import { resolveChunkedBackup } from './chunkedBackupSettings'

const TODAY = '2026-10-15'
const [A, B, C] = ['a@b.com', 'c@d.com', 'e@f.com']
const policy: BackupPolicy = {
  retentionDays: 14,
  maxBucketBytes: 512 * 1024 * 1024,
  maxSnapshotBytes: 5 * 1024 * 1024,
  bucketAlertThresholdFraction: 0.8,
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(`${TODAY}T04:00:00Z`))
})

afterEach(() => {
  vi.useRealTimers()
})

function alerts(): BackupAlerts & { onBackupFailed: ReturnType<typeof vi.fn>; onBucketNearLimit: ReturnType<typeof vi.fn> } {
  return {
    onLargeSnapshot: vi.fn().mockResolvedValue(undefined),
    onBucketNearLimit: vi.fn().mockResolvedValue(undefined),
    onIncompleteBackup: vi.fn().mockResolvedValue(undefined),
    onInconsistentBackup: vi.fn().mockResolvedValue(undefined),
    onBackupFailed: vi.fn().mockResolvedValue(undefined),
  }
}

describe('the daily snapshot, with the second of three owners failing', () => {
  const broken = new Error('D1 hiccup')
  const setup = (over: Partial<BackupDeps> = {}) => {
    const store = memoryBackupStore({ [ownerBackupKey(A, '2026-09-01')]: 'old', [ownerBackupKey(B, '2026-09-01')]: 'old' })
    const spy = alerts()
    const repo = {
      listOwners: () => Promise.resolve([A, B, C]),
      loadDataset: (owner: string) => (owner === B ? Promise.reject(broken) : Promise.resolve({ owner })),
    } as unknown as ExpenseRepository
    const deps: BackupDeps = { repo, store, alerts: spy, policy, ...over }
    return { store, spy, deps }
  }

  it('writes the owners on either side of it', async () => {
    const { store, deps } = setup()

    await expect(runAllBackups(deps)).rejects.toThrow()

    expect(store.objects.has(ownerBackupKey(A, TODAY))).toBe(true)
    expect(store.objects.has(ownerBackupKey(B, TODAY))).toBe(false)
    expect(store.objects.has(ownerBackupKey(C, TODAY))).toBe(true)
  })

  it('alerts with the owner, the day and the reason, and then fails the run naming them', async () => {
    const { spy, deps } = setup()

    const error = await runAllBackups(deps).catch((e: unknown) => e as Error)

    expect(spy.onBackupFailed).toHaveBeenCalledOnce()
    expect(spy.onBackupFailed).toHaveBeenCalledWith({ owner: B, dateKey: TODAY, reason: 'D1 hiccup' })
    expect(error.message).toBe(`backup: 1 of 3 owner(s) have no backup for ${TODAY}: ${B} (D1 hiccup)`)
    expect(error.cause).toBe(broken)
  })

  it('still prunes and measures the bucket, since a failing owner every day must not stop the clean-up', async () => {
    const { store, spy, deps } = setup({ policy: { ...policy, bucketAlertThresholdFraction: 0 } })

    await runAllBackups(deps).catch(() => undefined)

    expect(spy.onBucketNearLimit).toHaveBeenCalledOnce()
    expect(store.objects.has(ownerBackupKey(A, '2026-09-01'))).toBe(false)
  })

  it('keeps the failed owner’s last backup through the clean-up, however old', async () => {
    const { store, deps } = setup()

    await runAllBackups(deps).catch(() => undefined)

    expect(store.objects.has(ownerBackupKey(B, '2026-09-01'))).toBe(true)
  })

  it('fails the same way when it is reached through the cron entry point', async () => {
    const { deps, spy } = setup()

    await expect(runScheduledBackup({ ...deps, store: deps.store! })).rejects.toThrow('1 of 3 owner(s)')
    expect(spy.onBackupFailed).toHaveBeenCalledOnce()
  })

  it('names every owner that failed', async () => {
    const { deps, spy } = setup({
      repo: {
        listOwners: () => Promise.resolve([A, B, C]),
        loadDataset: (owner: string) => (owner === A ? Promise.resolve({}) : Promise.reject(new Error(`no ${owner}`))),
      } as unknown as ExpenseRepository,
    })

    await expect(runAllBackups(deps)).rejects.toThrow(`2 of 3 owner(s) have no backup for ${TODAY}: ${B} (no ${B}), ${C} (no ${C})`)
    expect(spy.onBackupFailed).toHaveBeenCalledTimes(2)
  })

  it('does not let an alert that cannot be sent replace the failure', async () => {
    const { deps, spy } = setup()
    spy.onBackupFailed.mockRejectedValue(new Error('email is down'))

    await expect(runAllBackups(deps)).rejects.toThrow('have no backup')
  })

  it('reports the failure even when the clean-up fails as well', async () => {
    const { store, deps, spy } = setup()
    store.list = () => Promise.reject(new Error('R2 is down'))

    await expect(runAllBackups(deps)).rejects.toThrow()

    expect(spy.onBackupFailed).toHaveBeenCalledOnce()
  })

  it('is quiet when every owner is backed up', async () => {
    const { deps, spy } = setup({
      repo: { listOwners: () => Promise.resolve([A, B, C]), loadDataset: () => Promise.resolve({}) } as unknown as ExpenseRepository,
    })

    await expect(runAllBackups(deps)).resolves.toMatchObject({ owners: 3, dateKey: TODAY })
    expect(spy.onBackupFailed).not.toHaveBeenCalled()
  })
})

describe('the resumable backup, with the first of two owners failing', () => {
  const setup = () => {
    const store = memoryBackupStore()
    const spy = alerts()
    const repo = {
      listOwners: () => Promise.resolve([A, B]),
      readExportChunk: (owner: string, { table }: { table: string }) =>
        owner === A ? Promise.reject(new Error('D1 hiccup')) : Promise.resolve({ table, rows: [], next: null }),
    } as unknown as ExpenseRepository
    return {
      store,
      spy,
      deps: { repo, store, alerts: spy, policy, chunked: resolveChunkedBackup({ BACKUP_MODE: 'chunked' }) },
    }
  }

  it('backs up the owner after it, alerts, and fails the run', async () => {
    const { store, spy, deps } = setup()

    await expect(runChunkedBackups(deps, () => new Date(`${TODAY}T04:00:00Z`))).rejects.toThrow(
      `backup: 1 of 2 owner(s) have no backup for ${TODAY}: ${A} (D1 hiccup)`,
    )

    expect(store.objects.has(manifestKey(B, TODAY))).toBe(true)
    expect(store.objects.has(manifestKey(A, TODAY))).toBe(false)
    expect(spy.onBackupFailed).toHaveBeenCalledWith({ owner: A, dateKey: TODAY, reason: 'D1 hiccup' })
  })

  const oldBackup = (owner: string) => ({
    [`${owner}/2026-09-01/part-000001.ndjson`]: 'x'.repeat(100),
    [`${owner}/2026-09-01/manifest.json`]: '{}',
  })

  it('still prunes and measures the bucket once nobody is waiting, so a failure every day cannot stop the clean-up', async () => {
    const { store, spy, deps } = setup()
    for (const [key, body] of Object.entries({ ...oldBackup(A), ...oldBackup(B) })) store.objects.set(key, body)

    await expect(
      runChunkedBackups({ ...deps, policy: { ...policy, bucketAlertThresholdFraction: 0 } }, () => new Date(`${TODAY}T04:00:00Z`)),
    ).rejects.toThrow('have no backup')

    expect(spy.onBucketNearLimit).toHaveBeenCalledOnce()
    // B has today's backup, so its old one goes; A has only the old one, which is kept as the last there is.
    expect(store.objects.has(`${B}/2026-09-01/manifest.json`)).toBe(false)
    expect(store.objects.has(`${A}/2026-09-01/manifest.json`)).toBe(true)
  })

  it('does the same when the ledger of the owner kept changing and not an error', async () => {
    const store = memoryBackupStore(oldBackup(B))
    const spy = alerts()
    let reads = 0
    const repo = {
      listOwners: () => Promise.resolve([A, B]),
      readExportChunk: (_owner: string, { table }: { table: string }) => Promise.resolve({ table, rows: [], next: null }),
    } as unknown as ExpenseRepository
    const deps = {
      repo,
      store,
      alerts: spy,
      policy: { ...policy, bucketAlertThresholdFraction: 0 },
      chunked: resolveChunkedBackup({ BACKUP_MODE: 'chunked' }),
      // Moves on every look, so no pass can ever end on the revision it began with.
      readRevision: (owner: string) => Promise.resolve(owner === A ? `r${(reads += 1)}` : 'steady'),
    }

    let result = await runChunkedBackups(deps, () => new Date(`${TODAY}T04:00:00Z`))
    for (let i = 0; i < 6 && result.failed === 0; i += 1) result = await runChunkedBackups(deps, () => new Date(`${TODAY}T04:00:00Z`))

    expect(result).toMatchObject({ failed: 1, complete: false })
    expect(spy.onBucketNearLimit).toHaveBeenCalled()
    expect(store.objects.has(`${B}/2026-09-01/manifest.json`)).toBe(false)
  })

  it('does not prune, and says nothing of the bucket, while an owner is still waiting for a later run', async () => {
    const { store, spy, deps } = setup()
    for (const [key, body] of Object.entries(oldBackup(B))) store.objects.set(key, body)

    // A throws at once; B is started with what is left of the budget and does not finish.
    await expect(
      runChunkedBackups(
        { ...deps, chunked: { enabled: true, maxOperations: 14, maxRows: 3_000 }, policy: { ...policy, bucketAlertThresholdFraction: 0 } },
        () => new Date(`${TODAY}T04:00:00Z`),
      ),
    ).rejects.toThrow('have no backup')

    expect(store.objects.has(manifestKey(B, TODAY))).toBe(false)
    expect(spy.onBucketNearLimit).not.toHaveBeenCalled()
    expect(store.objects.has(`${B}/2026-09-01/manifest.json`)).toBe(true)
  })
})

describe('the resumable backup, when it is done for the day', () => {
  it('alerts on the size the bucket reached, even when pruning brings it back under its cap', async () => {
    const old = `${B}/2026-09-01/`
    const store = memoryBackupStore({ [`${old}part-000001.ndjson`]: 'x'.repeat(10_000), [`${old}manifest.json`]: '{}' })
    const spy = alerts()
    const repo = {
      listOwners: () => Promise.resolve([A, B]),
      readExportChunk: (_owner: string, { table }: { table: string }) => Promise.resolve({ table, rows: [], next: null }),
    } as unknown as ExpenseRepository
    const deps = {
      repo,
      store,
      alerts: spy,
      policy: { ...policy, maxBucketBytes: 5_000, bucketAlertThresholdFraction: 1 },
      chunked: resolveChunkedBackup({ BACKUP_MODE: 'chunked' }),
    }

    const result = await runChunkedBackups(deps, () => new Date(`${TODAY}T04:00:00Z`))

    expect(result.complete).toBe(true)
    expect(store.objects.has(`${old}manifest.json`)).toBe(false)
    expect(spy.onBucketNearLimit).toHaveBeenCalledOnce()
  })

  it('keeps each owner’s backup of the day however far over its cap the bucket is', async () => {
    const store = memoryBackupStore()
    const repo = {
      listOwners: () => Promise.resolve([A, B]),
      readExportChunk: (_owner: string, { table }: { table: string }) => Promise.resolve({ table, rows: [], next: null }),
    } as unknown as ExpenseRepository
    const deps = {
      repo,
      store,
      alerts: alerts(),
      policy: { ...policy, maxBucketBytes: 1 },
      chunked: resolveChunkedBackup({ BACKUP_MODE: 'chunked' }),
    }

    await runChunkedBackups(deps, () => new Date(`${TODAY}T04:00:00Z`))

    expect(store.objects.has(manifestKey(A, TODAY))).toBe(true)
    expect(store.objects.has(manifestKey(B, TODAY))).toBe(true)
  })
})
