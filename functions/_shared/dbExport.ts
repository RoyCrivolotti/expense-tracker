import { exportCursorOf, type ExportChunk, type ExportChunkRequest, type ExportTable } from '../domain/data/exportTables'
import type { Env } from './env'
import { toTransaction, type QueryRow } from './dbTransactionQuery'
import { checkinsOf } from './dbReference'
import { CHECKIN_ENTRIES_SQL, exportSql } from './exportSql'
import {
  toAccount,
  toAttachment,
  toCashActual,
  toCategory,
  toFlag,
  toGoalScenario,
  toInstallmentPlan,
  toLabel,
  toSettings,
  toStatement,
  toWealthAccount,
  type AccountRow,
  type AttachmentRow,
  type CashActualRow,
  type CategoryRow,
  type FlagRow,
  type GoalScenarioRow,
  type InstallmentPlanRow,
  type LabelRow,
  type SettingsRow,
  type StatementRow,
  type WealthAccountRow,
  type WealthCheckinEntryRow,
  type WealthCheckinRow,
} from './rows'

type Mapper = (row: never) => object

/** Each table's row, mapped as the dataset maps it. Check-ins and settings are shaped by their own readers. */
const MAPPERS: Partial<Record<ExportTable, Mapper>> = {
  categories: (r: CategoryRow) => toCategory(r),
  accounts: (r: AccountRow) => toAccount(r),
  labels: (r: LabelRow) => toLabel(r),
  flags: (r: FlagRow) => toFlag(r),
  accountStatements: (r: StatementRow) => toStatement(r),
  cashActuals: (r: CashActualRow) => toCashActual(r),
  goalScenarios: (r: GoalScenarioRow) => toGoalScenario(r),
  installmentPlans: (r: InstallmentPlanRow) => toInstallmentPlan(r),
  wealthAccounts: (r: WealthAccountRow) => toWealthAccount(r),
  attachments: (r: AttachmentRow) => toAttachment(r),
  transactions: (r: QueryRow) => toTransaction(r),
}

async function readRows(env: Env, owner: string, request: ExportChunkRequest): Promise<unknown[]> {
  const { sql, params } = exportSql(request.table, owner, request.after, request.limit)
  const result = await env.DB.prepare(sql)
    .bind(...params)
    .all()
  return result.results ?? []
}

/** A check-in carries its entries in the dataset, so the entries of the chunk's check-ins come in one more read. */
async function withEntries(env: Env, owner: string, checkins: WealthCheckinRow[]): Promise<object[]> {
  if (checkins.length === 0) return []
  const result = await env.DB.prepare(CHECKIN_ENTRIES_SQL)
    .bind(owner, JSON.stringify(checkins.map((c) => c.id)))
    .all<WealthCheckinEntryRow & { checkin_id: number }>()
  return checkinsOf(checkins, result.results ?? [])
}

async function shape(env: Env, owner: string, table: ExportTable, raw: unknown[]): Promise<object[]> {
  if (table === 'settings') return raw.length > 0 ? [toSettings(raw[0] as SettingsRow)] : []
  if (table === 'wealthCheckins') return withEntries(env, owner, raw as WealthCheckinRow[])
  return raw.map((row) => (MAPPERS[table] as Mapper)(row as never))
}

/**
 * One chunk of one table of the owner's ledger, in primary-key order. Reads nothing but that table (and a
 * check-in's entries). In particular it does not run the installment backfill that a dataset read runs, so
 * an instalment that has fallen due but not been created yet is not in it.
 */
export async function readExportChunk(
  env: Env,
  owner: string,
  request: ExportChunkRequest,
): Promise<ExportChunk> {
  const found = await readRows(env, owner, request)
  const rows = await shape(env, owner, request.table, found.slice(0, request.limit))
  const last = rows.at(-1)
  const next = found.length > request.limit && last ? exportCursorOf(request.table, last) : null
  return { table: request.table, rows, next }
}
