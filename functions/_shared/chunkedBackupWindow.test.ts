// @vitest-environment node
/**
 * The resumable backup is run by a trigger that fires every ten minutes for a few hours, and each run reads a fixed
 * number of rows, so a ledger is backed up only if the runs in the window times the rows of a run cover it. These run
 * a ledger of 50,000 transactions with the defaults, as the worker does with `BACKUP_MODE=chunked` and nothing else
 * set, and hold the number of runs it takes, and the calls each makes, to what docs/BACKUPS.md says.
 */
import { describe, expect, it } from 'vitest'
import { memoryBackupStore } from '../../src/testing/memoryBackupStore'
import { syntheticLedger } from '../../src/testing/syntheticLedger'
import { OWNER, queryDb } from '../../src/testing/transactionQueryKit'
import { createD1ExpenseRepository } from './adapters/d1ExpenseRepository'
import { manifestKey } from './backupKeys'
import { runChunkedBackups } from './chunkedBackup'
import { DEFAULT_STEP_OPERATIONS, DEFAULT_STEP_ROWS, resolveChunkedBackup } from './chunkedBackupSettings'

/** `*\/10 4-7 * * *`: every ten minutes from 04:00 to 07:50 UTC. */
const RUNS_IN_WINDOW = 24
/** Runs that may fail, or be missed, or start a pass again, before a day is lost. */
const SPARE_RUNS = 4

const policy = { retentionDays: 14, maxBucketBytes: 512 * 1024 * 1024, maxSnapshotBytes: 100 * 1024 * 1024, bucketAlertThresholdFraction: 0.8 }
const alerts = {
  onLargeSnapshot: () => Promise.resolve(),
  onBucketNearLimit: () => Promise.resolve(),
  onIncompleteBackup: () => Promise.resolve(),
  onInconsistentBackup: () => Promise.resolve(),
  onBackupFailed: () => Promise.resolve(),
}

describe('a ledger of 50,000 transactions, backed up with the default settings', () => {
  it('is finished in the runs of the window with some to spare, and no run makes more calls than it is allowed', async () => {
    const ledger = syntheticLedger({ months: 50, perMonth: 1_000, seed: 1 })
    expect(ledger.transactions.length).toBeGreaterThan(50_000)
    const kit = queryDb(ledger)
    const store = memoryBackupStore()
    const deps = {
      repo: createD1ExpenseRepository({ DB: kit.d1 }),
      store,
      alerts,
      policy,
      chunked: resolveChunkedBackup({ BACKUP_MODE: 'chunked' }),
      readRevision: () => Promise.resolve('unchanged'),
    }

    let runs = 0
    let mostCalls = 0
    for (let complete = false; !complete && runs < 100; ) {
      runs += 1
      const before = kit.statements.length + store.total()
      complete = (await runChunkedBackups(deps, () => new Date('2026-10-15T04:00:00Z'))).complete
      mostCalls = Math.max(mostCalls, kit.statements.length + store.total() - before)
    }

    expect(store.objects.has(manifestKey(OWNER, '2026-10-15'))).toBe(true)
    expect(runs).toBeLessThanOrEqual(RUNS_IN_WINDOW - SPARE_RUNS)
    expect(mostCalls).toBeLessThanOrEqual(DEFAULT_STEP_OPERATIONS)
    // The default is what makes the window enough: rows for the whole ledger in the runs the window has.
    expect(RUNS_IN_WINDOW * DEFAULT_STEP_ROWS).toBeGreaterThanOrEqual(ledger.transactions.length)
  }, 120_000)
})
