// @vitest-environment node
/**
 * Which backup runs. The daily single-file snapshot is the default and stays so until `BACKUP_MODE=chunked` is
 * set on the worker; nothing else changes what the cron does.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BackupAlerts } from '../domain/ports/backupAlerts'
import { inMemoryExpenseRepository } from '../../src/testing/inMemoryExpenseRepository'
import { memoryBackupStore } from '../../src/testing/memoryBackupStore'
import { migratedDatabase, sqliteD1 } from '../../src/testing/sqliteD1'
import { syntheticLedger } from '../../src/testing/syntheticLedger'
import worker from '../../workers/backup-cron/src/index'
import { manifestKey } from './backupKeys'
import type { BackupPolicy } from './backupPolicy'
import { createBackupDeps, runScheduledBackup, type BackupDeps } from './backupService'
import {
  DEFAULT_STEP_OPERATIONS,
  DEFAULT_STEP_ROWS,
  MAX_STEP_OPERATIONS,
  MIN_STEP_OPERATIONS,
  resolveChunkedBackup,
} from './chunkedBackupSettings'
import type { Env } from './env'

const OWNER = 'a@b.com'
const policy: BackupPolicy = { retentionDays: 14, maxBucketBytes: 512 * 1024 * 1024, maxSnapshotBytes: 5 * 1024 * 1024, bucketAlertThresholdFraction: 0.8 }
const alerts: BackupAlerts = {
  onLargeSnapshot: vi.fn().mockResolvedValue(undefined),
  onBucketNearLimit: vi.fn().mockResolvedValue(undefined),
  onIncompleteBackup: vi.fn().mockResolvedValue(undefined),
  onInconsistentBackup: vi.fn().mockResolvedValue(undefined),
}

afterEach(() => vi.restoreAllMocks())

describe('resolveChunkedBackup', () => {
  it('is off, with the defaults, when nothing is set', () => {
    expect(resolveChunkedBackup({})).toEqual({ enabled: false, maxOperations: DEFAULT_STEP_OPERATIONS, maxRows: DEFAULT_STEP_ROWS })
    expect(DEFAULT_STEP_ROWS).toBe(1_500)
  })

  it.each([
    ['chunked', true],
    [' Chunked ', true],
    ['CHUNKED', true],
    ['single', false],
    ['', false],
    ['chunk', false],
    ['true', false],
    ['1', false],
  ])('reads BACKUP_MODE=%j as enabled: %s', (mode, enabled) => {
    expect(resolveChunkedBackup({ BACKUP_MODE: mode }).enabled).toBe(enabled)
  })

  it('takes a budget that is a whole number within the bounds, and ignores one that is not', () => {
    expect(resolveChunkedBackup({ BACKUP_STEP_MAX_OPERATIONS: '30', BACKUP_STEP_MAX_ROWS: '2500' })).toMatchObject({ maxOperations: 30, maxRows: 2_500 })
    for (const bad of ['nope', '-4', '0', String(MIN_STEP_OPERATIONS - 1), String(MAX_STEP_OPERATIONS + 1), '']) {
      expect(resolveChunkedBackup({ BACKUP_STEP_MAX_OPERATIONS: bad }).maxOperations, bad).toBe(DEFAULT_STEP_OPERATIONS)
    }
    expect(resolveChunkedBackup({ BACKUP_STEP_MAX_ROWS: '5' }).maxRows).toBe(DEFAULT_STEP_ROWS)
  })

  it('keeps the default within the bounds, so a default run can never ask for more than a Worker may make', () => {
    expect(DEFAULT_STEP_OPERATIONS).toBeGreaterThanOrEqual(MIN_STEP_OPERATIONS)
    expect(DEFAULT_STEP_OPERATIONS).toBeLessThanOrEqual(MAX_STEP_OPERATIONS)
    expect(MAX_STEP_OPERATIONS + 3).toBeLessThan(50)
  })
})

function depsWith(chunked: BackupDeps['chunked']) {
  const store = memoryBackupStore()
  const dataset = syntheticLedger({ months: 2, perMonth: 6, seed: 3 })
  const repo = inMemoryExpenseRepository(dataset, OWNER)
  const deps = { repo, store, alerts, policy, ...(chunked ? { chunked } : {}), readRevision: () => Promise.resolve('r') }
  return { store, deps }
}

const keysOf = (store: ReturnType<typeof memoryBackupStore>) => [...store.objects.keys()]
const today = new Date().toISOString().slice(0, 10)

describe('runScheduledBackup', () => {
  it('writes one snapshot file for the day when chunked mode is not given at all', async () => {
    const { store, deps } = depsWith(undefined)

    const line = await runScheduledBackup(deps)

    expect(keysOf(store)).toEqual([`${OWNER}/${today}.json`])
    expect(line).toMatch(/^backup: wrote 1 owner\(s\) for \d{4}-\d{2}-\d{2}; pruned 0; \d+ bytes stored$/)
  })

  it('and when it is given and switched off', async () => {
    const { store, deps } = depsWith({ enabled: false, maxOperations: 44, maxRows: 10_000 })

    await runScheduledBackup(deps)

    expect(keysOf(store)).toEqual([`${OWNER}/${today}.json`])
  })

  it('writes a folder with a manifest, and no snapshot file, when it is switched on', async () => {
    const { store, deps } = depsWith({ enabled: true, maxOperations: 44, maxRows: 10_000 })

    const line = await runScheduledBackup(deps)

    expect(store.objects.has(manifestKey(OWNER, today))).toBe(true)
    expect(keysOf(store).some((k) => k.endsWith('.json') && !k.includes('/' + today + '/'))).toBe(false)
    expect(line).toMatch(/^backup \(chunked\): 1 owner\(s\) for \d{4}-\d{2}-\d{2}, complete; pruned 0; \d+ bytes stored$/)
  })

  it('says when the day continues in the next invocation', async () => {
    const { deps } = depsWith({ enabled: true, maxOperations: MIN_STEP_OPERATIONS, maxRows: 10 })

    expect(await runScheduledBackup(deps)).toContain('continues in the next invocation')
  })
})

describe('createBackupDeps', () => {
  const sqlite = migratedDatabase()
  const base: Env = { DB: sqliteD1(sqlite) }

  it('is the single-file backup unless BACKUP_MODE is chunked', () => {
    expect(createBackupDeps(base).chunked?.enabled).toBe(false)
    expect(createBackupDeps({ ...base, BACKUP_MODE: 'chunked' }).chunked?.enabled).toBe(true)
  })

  it('reads the owner’s revision from the database, creating one for an owner who has none', async () => {
    const deps = createBackupDeps(base)

    const first = await deps.readRevision!('new@example.com')

    expect(first).toMatch(/^[0-9a-f]{16}$/)
    expect(await deps.readRevision!('new@example.com')).toBe(first)
  })
})

describe('the cron worker', () => {
  /** A bucket in memory with the surface the backup uses. */
  function bucket() {
    const memory = memoryBackupStore()
    const fake = {
      put: (key: string, body: string) => memory.put(key, body),
      get: async (key: string) => {
        const text = await memory.get(key)
        return text === null ? null : { text: () => Promise.resolve(text) }
      },
      list: async () => ({ objects: (await memory.list()).map((o) => ({ key: o.key, size: o.size })), truncated: false }),
      delete: (keys: string | string[]) => memory.deleteMany!(Array.isArray(keys) ? keys : [keys]),
    }
    return { memory, binding: fake as unknown as R2Bucket }
  }

  const run = (env: Env) => worker.scheduled({} as ScheduledController, env, {} as ExecutionContext)

  function database(): D1Database {
    const sqlite = migratedDatabase()
    sqlite.exec("DELETE FROM settings WHERE owner <> 'a@b.com'")
    sqlite.prepare("INSERT INTO settings (owner) VALUES ('a@b.com')").run()
    return sqliteD1(sqlite)
  }

  it('skips with a warning when there is no bucket bound', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    await run({ DB: database() })

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('BACKUPS binding not configured'))
  })

  it('writes the daily snapshot file by default', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { memory, binding } = bucket()

    await run({ DB: database(), BACKUPS: binding })

    expect([...memory.objects.keys()]).toEqual([`a@b.com/${today}.json`])
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('backup: wrote 1 owner(s)'))
  })

  it('writes the chunked backup once BACKUP_MODE is set to chunked', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { memory, binding } = bucket()

    await run({ DB: database(), BACKUPS: binding, BACKUP_MODE: 'chunked' })

    expect(memory.objects.has(manifestKey('a@b.com', today))).toBe(true)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('backup (chunked): 1 owner(s)'))
  })
})
