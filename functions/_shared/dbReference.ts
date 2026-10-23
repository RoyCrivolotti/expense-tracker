import type { ReferenceTables } from '../domain/data/ledgerParts'
import type { WealthCheckin } from '../domain/types'
import { defaultExpenseSettings } from '../domain/engine/defaults'
import type { Env } from './env'
import {
  toAccount,
  toCashActual,
  toCategory,
  toFlag,
  toGoalScenario,
  toInstallmentPlan,
  toLabel,
  toSettings,
  toStatement,
  toWealthAccount,
  toWealthCheckin,
  toWealthCheckinEntry,
  type AccountRow,
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

export async function rows<T>(db: D1Database, sql: string, owner: string): Promise<T[]> {
  const result = await db.prepare(sql).bind(owner).all<T>()
  return result.results ?? []
}

/** Group entries by checkin_id for O(1) lookup when assembling checkins. */
export function checkinsOf(
  checkinRows: WealthCheckinRow[],
  entryRows: Array<WealthCheckinEntryRow & { checkin_id: number }>,
): WealthCheckin[] {
  const entriesByCheckin = new Map<number, WealthCheckinEntryRow[]>()
  for (const e of entryRows) {
    const list = entriesByCheckin.get(e.checkin_id) ?? []
    list.push(e)
    entriesByCheckin.set(e.checkin_id, list)
  }
  return checkinRows.map((c) =>
    toWealthCheckin(c, (entriesByCheckin.get(c.id) ?? []).map(toWealthCheckinEntry)),
  )
}

/** The wealth tables of an owner, read together. Every check-in's entries come in one query, grouped by `checkinsOf`. */
async function wealthRows(db: D1Database, owner: string) {
  const [accounts, checkins, entries] = await Promise.all([
    rows<WealthAccountRow>(
      db,
      'SELECT * FROM wealth_accounts WHERE owner = ? ORDER BY sort_order, id',
      owner,
    ),
    rows<WealthCheckinRow>(
      db,
      'SELECT * FROM wealth_checkins WHERE owner = ? ORDER BY checkin_date DESC, id DESC',
      owner,
    ),
    db.prepare(
      `SELECT e.* FROM wealth_checkin_entries e
       JOIN wealth_checkins c ON c.id = e.checkin_id
       WHERE c.owner = ?`,
    )
      .bind(owner)
      .all<WealthCheckinEntryRow & { checkin_id: number }>()
      .then((r) => r.results ?? []),
  ])
  return { accounts, checkins, entries }
}

/** The owner's non-transaction tables, read concurrently, in the shape a dataset carries them. */
export async function loadReferenceTables(env: Env, owner: string): Promise<ReferenceTables> {
  const [
    categories,
    accounts,
    flagRows,
    labelRows,
    statements,
    cashActuals,
    settingsRow,
    scenarioRows,
    planRows,
    wealth,
  ] = await Promise.all([
    rows<CategoryRow>(
      env.DB,
      'SELECT * FROM categories WHERE owner = ? ORDER BY sort_order, id',
      owner,
    ),
    rows<AccountRow>(env.DB, 'SELECT * FROM accounts WHERE owner = ? ORDER BY id', owner),
    rows<FlagRow>(env.DB, 'SELECT * FROM flags WHERE owner = ? ORDER BY sort_order, id', owner),
    rows<LabelRow>(env.DB, 'SELECT * FROM labels WHERE owner = ? ORDER BY sort_order, id', owner),
    rows<StatementRow>(env.DB, 'SELECT * FROM account_statements WHERE owner = ?', owner),
    rows<CashActualRow>(env.DB, 'SELECT * FROM cash_actuals WHERE owner = ?', owner),
    env.DB.prepare('SELECT * FROM settings WHERE owner = ?').bind(owner).first<SettingsRow>(),
    rows<GoalScenarioRow>(
      env.DB,
      'SELECT * FROM goal_scenarios WHERE owner = ? ORDER BY sort_order, id',
      owner,
    ),
    rows<InstallmentPlanRow>(
      env.DB,
      'SELECT * FROM installment_plans WHERE owner = ? ORDER BY id',
      owner,
    ),
    wealthRows(env.DB, owner),
  ])

  return {
    categories: categories.map(toCategory),
    accounts: accounts.map(toAccount),
    flags: flagRows.map(toFlag),
    labels: labelRows.map(toLabel),
    accountStatements: statements.map(toStatement),
    cashActuals: cashActuals.map(toCashActual),
    installmentPlans: planRows.map(toInstallmentPlan),
    settings: settingsRow ? toSettings(settingsRow) : defaultExpenseSettings(),
    goalScenarios: scenarioRows.map(toGoalScenario),
    wealthAccounts: wealth.accounts.map(toWealthAccount),
    wealthCheckins: checkinsOf(wealth.checkins, wealth.entries),
  }
}
