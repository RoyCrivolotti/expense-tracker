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

/** Wire Cloudflare adapters from Pages/Worker env bindings. */
export function createBackupDeps(env: Env): BackupDeps {
  return {
    repo: createD1ExpenseRepository(env),
    store: env.BACKUPS ? createR2BackupStore(env.BACKUPS) : null,
    alerts: createBackupAlerts(env),
    policy: resolveBackupPolicy(env),
  }
}
