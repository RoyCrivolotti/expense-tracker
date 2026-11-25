import { defaultExpenseSettings } from '../domain/engine/defaults'
import { deriveStatus, deriveTransactions } from '../domain/engine/status'
import type { ExpenseRepository } from '../domain/ports/expenseRepository'
import type {
  Account,
  AccountStatement,
  CashActual,
  Category,
  ExpenseDataset,
  ExpenseSettings,
  Flag,
  GoalScenario,
  InstallmentPlan,
  Label,
  StoredTransaction,
  Transaction,
  TransactionAttachment,
  WealthAccount,
  WealthCheckin,
} from '../domain/types'

export type ExpenseRepositorySeed = Partial<ExpenseDataset> & {
  /**
   * Pre-existing transaction_labels link rows. ExpenseDataset has no field for
   * this — a label a transaction already carries only shows up as that
   * transaction's `labelIds` — so a seed that wants to start from a transaction
   * already linked to a label (rather than one that picks the link up during
   * the behavior under test) has to go through this instead. A `labelIds` on a
   * seeded `Transaction` itself is informational only; `emptyStore` strips it,
   * exactly like the `status` D1 would also derive rather than trust.
   */
  transactionLabels?: { transactionId: number; labelId: number }[]
}

export interface OwnerStore {
  categories: Category[]
  accounts: Account[]
  flags: Flag[]
  labels: Label[]
  /** transaction_labels' in-memory shape: a plain link list, no surrogate id needed here. */
  transactionLabels: { transactionId: number; labelId: number }[]
  attachments: TransactionAttachment[]
  transactions: StoredTransaction[]
  statements: AccountStatement[]
  cashActuals: CashActual[]
  settings: ExpenseSettings
  goalScenarios: GoalScenario[]
  installmentPlans: InstallmentPlan[]
  wealthAccounts: WealthAccount[]
  wealthCheckins: WealthCheckin[]
}

const DEFAULT_SETTINGS: ExpenseSettings = defaultExpenseSettings()

/** Every stored transaction with the status and label ids D1 would hand back with it. */
export function derivedTransactions(store: OwnerStore): Transaction[] {
  return deriveTransactions(store.transactions, store.accounts, store.statements).map((t) => ({
    ...t,
    labelIds: store.transactionLabels.filter((tl) => tl.transactionId === t.id).map((tl) => tl.labelId),
  }))
}

export function nextId(items: { id: number }[]): number {
  return items.reduce((max, item) => Math.max(max, item.id), 0) + 1
}

export function ownerKey(owner: string): string {
  return owner.trim().toLowerCase()
}

export function deriveOne(
  stored: StoredTransaction,
  accounts: Account[],
  statements: AccountStatement[],
  transactionLabels: { transactionId: number; labelId: number }[],
): Transaction {
  const account = accounts.find((a) => a.id === stored.accountId)
  const status = account ? deriveStatus(stored, account, statements) : 'posted'
  const labelIds = transactionLabels.filter((tl) => tl.transactionId === stored.id).map((tl) => tl.labelId)
  // Set last so it always wins over anything spread in from `stored` — a seeded
  // transaction can carry a stray `labelIds` (seeding is Partial<ExpenseDataset>,
  // and a Transaction literal may include it), but this store's own
  // transactionLabels list, not that field, is the source of truth.
  return { ...stored, status, labelIds }
}

/**
 * Copy a seeded collection, or start empty. Extracted so emptyStore reads as the
 * straight mapping it is — inline `?? []` on every field counted as a dozen
 * branches against the complexity budget for no real decision-making.
 */
function list<T>(seeded: readonly T[] | undefined): T[] {
  return [...(seeded ?? [])]
}

export function emptyStore(seed: ExpenseRepositorySeed = {}): OwnerStore {
  return {
    categories: list(seed.categories),
    accounts: list(seed.accounts),
    flags: list(seed.flags),
    labels: list(seed.labels),
    transactionLabels: list(seed.transactionLabels),
    attachments: list(seed.attachments),
    // A seeded transaction's own `labelIds` is dropped here, not read: the
    // store's source of truth for which labels a transaction carries is
    // `transactionLabels` above, seeded through the dedicated field instead.
    transactions: (seed.transactions ?? []).map(({ status: _status, labelIds: _labelIds, ...stored }) => stored),
    statements: list(seed.accountStatements),
    cashActuals: list(seed.cashActuals),
    settings: { ...DEFAULT_SETTINGS, ...seed.settings },
    goalScenarios: list(seed.goalScenarios),
    installmentPlans: list(seed.installmentPlans),
    wealthAccounts: list(seed.wealthAccounts),
    wealthCheckins: list(seed.wealthCheckins),
  }
}

/** The rows one owner has, and what every area of the repository reads and writes them through. */
export interface InMemoryState {
  stores: Map<string, OwnerStore>
  /**
   * R2 keys are not part of the domain type, but the adapter returns them on
   * delete, so the double has to remember them to mirror that contract.
   *
   * Keyed by owner *and* id: attachment ids are generated per owner here, so two
   * owners' first attachment are both id 1, and a map keyed on id alone let the
   * second overwrite the first — the double would then hand owner A's row with
   * owner B's keys. Real D1 cannot do that (AUTOINCREMENT is global), but a
   * double that breaks tenancy is not mirroring the thing it exists to mirror.
   */
  keysById: Map<string, { objectKey: string; thumbKey?: string }>
  keyOf: (
    owner: string,
    id: number,
  ) => string
  storeFor: (owner: string) => OwnerStore
  datasetOf: (owner: string) => ExpenseDataset
}

/** One method of the port, taking the state first. */
export type Op<K extends keyof ExpenseRepository> = (
  state: InMemoryState,
  ...args: Parameters<ExpenseRepository[K]>
) => ReturnType<ExpenseRepository[K]>

/** Binds the state to an operation, so an area is a table of names. */
export function using<A extends unknown[], R>(
  state: InMemoryState,
  operation: (
    state: InMemoryState,
    ...args: A
  ) => R,
): (...args: A) => R {
  return (...args) => operation(state, ...args)
}

export function createState(
  seed: ExpenseRepositorySeed,
  seedOwner: string,
): InMemoryState {
  const stores = new Map<string, OwnerStore>()
  const keysById = new Map<string, { objectKey: string; thumbKey?: string }>()
  const keyOf = (
    owner: string,
    id: number,
  ) => `${owner}#${id}`
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

  function datasetOf(owner: string): ExpenseDataset {
    const store = storeFor(owner)
    return {
      categories: [...store.categories],
      accounts: [...store.accounts],
      flags: [...store.flags],
      labels: [...store.labels],
      attachments: [...store.attachments],
      transactions: derivedTransactions(store),
      accountStatements: [...store.statements],
      cashActuals: [...store.cashActuals],
      settings: { ...store.settings },
      goalScenarios: [...store.goalScenarios],
      installmentPlans: [...store.installmentPlans],
      wealthAccounts: [...store.wealthAccounts],
      wealthCheckins: store.wealthCheckins.map((c) => ({ ...c, entries: [...c.entries] })),
    }
  }

  return { stores, keysById, keyOf, storeFor, datasetOf }
}
