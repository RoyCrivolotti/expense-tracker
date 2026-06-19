import type { ExpenseDataset } from '@domain/types'
import { deriveTransactions } from '@domain/engine/status'
import type { Env } from './env'
import {
  toAccount,
  toCashActual,
  toCategory,
  toGoalInputs,
  toSettings,
  toStatement,
  toStoredTxn,
  type AccountRow,
  type CashActualRow,
  type CategoryRow,
  type GoalRow,
  type SettingsRow,
  type StatementRow,
  type TxnRow,
} from './rows'

async function rows<T>(db: D1Database, sql: string, owner: string): Promise<T[]> {
  const result = await db.prepare(sql).bind(owner).all<T>()
  return result.results ?? []
}

/** Read every table for one owner and assemble a dataset with derived statuses. */
export async function loadDataset(env: Env, owner: string): Promise<ExpenseDataset> {
  const [categories, accounts, txns, statements, cashActuals, settingsRow, goalRow] =
    await Promise.all([
      rows<CategoryRow>(
        env.DB,
        'SELECT * FROM categories WHERE owner = ? ORDER BY sort_order, id',
        owner,
      ),
      rows<AccountRow>(env.DB, 'SELECT * FROM accounts WHERE owner = ? ORDER BY id', owner),
      rows<TxnRow>(
        env.DB,
        'SELECT * FROM transactions WHERE owner = ? ORDER BY date DESC, id DESC',
        owner,
      ),
      rows<StatementRow>(env.DB, 'SELECT * FROM account_statements WHERE owner = ?', owner),
      rows<CashActualRow>(env.DB, 'SELECT * FROM cash_actuals WHERE owner = ?', owner),
      env.DB.prepare('SELECT * FROM settings WHERE owner = ?').bind(owner).first<SettingsRow>(),
      env.DB.prepare('SELECT * FROM goal_inputs WHERE owner = ?').bind(owner).first<GoalRow>(),
    ])

  const mappedAccounts = accounts.map(toAccount)
  const mappedStatements = statements.map(toStatement)
  const stored = txns.map(toStoredTxn)

  return {
    categories: categories.map(toCategory),
    accounts: mappedAccounts,
    transactions: deriveTransactions(stored, mappedAccounts, mappedStatements),
    accountStatements: mappedStatements,
    cashActuals: cashActuals.map(toCashActual),
    settings: settingsRow
      ? toSettings(settingsRow)
      : {
          openingCashCents: 0,
          openingInvestmentCents: 0,
          liquidNetWorthCents: 0,
          defaultAccountId: null,
        },
    goalInputs: goalRow
      ? toGoalInputs(goalRow)
      : {
          housePriceCents: 0,
          downPaymentFraction: 0,
          mortgageTermYears: 0,
          mortgageRateAnnual: 0,
          longTermTargetCents: 0,
          horizonYears: 0,
          expectedRealReturn: 0,
        },
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
