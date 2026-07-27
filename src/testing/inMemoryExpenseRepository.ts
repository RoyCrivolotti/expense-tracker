import type {
  DeleteAccountOptions,
  DeleteAccountResult,
  DeleteCategoryOptions,
  DeleteCategoryResult,
  NewAccount,
  NewCategory,
  NewGoalScenario,
  NewInstallmentPlan,
  NewTransaction,
} from '../domain/data/dataSource'
import type { ExpenseRepository } from '../domain/ports/expenseRepository'
import { validateDueDay, validatePlanInput } from '../domain/application/installmentPlanService'
import { deriveStatus, deriveTransactions } from '../domain/engine/status'
import { defaultExpenseSettings, defaultGoalInputs } from '../domain/engine/defaults'
import type {
  Account,
  AccountStatement,
  CashActual,
  Category,
  ExpenseDataset,
  ExpenseSettings,
  GoalInputs,
  GoalScenario,
  InstallmentPlan,
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
  goalScenarios: GoalScenario[]
  installmentPlans: InstallmentPlan[]
}

const DEFAULT_SETTINGS: ExpenseSettings = defaultExpenseSettings()

const DEFAULT_GOALS: GoalInputs = defaultGoalInputs()

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
    goalScenarios: [...(seed.goalScenarios ?? [])],
    installmentPlans: [...(seed.installmentPlans ?? [])],
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

  function assertOwnedPlan(store: OwnerStore, planId: number): InstallmentPlan {
    const plan = store.installmentPlans.find((p) => p.id === planId)
    if (!plan) throw new RepoHttpError(400, 'Invalid planId')
    return plan
  }

  function createCategoryInStore(store: OwnerStore, input: NewCategory): Category {
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
    return category
  }

  function createAccountInStore(store: OwnerStore, input: NewAccount): Account {
    const account: Account = {
      id: nextId(store.accounts),
      name: input.name,
      kind: input.kind,
      settlement: input.settlement,
      active: input.active,
    }
    store.accounts.push(account)
    return account
  }

  function countCategoryUsage(store: OwnerStore, id: number): number {
    const txns = store.transactions.filter((t) => t.categoryId === id).length
    const plans = store.installmentPlans.filter((p) => p.categoryId === id).length
    return txns + plans
  }

  function countAccountUsage(store: OwnerStore, id: number): number {
    const txns = store.transactions.filter((t) => t.accountId === id).length
    const plans = store.installmentPlans.filter((p) => p.accountId === id).length
    const statements = store.statements.filter((s) => s.accountId === id).length
    return txns + plans + statements
  }

  function deleteCategoryInStore(
    store: OwnerStore,
    id: number,
    options?: DeleteCategoryOptions,
  ): DeleteCategoryResult {
    const { reassignToId, createCategory: createInput } = options ?? {}
    if (reassignToId != null && createInput) {
      throw new RepoHttpError(400, 'Specify either reassignToId or createCategory, not both')
    }

    if (reassignToId == null && !createInput) {
      const usage = countCategoryUsage(store, id)
      if (usage > 0) throw new RepoHttpError(409, `Category is in use by ${usage} record(s)`)
      const index = store.categories.findIndex((c) => c.id === id)
      if (index < 0) throw new RepoHttpError(404, 'Category not found')
      store.categories.splice(index, 1)
      return { reassignedToId: null }
    }

    let targetId: number
    let createdCategory: Category | undefined
    if (createInput) {
      createdCategory = createCategoryInStore(store, createInput)
      targetId = createdCategory.id
    } else {
      if (reassignToId === id) throw new RepoHttpError(400, 'Cannot reassign a category to itself')
      targetId = assertOwnedCategory(store, reassignToId!).id
    }

    const index = store.categories.findIndex((c) => c.id === id)
    if (index < 0) throw new RepoHttpError(404, 'Category not found')
    store.categories.splice(index, 1)
    store.transactions = store.transactions.map((t) =>
      t.categoryId === id ? { ...t, categoryId: targetId } : t,
    )
    store.installmentPlans = store.installmentPlans.map((p) =>
      p.categoryId === id ? { ...p, categoryId: targetId } : p,
    )
    return { reassignedToId: targetId, ...(createdCategory ? { createdCategory } : {}) }
  }

  /** Mirrors the D1 adapter: move (or clear) settings.defaultAccountId if it pointed at the deleted account. */
  function syncDefaultAccountId(store: OwnerStore, deletedId: number, newTargetId: number | null): void {
    if (store.settings.defaultAccountId !== deletedId) return
    store.settings = { ...store.settings, defaultAccountId: newTargetId }
  }

  function deleteAccountInStore(
    store: OwnerStore,
    id: number,
    options?: DeleteAccountOptions,
  ): DeleteAccountResult {
    const { reassignToId, createAccount: createInput } = options ?? {}
    if (reassignToId != null && createInput) {
      throw new RepoHttpError(400, 'Specify either reassignToId or createAccount, not both')
    }

    if (reassignToId == null && !createInput) {
      const usage = countAccountUsage(store, id)
      if (usage > 0) throw new RepoHttpError(409, `Account is in use by ${usage} record(s)`)
      const index = store.accounts.findIndex((a) => a.id === id)
      if (index < 0) throw new RepoHttpError(404, 'Account not found')
      store.accounts.splice(index, 1)
      syncDefaultAccountId(store, id, null)
      return { reassignedToId: null }
    }

    let targetId: number
    let createdAccount: Account | undefined
    if (createInput) {
      createdAccount = createAccountInStore(store, createInput)
      targetId = createdAccount.id
    } else {
      if (reassignToId === id) throw new RepoHttpError(400, 'Cannot reassign an account to itself')
      targetId = assertOwnedAccount(store, reassignToId!).id
    }

    const index = store.accounts.findIndex((a) => a.id === id)
    if (index < 0) throw new RepoHttpError(404, 'Account not found')
    store.accounts.splice(index, 1)
    store.transactions = store.transactions.map((t) =>
      t.accountId === id ? { ...t, accountId: targetId } : t,
    )
    store.installmentPlans = store.installmentPlans.map((p) =>
      p.accountId === id ? { ...p, accountId: targetId } : p,
    )
    // Mirror the D1 adapter: drop the source's statement for any month the target
    // already has one for (composite key can't hold both), then move the rest.
    const targetMonths = new Set(
      store.statements.filter((s) => s.accountId === targetId).map((s) => s.yearMonth),
    )
    store.statements = store.statements
      .filter((s) => !(s.accountId === id && targetMonths.has(s.yearMonth)))
      .map((s) => (s.accountId === id ? { ...s, accountId: targetId } : s))
    syncDefaultAccountId(store, id, targetId)
    return { reassignedToId: targetId, ...(createdAccount ? { createdAccount } : {}) }
  }

  /**
   * Resolve and validate the installment index for a plan-linked write. On
   * update, `excludeId` skips the row being saved so re-saving it at its own
   * index (or moving plans) is allowed.
   */
  function resolvePlanLink(
    store: OwnerStore,
    input: { planId?: number | null; installmentIndex?: number },
    excludeId?: number,
  ): { planId: number; installmentIndex: number } | null {
    if (input.planId == null) return null
    const plan = assertOwnedPlan(store, input.planId)
    const existing = store.transactions
      .filter(
        (t) =>
          t.planId === plan.id && typeof t.installmentIndex === 'number' && t.id !== excludeId,
      )
      .map((t) => t.installmentIndex as number)
    const nextIndex = existing.length > 0 ? Math.max(...existing) + 1 : plan.startInstallmentIndex
    const installmentIndex = input.installmentIndex ?? nextIndex
    if (existing.includes(installmentIndex)) {
      throw new RepoHttpError(400, 'Installment already recorded for this index')
    }
    return { planId: plan.id, installmentIndex }
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
    const planLink = resolvePlanLink(store, input)
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
      ...(planLink ?? {}),
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
        goalScenarios: [...store.goalScenarios],
        installmentPlans: [...store.installmentPlans],
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
      const { planId: nextPlanId, installmentIndex: nextIndex, ...rest } = patch
      let updated: StoredTransaction = { ...existing, ...rest, id: existing.id }
      if ('planId' in patch) {
        if (nextPlanId == null) {
          delete updated.planId
          delete updated.installmentIndex
        } else {
          const link = resolvePlanLink(
            store,
            { planId: nextPlanId, ...(nextIndex != null ? { installmentIndex: nextIndex } : {}) },
            id,
          )!
          updated = { ...updated, planId: link.planId, installmentIndex: link.installmentIndex }
        }
      }
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

    setStatementPaid: (owner, accountId, yearMonth, paid, paidOn) => {
      const store = storeFor(owner)
      assertOwnedAccount(store, accountId)
      if (paid && !paidOn) {
        return Promise.reject(new Error('paidOn is required when paid is true'))
      }
      const existing = store.statements.find(
        (s) => s.accountId === accountId && s.yearMonth === yearMonth,
      )
      if (existing) {
        existing.paid = paid
        if (paid && paidOn) existing.paidOn = paidOn
        else delete existing.paidOn
        return Promise.resolve({ ...existing })
      }
      const statement: AccountStatement = {
        accountId,
        yearMonth,
        paid,
        ...(paid && paidOn ? { paidOn } : {}),
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
      return Promise.resolve({ ...createCategoryInStore(store, input) })
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

    deleteCategory: (owner, id, options) => {
      const store = storeFor(owner)
      return Promise.resolve(deleteCategoryInStore(store, id, options))
    },

    createAccount: (owner, input) => {
      const store = storeFor(owner)
      return Promise.resolve({ ...createAccountInStore(store, input) })
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

    deleteAccount: (owner, id, options) => {
      const store = storeFor(owner)
      return Promise.resolve(deleteAccountInStore(store, id, options))
    },

    updateSettings: (owner, patch) => {
      const store = storeFor(owner)
      const keys = Object.keys(patch) as (keyof ExpenseSettings)[]
      if (keys.length === 0) throw new RepoHttpError(400, 'Empty patch')
      if (patch.defaultAccountId != null) assertOwnedAccount(store, patch.defaultAccountId)
      if (
        patch.budgetRolloverDay != null &&
        (!Number.isInteger(patch.budgetRolloverDay) ||
          patch.budgetRolloverDay < 1 ||
          patch.budgetRolloverDay > 28)
      ) {
        throw new RepoHttpError(400, 'budgetRolloverDay must be between 1 and 28')
      }
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

    createScenario: (owner, input) => {
      const store = storeFor(owner)
      if (!input.name?.trim()) throw new RepoHttpError(400, 'Scenario name is required')
      const scenario: GoalScenario = {
        id: nextId(store.goalScenarios),
        ...input,
        name: input.name.trim(),
      }
      store.goalScenarios.push(scenario)
      return Promise.resolve({ ...scenario })
    },

    updateScenario: (owner, id, patch) => {
      const store = storeFor(owner)
      const index = store.goalScenarios.findIndex((s) => s.id === id)
      if (index < 0) throw new RepoHttpError(404, 'Scenario not found')
      const keys = Object.keys(patch) as (keyof NewGoalScenario)[]
      if (keys.length === 0) throw new RepoHttpError(400, 'Empty patch')
      const updated = { ...store.goalScenarios[index]!, ...patch, id }
      store.goalScenarios[index] = updated
      return Promise.resolve({ ...updated })
    },

    deleteScenario: (owner, id) => {
      const store = storeFor(owner)
      const index = store.goalScenarios.findIndex((s) => s.id === id)
      if (index < 0) throw new RepoHttpError(404, 'Scenario not found')
      store.goalScenarios.splice(index, 1)
      return Promise.resolve()
    },

    createInstallmentPlan: (owner, input) => {
      const store = storeFor(owner)
      const validated = validatePlanInput(input)
      assertOwnedAccount(store, validated.accountId)
      assertOwnedCategory(store, validated.categoryId)
      const { dueDayOfMonth, ...rest } = validated
      const plan: InstallmentPlan = {
        id: nextId(store.installmentPlans),
        ...rest,
        ...(dueDayOfMonth != null ? { dueDayOfMonth } : {}),
      }
      store.installmentPlans.push(plan)
      return Promise.resolve({ ...plan })
    },

    updateInstallmentPlan: (owner, id, patch) => {
      const store = storeFor(owner)
      const index = store.installmentPlans.findIndex((p) => p.id === id)
      if (index < 0) throw new RepoHttpError(404, 'Installment plan not found')
      const keys = Object.keys(patch) as (keyof NewInstallmentPlan)[]
      if (keys.length === 0) throw new RepoHttpError(400, 'Empty patch')
      validateDueDay(patch.dueDayOfMonth)
      if (patch.accountId != null) assertOwnedAccount(store, patch.accountId)
      if (patch.categoryId != null) assertOwnedCategory(store, patch.categoryId)
      const { dueDayOfMonth, ...rest } = patch
      const updated: InstallmentPlan = { ...store.installmentPlans[index]!, ...rest, id }
      if ('dueDayOfMonth' in patch) {
        if (dueDayOfMonth != null) updated.dueDayOfMonth = dueDayOfMonth
        else delete updated.dueDayOfMonth
      }
      store.installmentPlans[index] = updated
      return Promise.resolve({ ...updated })
    },

    deleteInstallmentPlan: (owner, id) => {
      const store = storeFor(owner)
      const index = store.installmentPlans.findIndex((p) => p.id === id)
      if (index < 0) throw new RepoHttpError(404, 'Installment plan not found')
      store.installmentPlans.splice(index, 1)
      // Mirror the D1 adapter: no FK on plan_id, so unlink transactions instead
      // of leaving them pointing at a deleted plan.
      store.transactions = store.transactions.map((t) => {
        if (t.planId !== id) return t
        const copy: StoredTransaction = { ...t }
        delete copy.planId
        delete copy.installmentIndex
        return copy
      })
      return Promise.resolve()
    },
  }
}
