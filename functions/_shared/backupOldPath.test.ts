// @vitest-environment node
/**
 * The daily single-file snapshot is what runs unless `BACKUP_MODE=chunked`, and a merge redeploys the cron worker,
 * so this pins everything the old path does as a sequence: which calls it makes to the repository, the bucket and
 * the alerts, in what order, with what keys. The tests run the sequences through every way of reaching the old path.
 * A sequence changes only on purpose: the bucket is measured before it is pruned, so that the alert sees the size the
 * day's files brought it to and not the size it was pruned down to.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BackupAlerts } from '../domain/ports/backupAlerts'
import type { BackupStore } from '../domain/ports/backupStore'
import type { ExpenseRepository } from '../domain/ports/expenseRepository'
import type { ExpenseDataset } from '../domain/types'
import { syntheticLedger } from '../../src/testing/syntheticLedger'
import type { BackupPolicy } from './backupPolicy'
import { runAllBackups, runScheduledBackup, type BackupDeps } from './backupService'

const TODAY = '2026-10-15'
const A = 'a@b.com'
const B = 'c@d.com'
const datasets: Record<string, ExpenseDataset> = {
  [A]: syntheticLedger({ months: 2, perMonth: 6, seed: 1 }),
  [B]: syntheticLedger({ months: 1, perMonth: 4, seed: 2 }),
}
const body = (owner: string): string => JSON.stringify(datasets[owner])

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(`${TODAY}T04:00:00Z`))
})

afterEach(() => {
  vi.useRealTimers()
})

interface Run {
  log: string[]
  stored: Map<string, string>
  deps: BackupDeps
}

/** Everything the old path touches, recording each call in one ordered log. */
function run(over: { objects?: Record<string, string>; policy?: Partial<BackupPolicy>; store?: boolean } = {}): Run {
  const log: string[] = []
  const stored = new Map(Object.entries(over.objects ?? {}))
  const store: BackupStore = {
    put: (key, text) => {
      log.push(`put ${key}`)
      stored.set(key, text)
      return Promise.resolve()
    },
    get: () => Promise.reject(new Error('the old path never reads an object back')),
    list: () => {
      log.push('list')
      return Promise.resolve([...stored].map(([key, text]) => ({ key, size: text.length })))
    },
    delete: (key) => {
      log.push(`delete ${key}`)
      stored.delete(key)
      return Promise.resolve()
    },
    deleteMany: () => Promise.reject(new Error('the old path deletes one object at a time')),
  }
  const repo = {
    listOwners: () => {
      log.push('listOwners')
      return Promise.resolve([A, B])
    },
    loadDataset: (owner: string) => {
      log.push(`loadDataset ${owner}`)
      return Promise.resolve(datasets[owner])
    },
  } as unknown as ExpenseRepository
  const alerts: BackupAlerts = {
    onLargeSnapshot: (d) => {
      log.push(`alert large ${d.owner} ${d.bytes} ${d.limit}`)
      return Promise.resolve()
    },
    onBucketNearLimit: (d) => {
      log.push(`alert bucket ${d.usedBytes} ${d.limitBytes}`)
      return Promise.resolve()
    },
    onIncompleteBackup: () => Promise.reject(new Error('the old path never reports an unfinished chunked backup')),
    onInconsistentBackup: () => Promise.reject(new Error('the old path never reports an inconsistent chunked backup')),
    onBackupFailed: (d) => {
      log.push(`alert failed ${d.owner}`)
      return Promise.resolve()
    },
  }
  const policy: BackupPolicy = {
    retentionDays: 14,
    maxBucketBytes: 512 * 1024 * 1024,
    maxSnapshotBytes: 5 * 1024 * 1024,
    bucketAlertThresholdFraction: 0.8,
    ...over.policy,
  }
  return { log, stored, deps: { repo, store: over.store === false ? null : store, alerts, policy } }
}

/** Every way the old path is reached: directly, by the cron worker's entry point with the mode unset, and with it off. */
const ENTRIES: Array<[string, (deps: BackupDeps) => Promise<unknown>]> = [
  ['runAllBackups', (deps) => runAllBackups(deps)],
  ['runScheduledBackup with no chunked setting', (deps) => runScheduledBackup(deps as BackupDeps & { store: BackupStore })],
  [
    'runScheduledBackup with chunked mode off',
    (deps) => runScheduledBackup({ ...deps, chunked: { enabled: false, maxOperations: 44, maxRows: 1_500 } } as BackupDeps & { store: BackupStore }),
  ],
]

describe.each(ENTRIES)('the daily snapshot, reached through %s', (_name, entry) => {
  it('writes one file per owner and day, in the same order of calls, then prunes and measures', async () => {
    const { log, stored, deps } = run({
      objects: { [`${A}/2026-09-01.json`]: 'old', [`${B}/2026-10-14.json`]: 'yesterday', [`${A}/notes.txt`]: 'not a backup' },
    })

    await entry(deps)

    expect(log).toEqual([
      'listOwners',
      `loadDataset ${A}`,
      `put ${A}/${TODAY}.json`,
      `loadDataset ${B}`,
      `put ${B}/${TODAY}.json`,
      'list',
      'list',
      `delete ${A}/2026-09-01.json`,
    ])
    expect(stored.get(`${A}/${TODAY}.json`)).toBe(body(A))
    expect(stored.get(`${B}/${TODAY}.json`)).toBe(body(B))
    expect([...stored.keys()].sort()).toEqual([`${A}/${TODAY}.json`, `${A}/notes.txt`, `${B}/2026-10-14.json`, `${B}/${TODAY}.json`])
  })

  it('raises the same alerts: a large snapshot before its file is written, the bucket before pruning', async () => {
    const { log, deps } = run({
      objects: { [`${A}/2026-09-01.json`]: 'x'.repeat(50) },
      policy: { maxSnapshotBytes: body(B).length + 1, maxBucketBytes: 1_000_000, bucketAlertThresholdFraction: 0.01 },
    })

    await entry(deps)

    const used = body(A).length + body(B).length + 50
    expect(log).toEqual([
      'listOwners',
      `loadDataset ${A}`,
      `alert large ${A} ${body(A).length} ${body(B).length + 1}`,
      `put ${A}/${TODAY}.json`,
      `loadDataset ${B}`,
      `put ${B}/${TODAY}.json`,
      'list',
      `alert bucket ${used} 1000000`,
      'list',
      `delete ${A}/2026-09-01.json`,
    ])
  })

  it('drops the oldest files, one delete each, when the bucket is over its byte cap', async () => {
    const { log, stored, deps } = run({
      objects: { [`${A}/2026-10-10.json`]: 'a'.repeat(300), [`${A}/2026-10-11.json`]: 'b'.repeat(300) },
      policy: { maxBucketBytes: body(A).length + body(B).length + 301 },
    })

    await entry(deps)

    expect(log.filter((l) => l.startsWith('delete'))).toEqual([`delete ${A}/2026-10-10.json`])
    expect(stored.has(`${A}/2026-10-11.json`)).toBe(true)
  })

  it('alerts on the size the bucket reached, even when pruning brings it back under its cap', async () => {
    const cap = body(A).length + body(B).length + 301
    const { log, deps } = run({
      objects: { [`${A}/2026-10-10.json`]: 'a'.repeat(300), [`${A}/2026-10-11.json`]: 'b'.repeat(300) },
      policy: { maxBucketBytes: cap, bucketAlertThresholdFraction: 1 },
    })

    await entry(deps)

    expect(log.filter((l) => l.startsWith('delete'))).toEqual([`delete ${A}/2026-10-10.json`])
    expect(log.filter((l) => l.startsWith('alert bucket'))).toEqual([`alert bucket ${body(A).length + body(B).length + 600} ${cap}`])
  })
})

describe('the daily snapshot with no bucket bound', () => {
  it('lists the owners and touches nothing else', async () => {
    const { log, deps } = run({ store: false })

    const result = await runAllBackups(deps)

    expect(log).toEqual(['listOwners'])
    expect(result).toEqual({ owners: 2, dateKey: TODAY, pruned: 0, usedBytes: 0 })
  })
})
