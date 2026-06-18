/**
 * Parse the Numbers CSV export into a normalized ExpenseDataset. Summary sheets
 * (monthly totals, yearly overview, live goal calcs) are ignored — those are
 * recomputed by the engine. Only facts are read: settings, categories, accounts,
 * transactions, statement paid flags, and goal inputs.
 */
import type { Account, Category, ExpenseDataset, StoredTransaction, TxnType } from '../types'
import { parseEuroToCents } from '../engine/money'
import { budgetMonthFromName, parseHumanDate } from '../engine/dates'
import { deriveTransactions } from '../engine/status'
import {
  WORKBOOK_YEAR,
  parseAccounts,
  parseCashActuals,
  parseCategories,
  parseGoalInputs,
  parseSettings,
  parseStatements,
  splitLine,
} from './csvSections'

const TYPE_MAP: Record<string, TxnType> = {
  expense: 'expense',
  income: 'income',
  investment: 'investment',
  refund: 'refund',
}

interface Lookups {
  categoryByName: Map<string, Category>
  accountByName: Map<string, Account>
  categories: Category[]
}

function categoryId(name: string, lookups: Lookups): number {
  const existing = lookups.categoryByName.get(name)
  if (existing) return existing.id
  const created: Category = {
    id: lookups.categories.length + 1,
    name,
    monthlyBudgetCents: 0,
    sortOrder: 100 + lookups.categories.length,
    active: true,
  }
  lookups.categories.push(created)
  lookups.categoryByName.set(name, created)
  return created.id
}

function at(fields: string[], index: number): string {
  return fields[index] ?? ''
}

function parseTxnRow(fields: string[], id: number, lookups: Lookups): StoredTransaction | null {
  const date = parseHumanDate(at(fields, 1))
  const budgetMonth = budgetMonthFromName(at(fields, 0), WORKBOOK_YEAR)
  const account = lookups.accountByName.get(at(fields, 3))
  const type = TYPE_MAP[at(fields, 5).toLowerCase()]
  if (!date || !budgetMonth || !account || !type) return null
  const amountCents = parseEuroToCents(at(fields, 6))
  if (amountCents === 0) return null
  const notes = at(fields, 8)
  return {
    id,
    date,
    budgetMonth,
    description: at(fields, 2),
    accountId: account.id,
    categoryId: categoryId(at(fields, 4) || 'Other', lookups),
    type,
    amountCents,
    cancelled: at(fields, 7).toLowerCase() === 'cancelled',
    ...(notes ? { notes } : {}),
  }
}

function parseTransactions(rows: string[][], lookups: Lookups): StoredTransaction[] {
  const start = rows.findIndex((f) => f[0] === 'Budget Month' && f[1] === 'Date')
  if (start < 0) return []
  const transactions: StoredTransaction[] = []
  let id = 1
  for (let i = start + 1; i < rows.length; i++) {
    const fields = rows[i]!
    if (!fields[0]) break // blank row / filler marks the end of the ledger
    const txn = parseTxnRow(fields, id, lookups)
    if (txn) {
      transactions.push(txn)
      id += 1
    }
  }
  return transactions
}

/** Parse the full CSV text into a normalized, status-derived dataset. */
export function parseWorkbookCsv(text: string): ExpenseDataset {
  const rows = text.split(/\r?\n/).map(splitLine)

  const categories = parseCategories(rows)
  const accounts = parseAccounts(rows)
  const lookups: Lookups = {
    categories,
    categoryByName: new Map(categories.map((c) => [c.name, c])),
    accountByName: new Map(accounts.map((a) => [a.name, a])),
  }

  const stored = parseTransactions(rows, lookups)
  const accountStatements = parseStatements(rows, accounts)

  return {
    categories: lookups.categories,
    accounts,
    transactions: deriveTransactions(stored, accounts, accountStatements),
    accountStatements,
    cashActuals: parseCashActuals(rows),
    goalInputs: parseGoalInputs(rows),
    settings: parseSettings(rows),
  }
}
