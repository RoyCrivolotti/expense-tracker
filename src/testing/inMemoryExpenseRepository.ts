import type { NewAccount, NewCategory, NewTransaction } from '../domain/data/dataSource'
import type { ExpenseRepository } from '../domain/ports/expenseRepository'
import { deriveStatus, deriveTransactions } from '../domain/engine/status'
import type {
  Account,
  AccountStatement,
  CashActual,
  Category,
  ExpenseDataset,
  ExpenseSettings,
  GoalInputs,
  StoredTransaction,
  Transaction,
} from '../domain/types'
import { RepoHttpError } from './repoHttpError'

export type ExpenseRepositorySeed = Partial<ExpenseDataset>

interface OwnerStore {
  categories: Category[]
  accounts: Account[]
  transactions: StoredTransaction[]
  statements: AccountStatement[]
  cashActuals: CashActual[]
  settings: ExpenseSettings
  goalInputs: GoalInputs
}

const DEFAULT_SETTINGS: ExpenseSettings = {
  openingCashCents: 0,
  openingInvestmentCents: 0,
  liquidNetWorthCents: 0,
  defaultAccountId: null,
}

const DEFAULT_GOALS: GoalInputs = {
  housePriceCents: 0,
  downPaymentFraction: 0,
  mortgageTermYears: 0,
  mortgageRateAnnual: 0,
  longTermTargetCents: 0,
  horizonYears: 0,
  expectedRealReturn: 0,
}

function nextId(items: { id: number }[]): number {
  return items.reduce((max, item) => Math.max(max, item.id), 0) + 1
}

function ownerKey(owner: string): string {
  return owner.trim().toLowerCase()
}

function deriveOne(
  stored: StoredTransaction,
  accounts: Account[],
  statements: AccountStatement[],
): Transaction {
  const account = accounts.find((a) => a.id === stored.accountId)
  const status = account ? deriveStatus(stored, account, statements) : 'posted'
  return { ...stored, status }
}

function emptyStore(seed: ExpenseRepositorySeed = {}): OwnerStore {
  return {
    categories: [...(seed.categories ?? [])],
    accounts: [...(seed.accounts ?? [])],
    transactions: (seed.transactions ?? []).map(({ status: _status, ...stored }) => stored),
    statements: [...(seed.accountStatements ?? [])],
    cashActuals: [...(seed.cashActuals ?? [])],
    settings: { ...DEFAULT_SETTINGS, ...seed.settings },
    goalInputs: { ...DEFAULT_GOALS, ...seed.goalInputs },
  }
}

export function inMemoryExpenseRepository(
  seed: ExpenseRepositorySeed = {},
  seedOwner = 'owner@example.com',
): ExpenseRepository {
  const stores = new Map<string, OwnerStore>()
  stores.set(ownerKey(seedOwner), emptyStore(seed))

  function storeFor(owner: string): OwnerStore {
    const key = ownerKey(owner)
    let store = stores.get(key)
    if (!store) {
      store = emptyStore()
      stores.set(key, store)
    }
    return store
  }

  function assertOwnedAccount(store: OwnerStore, accountId: number): Account {
    const account = store.accounts.find((a) => a.id === accountId)
    if (!account) throw new RepoHttpError(400, 'Invalid accountId')
    return account
  }

  function assertOwnedCategory(store: OwnerStore, categoryId: number): Category {
    const category = store.categories.find((c) => c.id === categoryId)
    if (!category) throw new RepoHttpError(400, 'Invalid categoryId')
    return category
  }

  function findStored(store: OwnerStore, id: number): StoredTransaction {
    const txn = store.transactions.find((row) => row.id === id)
    if (!txn) throw new RepoHttpError(404, 'Transaction not found')
    return txn
  }

  function insertOne(owner: string, input: NewTransaction): Transaction {
    const store = storeFor(owner)
    assertOwnedAccount(store, input.accountId)
    assertOwnedCategory(store, input.categoryId)
    const stored: StoredTransaction = {
      id: nextId(store.transactions),
      date: input.date,
      budgetMonth: input.budgetMonth,
      description: input.description,
      accountId: input.accountId,
      categoryId: input.categoryId,
      type: input.type,
      amountCents: input.amountCents,
      cancelled: input.cancelled,
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    }
    store.transactions.push(stored)
    return deriveOne(stored, store.accounts, store.statements)
  }

  return {
    loadDataset: (owner) => {
      const store = storeFor(owner)
      return Promise.resolve({
        categories: [...store.categories],
        accounts: [...store.accounts],
        transactions: deriveTransactions(store.transactions, store.accounts, store.statements),
        accountStatements: [...store.statements],
        cashActuals: [...store.cashActuals],
        settings: { ...store.settings },
        goalInputs: { ...store.goalInputs },
      })
    },

    listOwners: () => Promise.resolve([...stores.keys()]),

    insertTransaction: (owner, input) => Promise.resolve(insertOne(owner, input)),

    bulkInsertTransactions: (owner, inputs) =>
      Promise.resolve(inputs.map((input) => insertOne(owner, input))),

    updateTransaction: (owner, id, patch) => {
      const store = storeFor(owner)
      const existing = findStored(store, id)
      if (patch.accountId != null) assertOwnedAccount(store, patch.accountId)
      if (patch.categoryId != null) assertOwnedCategory(store, patch.categoryId)
      const keys = Object.keys(patch) as (keyof NewTransaction)[]
      if (keys.length === 0) throw new RepoHttpError(400, 'Empty patch')
      const updated: StoredTransaction = { ...existing, ...patch, id: existing.id }
      const index = store.transactions.findIndex((row) => row.id === id)
      store.transactions[index] = updated
      return Promise.resolve(deriveOne(updated, store.accounts, store.statements))
    },

    deleteTransaction: (owner, id) => {
      const store = storeFor(owner)
      const index = store.transactions.findIndex((row) => row.id === id)
      if (index < 0) throw new RepoHttpError(404, 'Transaction not found')
      store.transactions.splice(index, 1)
      return Promise.resolve()
    },

    deleteTransactions: (owner, ids) => {
      const store = storeFor(owner)
      const idSet = new Set(ids)
      const before = store.transactions.length
      store.transactions = store.transactions.filter((row) => !idSet.has(row.id))
      return Promise.resolve(before - store.transactions.length)
    },

    setStatementPaid: (owner, accountId, yearMonth, paid) => {
      const store = storeFor(owner)
      assertOwnedAccount(store, accountId)
      const existing = store.statements.find(
        (s) => s.accountId === accountId && s.yearMonth === yearMonth,
      )
      const paidOn = paid ? new Date().toISOString().slice(0, 10) : undefined
      if (existing) {
        existing.paid = paid
        if (paidOn) existing.paidOn = paidOn
        else delete existing.paidOn
        return Promise.resolve({ ...existing })
      }
      const statement: AccountStatement = {
        accountId,
        yearMonth,
        paid,
        ...(paidOn ? { paidOn } : {}),
      }
      store.statements.push(statement)
      return Promise.resolve({ ...statement })
    },

    setCashActual: (owner, yearMonth, actualCashCents) => {
      const store = storeFor(owner)
      const existing = store.cashActuals.find((c) => c.yearMonth === yearMonth)
      if (existing) {
        existing.actualCashCents = actualCashCents
        return Promise.resolve({ ...existing })
      }
      const row: CashActual = { yearMonth, actualCashCents }
      store.cashActuals.push(row)
      return Promise.resolve({ ...row })
    },

    clearCashActual: (owner, yearMonth) => {
      const store = storeFor(owner)
      store.cashActuals = store.cashActuals.filter((c) => c.yearMonth !== yearMonth)
      return Promise.resolve()
    },

    createCategory: (owner, input) => {
      const store = storeFor(owner)
      const category: Category = {
        id: nextId(store.categories),
        name: input.name,
        monthlyBudgetCents: input.monthlyBudgetCents,
        sortOrder: input.sortOrder,
        active: input.active,
        ...(input.icon !== undefined ? { icon: input.icon } : {}),
        ...(input.color !== undefined ? { color: input.color } : {}),
      }
      store.categories.push(category)
      return Promise.resolve({ ...category })
    },

    updateCategory: (owner, id, patch) => {
      const store = storeFor(owner)
      const index = store.categories.findIndex((c) => c.id === id)
      if (index < 0) throw new RepoHttpError(404, 'Category not found')
      const keys = Object.keys(patch) as (keyof NewCategory)[]
      if (keys.length === 0) throw new RepoHttpError(400, 'Empty patch')
      const updated = { ...store.categories[index]!, ...patch, id }
      store.categories[index] = updated
      return Promise.resolve({ ...updated })
    },

    createAccount: (owner, input) => {
      const store = storeFor(owner)
      const account: Account = {
        id: nextId(store.accounts),
        name: input.name,
        kind: input.kind,
        settlement: input.settlement,
        active: input.active,
      }
      store.accounts.push(account)
      return Promise.resolve({ ...account })
    },

    updateAccount: (owner, id, patch) => {
      const store = storeFor(owner)
      const index = store.accounts.findIndex((a) => a.id === id)
      if (index < 0) throw new RepoHttpError(404, 'Account not found')
      const keys = Object.keys(patch) as (keyof NewAccount)[]
      if (keys.length === 0) throw new RepoHttpError(400, 'Empty patch')
      const updated = { ...store.accounts[index]!, ...patch, id }
      store.accounts[index] = updated
      return Promise.resolve({ ...updated })
    },

    updateSettings: (owner, patch) => {
      const store = storeFor(owner)
      const keys = Object.keys(patch) as (keyof ExpenseSettings)[]
      if (keys.length === 0) throw new RepoHttpError(400, 'Empty patch')
      if (patch.defaultAccountId != null) assertOwnedAccount(store, patch.defaultAccountId)
      store.settings = { ...store.settings, ...patch }
      return Promise.resolve({ ...store.settings })
    },

    updateGoals: (owner, patch) => {
      const store = storeFor(owner)
      const keys = Object.keys(patch) as (keyof GoalInputs)[]
      if (keys.length === 0) throw new RepoHttpError(400, 'Empty patch')
      store.goalInputs = { ...store.goalInputs, ...patch }
      return Promise.resolve({ ...store.goalInputs })
    },
  }
}
