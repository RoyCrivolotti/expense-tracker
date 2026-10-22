import type { BackupAlerts } from '../domain/ports/backupAlerts'
import type { BackupStore } from '../domain/ports/backupStore'
import type { ExpenseRepository } from '../domain/ports/expenseRepository'
import { createBackupAlerts } from './adapters/createBackupAlerts'
import { createD1ExpenseRepository } from './adapters/d1ExpenseRepository'
import { createR2BackupStore } from './adapters/r2BackupStore'
import { ownerBackupKey } from './backupKeys'
import type { BackupPolicy } from './backupPolicy'
import { maybeAlertBucketUsage, pruneBackups } from './backupHousekeeping'
import { resolveBackupPolicy } from './backupPolicy'
import { runChunkedBackups } from './chunkedBackup'
import { resolveChunkedBackup, type ChunkedBackupSettings } from './chunkedBackupSettings'
import { readOwnerRevision } from './dbRevision'
import type { Env } from './env'

export interface BackupRunResult {
  owners: number
  dateKey: string
  pruned: number
  usedBytes: number
}

export interface BackupDeps {
  repo: ExpenseRepository
  store: BackupStore | null
  alerts: BackupAlerts
  policy: BackupPolicy
  /** Absent means the daily single-file snapshot, as before chunked mode existed. */
  chunked?: ChunkedBackupSettings
  /** The owner's dataset revision, which a chunked backup compares across its run. */
  readRevision?: (owner: string) => Promise<string>
}

async function backupOwner(
  deps: BackupDeps,
  owner: string,
  dateKey: string,
): Promise<{ snapshotBytes: number }> {
  if (!deps.store) return { snapshotBytes: 0 }
  const dataset = await deps.repo.loadDataset(owner)
  const body = JSON.stringify(dataset)
  if (body.length > deps.policy.maxSnapshotBytes) {
    await deps.alerts.onLargeSnapshot({
      owner,
      bytes: body.length,
      limit: deps.policy.maxSnapshotBytes,
    })
  }
  await deps.store.put(ownerBackupKey(owner, dateKey), body)
  return { snapshotBytes: body.length }
}

export async function runAllBackups(deps: BackupDeps): Promise<BackupRunResult> {
  const dateKey = new Date().toISOString().slice(0, 10)
  const owners = await deps.repo.listOwners()
  for (const owner of owners) {
    await backupOwner(deps, owner, dateKey)
  }
  const pruned = await pruneBackups(deps, dateKey)
  const usedBytes = await maybeAlertBucketUsage(deps)
  return { owners: owners.length, dateKey, pruned, usedBytes }
}

/**
 * What the cron worker runs: the daily single-file snapshot, unless `BACKUP_MODE=chunked` is set on the worker,
 * in which case one invocation's share of the resumable backup. Returns the line to log.
 */
export async function runScheduledBackup(deps: BackupDeps & { store: BackupStore }): Promise<string> {
  if (deps.chunked?.enabled) {
    const result = await runChunkedBackups({ ...deps, store: deps.store, chunked: deps.chunked })
    const state = result.complete ? 'complete' : 'continues in the next invocation'
    const failed = result.failed > 0 ? `; ${result.failed} owner(s) have no backup today because the ledger kept changing` : ''
    return `backup (chunked): ${result.owners} owner(s) for ${result.dateKey}, ${state}${failed}; pruned ${result.pruned}; ${result.usedBytes} bytes stored`
  }
  const result = await runAllBackups(deps)
  return `backup: wrote ${result.owners} owner(s) for ${result.dateKey}; pruned ${result.pruned}; ${result.usedBytes} bytes stored`
}

/** Wire Cloudflare adapters from Pages/Worker env bindings. */
export function createBackupDeps(env: Env): BackupDeps {
  return {
    repo: createD1ExpenseRepository(env),
    store: env.BACKUPS ? createR2BackupStore(env.BACKUPS) : null,
    alerts: createBackupAlerts(env),
    policy: resolveBackupPolicy(env),
    chunked: resolveChunkedBackup(env),
    readRevision: async (owner) => (await readOwnerRevision(env.DB, owner)).token,
  }
}
