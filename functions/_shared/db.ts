import type { ExpenseDataset, WealthCheckin } from '../domain/types'
import { deriveTransactions } from '../domain/engine/status'
import { defaultExpenseSettings, defaultGoalInputs } from '../domain/engine/defaults'
import type { Env } from './env'
import {
  toAccount,
  toCashActual,
  toAttachment,
  toCategory,
  toFlag,
  toGoalInputs,
  toGoalScenario,
  toInstallmentPlan,
  toSettings,
  toStatement,
  toStoredTxn,
  toWealthAccount,
  toWealthCheckin,
  toWealthCheckinEntry,
  type AccountRow,
  type CashActualRow,
  type AttachmentRow,
  type CategoryRow,
  type FlagRow,
  type GoalRow,
  type GoalScenarioRow,
  type InstallmentPlanRow,
  type SettingsRow,
  type StatementRow,
  type TxnRow,
  type WealthAccountRow,
  type WealthCheckinEntryRow,
  type WealthCheckinRow,
} from './rows'

async function rows<T>(db: D1Database, sql: string, owner: string): Promise<T[]> {
  const result = await db.prepare(sql).bind(owner).all<T>()
  return result.results ?? []
}

/** Read every table for one owner and assemble a dataset with derived statuses. */
export async function loadDataset(env: Env, owner: string): Promise<ExpenseDataset> {
  const [
    categories,
    accounts,
    flagRows,
    attachmentRows,
    txns,
    statements,
    cashActuals,
    settingsRow,
    goalRow,
    scenarioRows,
    planRows,
    wealthAccountRows,
    wealthCheckinRows,
    wealthCheckinEntryRows,
  ] = await Promise.all([
    rows<CategoryRow>(
      env.DB,
      'SELECT * FROM categories WHERE owner = ? ORDER BY sort_order, id',
      owner,
    ),
    rows<AccountRow>(env.DB, 'SELECT * FROM accounts WHERE owner = ? ORDER BY id', owner),
    rows<FlagRow>(env.DB, 'SELECT * FROM flags WHERE owner = ? ORDER BY sort_order, id', owner),
    // Metadata only — the bytes are fetched by URL from /api/expenses/attachments/:id.
    rows<AttachmentRow>(
      env.DB,
      'SELECT * FROM transaction_attachments WHERE owner = ? ORDER BY transaction_id, id',
      owner,
    ),
    rows<TxnRow>(
      env.DB,
      'SELECT * FROM transactions WHERE owner = ? ORDER BY date DESC, id DESC',
      owner,
    ),
    rows<StatementRow>(env.DB, 'SELECT * FROM account_statements WHERE owner = ?', owner),
    rows<CashActualRow>(env.DB, 'SELECT * FROM cash_actuals WHERE owner = ?', owner),
    env.DB.prepare('SELECT * FROM settings WHERE owner = ?').bind(owner).first<SettingsRow>(),
    env.DB.prepare('SELECT * FROM goal_inputs WHERE owner = ?').bind(owner).first<GoalRow>(),
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
    rows<WealthAccountRow>(
      env.DB,
      'SELECT * FROM wealth_accounts WHERE owner = ? ORDER BY sort_order, id',
      owner,
    ),
    rows<WealthCheckinRow>(
      env.DB,
      'SELECT * FROM wealth_checkins WHERE owner = ? ORDER BY checkin_date DESC, id DESC',
      owner,
    ),
    // Load all entries for this owner in one query; keyed by checkin_id below.
    env.DB.prepare(
      `SELECT e.* FROM wealth_checkin_entries e
       JOIN wealth_checkins c ON c.id = e.checkin_id
       WHERE c.owner = ?`,
    )
      .bind(owner)
      .all<WealthCheckinEntryRow & { checkin_id: number }>()
      .then((r) => r.results ?? []),
  ])

  const mappedAccounts = accounts.map(toAccount)
  const mappedStatements = statements.map(toStatement)
  const stored = txns.map(toStoredTxn)

  // Group entries by checkin_id for O(1) lookup when assembling checkins.
  const entriesByCheckin = new Map<number, WealthCheckinEntryRow[]>()
  for (const e of wealthCheckinEntryRows) {
    const list = entriesByCheckin.get(e.checkin_id) ?? []
    list.push(e)
    entriesByCheckin.set(e.checkin_id, list)
  }

  const wealthCheckins: WealthCheckin[] = wealthCheckinRows.map((c) =>
    toWealthCheckin(c, (entriesByCheckin.get(c.id) ?? []).map(toWealthCheckinEntry)),
  )

  return {
    categories: categories.map(toCategory),
    accounts: mappedAccounts,
    flags: flagRows.map(toFlag),
    attachments: attachmentRows.map(toAttachment),
    transactions: deriveTransactions(stored, mappedAccounts, mappedStatements),
    accountStatements: mappedStatements,
    cashActuals: cashActuals.map(toCashActual),
    installmentPlans: planRows.map(toInstallmentPlan),
    settings: settingsRow ? toSettings(settingsRow) : defaultExpenseSettings(),
    goalInputs: goalRow ? toGoalInputs(goalRow) : defaultGoalInputs(),
    goalScenarios: scenarioRows.map(toGoalScenario),
    wealthAccounts: wealthAccountRows.map(toWealthAccount),
    wealthCheckins,
  }
}

/** Distinct owner emails that have rows in D1 (used by scheduled backups). */
export async function listOwners(env: Env): Promise<string[]> {
  const result = await env.DB.prepare(
    `SELECT owner FROM (
       SELECT owner FROM transactions
       UNION
       SELECT owner FROM categories
       UNION
       SELECT owner FROM settings
     ) GROUP BY owner ORDER BY owner`,
  ).all<{ owner: string }>()
  return (result.results ?? []).map((r) => r.owner).filter(Boolean)
}
