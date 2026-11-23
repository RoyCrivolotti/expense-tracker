/**
 * Where a resumable backup run is, for one owner and day: started fresh or carried on from its saved state, and
 * saved.
 */
import type { BackupStore } from '../domain/ports/backupStore'
import type { BackupAlerts } from '../domain/ports/backupAlerts'
import type { ExpenseRepository } from '../domain/ports/expenseRepository'
import { partKey, stateKey } from './backupKeys'
import { BACKUP_FORMAT, emptyCounts, parseBackupState, type BackupState } from './backupFormat'
import type { BackupPolicy } from './backupPolicy'
import type { ChunkedBackupSettings } from './chunkedBackupSettings'

export interface ChunkedDeps {
  repo: ExpenseRepository
  store: BackupStore
  alerts: BackupAlerts
  policy: BackupPolicy
  chunked: ChunkedBackupSettings
  /** The owner's dataset revision. Optional: without it a backup cannot say whether the ledger moved. */
  readRevision?: (owner: string) => Promise<string>
}

/** What is left of an invocation's allowance. Shared by every owner it backs up. */
export interface StepBudget {
  operations: number
  rows: number
}

export interface Run {
  deps: ChunkedDeps
  owner: string
  dateKey: string
  budget: StepBudget
  state: BackupState
  pending: string[]
  pendingRows: number
  now: () => Date
}

export function spend(
  budget: StepBudget,
  operations: number,
  rows = 0,
): void {
  budget.operations -= operations
  budget.rows -= rows
}

export async function revisionOf(
  deps: ChunkedDeps,
  owner: string,
  budget: StepBudget,
): Promise<string | null> {
  if (!deps.readRevision) return null
  spend(budget, 1)
  return deps.readRevision(owner)
}

export function freshState(
  owner: string,
  dateKey: string,
  startedAt: Date,
  revision: string | null,
  attempt: number,
): BackupState {
  return {
    format: BACKUP_FORMAT,
    owner,
    dateKey,
    startedAt: startedAt.toISOString(),
    revision,
    attempt,
    failed: false,
    table: 0,
    after: null,
    nextPart: 1,
    parts: [],
    counts: emptyCounts(),
  }
}

/** The saved state of a run in progress, or a new one. `resumed` says which. */
export async function startOrResume(
  deps: ChunkedDeps,
  owner: string,
  dateKey: string,
  budget: StepBudget,
  existing: ReadonlySet<string>,
  now: Date,
): Promise<{ state: BackupState; resumed: boolean }> {
  if (existing.has(stateKey(owner, dateKey))) {
    spend(budget, 1)
    const saved = parseBackupState(await deps.store.get(stateKey(owner, dateKey)), owner, dateKey)
    if (saved) return { state: saved, resumed: true }
  }
  return { state: freshState(owner, dateKey, now, await revisionOf(deps, owner, budget), 1), resumed: false }
}

export async function saveState(run: Run): Promise<void> {
  spend(run.budget, 1)
  await run.deps.store.put(stateKey(run.owner, run.dateKey), JSON.stringify(run.state), 'application/json')
}

/** Writes what has been read as the next part. The state is saved by the caller, once the cursor is settled. */
export async function writePart(run: Run): Promise<void> {
  if (run.pending.length === 0) return
  const key = partKey(run.owner, run.dateKey, run.state.nextPart)
  const body = run.pending.join('')
  spend(run.budget, 1)
  await run.deps.store.put(key, body, 'application/x-ndjson')
  run.state.parts.push({ key, rows: run.pendingRows, bytes: body.length })
  run.state.nextPart += 1
  run.pending = []
  run.pendingRows = 0
}
