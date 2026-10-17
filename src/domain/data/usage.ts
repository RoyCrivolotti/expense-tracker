/** How many records point at a category, account, flag or label: what decides delete against reassign. */
export interface CategoryUsage {
  id: number
  /** Transactions of any status, cancelled ones included. */
  transactions: number
  /** Instalment plans. */
  plans: number
}

export interface AccountUsage {
  id: number
  transactions: number
  plans: number
  /** Month statements (paid or not) kept for the account. */
  statements: number
}

export interface FlagUsage {
  id: number
  transactions: number
}

export interface LabelUsage {
  id: number
  /** Transactions carrying the label, each once. */
  transactions: number
}

/** Every record of the owner, with zero counts included, each list in ascending order of id. */
export interface Usage {
  categories: CategoryUsage[]
  accounts: AccountUsage[]
  flags: FlagUsage[]
  labels: LabelUsage[]
}
