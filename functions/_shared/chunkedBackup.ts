/**
 * The resumable backup (docs/DEPLOYMENT.md, "Chunked backups"). The single-file snapshot loads the whole
 * dataset and stringifies it in one invocation, which meets the Worker's CPU limit at a few thousand
 * transactions. This walks the ledger with the export, one chunk of one table at a time, and writes what it
 * reads as parts. An invocation does as much as its budget allows (D1 queries plus bucket calls, and rows),
 * saves where it got to, and the next one carries on from there. A backup exists once its manifest does.
 */
import type { BackupStore } from '../domain/ports/backupStore'
import type { BackupAlerts } from '../domain/ports/backupAlerts'
import type { ExpenseRepository } from '../domain/ports/expenseRepository'
import { EXPORT_CHUNK_ROWS, EXPORT_FORMAT, EXPORT_TABLES, type ExportChunk } from '../domain/data/exportTables'
import { manifestKey, partKey, stateKey } from './backupKeys'
import {
  BACKUP_FORMAT,
  emptyCounts,
  parseBackupState,
  type BackupManifest,
  type BackupState,
  type PartLine,
} from './backupFormat'
import { maybeAlertBucketUsage, pruneBackups } from './backupHousekeeping'
import type { BackupPolicy } from './backupPolicy'
import type { ChunkedBackupSettings } from './chunkedBackupSettings'

/** Rows after which what has been read is written as a part. */
export const PART_ROWS = 5_000
/** Calls that must be left to finish whatever happens next: write a part, save the state, read the revision, write the manifest. */
const FINISH_RESERVE = 4
/** A run that has fewer calls than this left would start and make no progress. */
const MIN_TO_START = 6

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

export type OwnerOutcome = 'complete' | 'already complete' | 'continues'

export interface ChunkedRunResult {
  owners: number
  dateKey: string
  /** True when every owner has a backup for the day. */
  complete: boolean
  pruned: number
  usedBytes: number
}

interface Run {
  deps: ChunkedDeps
  owner: string
  dateKey: string
  budget: StepBudget
  state: BackupState
  pending: string[]
  pendingRows: number
  now: () => Date
}

const readCost = (table: string): number => (table === 'wealthCheckins' ? 2 : 1)

function spend(budget: StepBudget, operations: number, rows = 0): void {
  budget.operations -= operations
  budget.rows -= rows
}

async function revisionOf(deps: ChunkedDeps, owner: string, budget: StepBudget): Promise<string | null> {
  if (!deps.readRevision) return null
  spend(budget, 1)
  return deps.readRevision(owner)
}

async function startOrResume(
  deps: ChunkedDeps,
  owner: string,
  dateKey: string,
  budget: StepBudget,
  existing: ReadonlySet<string>,
  now: Date,
): Promise<BackupState> {
  if (existing.has(stateKey(owner, dateKey))) {
    spend(budget, 1)
    const saved = parseBackupState(await deps.store.get(stateKey(owner, dateKey)), owner, dateKey)
    if (saved) return saved
  }
  return {
    format: BACKUP_FORMAT,
    owner,
    dateKey,
    startedAt: now.toISOString(),
    revision: await revisionOf(deps, owner, budget),
    table: 0,
    after: null,
    nextPart: 1,
    parts: [],
    counts: emptyCounts(),
  }
}

async function saveState(run: Run): Promise<void> {
  spend(run.budget, 1)
  await run.deps.store.put(stateKey(run.owner, run.dateKey), JSON.stringify(run.state), 'application/json')
}

/** Writes what has been read as the next part. The state is saved by the caller, once the cursor is settled. */
async function writePart(run: Run): Promise<void> {
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

function take(run: Run, chunk: ExportChunk): void {
  for (const row of chunk.rows) run.pending.push(`${JSON.stringify({ t: chunk.table, r: row } satisfies PartLine)}\n`)
  run.pendingRows += chunk.rows.length
  run.state.counts[chunk.table] += chunk.rows.length
  if (chunk.next === null) {
    run.state.table += 1
    run.state.after = null
  } else {
    run.state.after = chunk.next
  }
}

/** Reads chunks until the tables are done or the budget cannot pay for another and still finish. */
async function drain(run: Run): Promise<void> {
  const { state, budget, deps, owner } = run
  while (state.table < EXPORT_TABLES.length) {
    const table = EXPORT_TABLES[state.table] as (typeof EXPORT_TABLES)[number]
    if (budget.rows <= 0 || budget.operations < readCost(table) + FINISH_RESERVE) return
    const limit = Math.min(EXPORT_CHUNK_ROWS[table], budget.rows)
    spend(budget, readCost(table))
    const chunk = await deps.repo.readExportChunk(owner, { table, limit, ...(state.after !== null ? { after: state.after } : {}) })
    spend(budget, 0, chunk.rows.length)
    take(run, chunk)
    if (run.pendingRows >= PART_ROWS) {
      await writePart(run)
      await saveState(run)
    }
  }
}

async function finish(run: Run): Promise<void> {
  const { deps, owner, dateKey, state } = run
  await writePart(run)
  const revisionNow = await revisionOf(deps, owner, run.budget)
  const manifest: BackupManifest = {
    format: BACKUP_FORMAT,
    exportFormat: EXPORT_FORMAT,
    owner,
    dateKey,
    startedAt: state.startedAt,
    finishedAt: run.now().toISOString(),
    revision: state.revision,
    consistent: revisionNow === state.revision,
    tables: state.counts,
    parts: state.parts,
    bytes: state.parts.reduce((sum, part) => sum + part.bytes, 0),
  }
  spend(run.budget, 1)
  await deps.store.put(manifestKey(owner, dateKey), JSON.stringify(manifest), 'application/json')
  // The manifest is what counts; a state file left behind (the delete is the one call that may fail) is harmless.
  spend(run.budget, 1)
  await deps.store.delete(stateKey(owner, dateKey)).catch(() => undefined)
  if (manifest.bytes > deps.policy.maxSnapshotBytes) {
    await deps.alerts.onLargeSnapshot({ owner, bytes: manifest.bytes, limit: deps.policy.maxSnapshotBytes })
  }
}

/**
 * One owner's backup for one day, as far as the budget goes. `existing` is the bucket's keys at the start of the
 * invocation, so a backup that is already complete costs no call.
 */
export async function backupOwnerChunked(
  deps: ChunkedDeps,
  owner: string,
  dateKey: string,
  budget: StepBudget,
  existing: ReadonlySet<string>,
  now: () => Date,
): Promise<OwnerOutcome> {
  if (existing.has(manifestKey(owner, dateKey))) return 'already complete'
  if (budget.operations < MIN_TO_START) return 'continues'
  const state = await startOrResume(deps, owner, dateKey, budget, existing, now())
  const run: Run = { deps, owner, dateKey, budget, state, pending: [], pendingRows: 0, now }
  await drain(run)
  if (state.table < EXPORT_TABLES.length) {
    await writePart(run)
    await saveState(run)
    return 'continues'
  }
  await finish(run)
  return 'complete'
}

/** A run from an earlier day that has a state but no manifest never finished: say so once, and stop carrying it. */
async function reportAbandoned(
  deps: ChunkedDeps,
  keys: ReadonlySet<string>,
  today: string,
  budget: StepBudget,
): Promise<void> {
  for (const key of keys) {
    const match = /^(.+)\/(\d{4}-\d{2}-\d{2})\/state\.json$/.exec(key)
    if (!match || budget.operations < MIN_TO_START) continue
    const [, owner, dateKey] = match as unknown as [string, string, string]
    if (dateKey >= today || keys.has(manifestKey(owner, dateKey))) continue
    spend(budget, 2)
    await deps.alerts.onIncompleteBackup({ owner, dateKey })
    await deps.store.delete(key)
  }
}

/** The cron entry point of chunked mode: one invocation's worth of work, for every owner. */
export async function runChunkedBackups(deps: ChunkedDeps, now: () => Date = () => new Date()): Promise<ChunkedRunResult> {
  const dateKey = now().toISOString().slice(0, 10)
  const budget: StepBudget = { operations: deps.chunked.maxOperations, rows: deps.chunked.maxRows }
  spend(budget, 2)
  const [objects, owners] = await Promise.all([deps.store.list(), deps.repo.listOwners()])
  const keys = new Set(objects.map((object) => object.key))
  await reportAbandoned(deps, keys, dateKey, budget)
  let finished = 0
  for (const owner of owners) {
    const outcome = await backupOwnerChunked(deps, owner, dateKey, budget, keys, now)
    if (outcome === 'continues') return { owners: owners.length, dateKey, complete: false, pruned: 0, usedBytes: 0 }
    if (outcome === 'complete') finished += 1
  }
  if (finished === 0) return { owners: owners.length, dateKey, complete: true, pruned: 0, usedBytes: 0 }
  const pruned = await pruneBackups(deps, dateKey, true)
  const usedBytes = await maybeAlertBucketUsage(deps)
  return { owners: owners.length, dateKey, complete: true, pruned, usedBytes }
}
