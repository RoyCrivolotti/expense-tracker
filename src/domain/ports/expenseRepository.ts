import type {
  Account,
  AccountStatement,
  CashActual,
  Category,
  ExpenseDataset,
  ExpenseSettings,
  Flag,
  GoalInputs,
  TransactionAttachment,
  GoalScenario,
  InstallmentPlan,
  Transaction,
  WealthAccount,
  WealthCheckin,
} from '../types'
import type {
  AttachmentSource,
  BulkTransactionPatch,
  DeleteAccountOptions,
  DeleteAccountResult,
  DeleteCategoryOptions,
  DeleteCategoryResult,
  NewAccount,
  NewCategory,
  NewAttachment,
  NewFlag,
  NewGoalScenario,
  NewInstallmentPlan,
  NewTransaction,
  NewWealthAccount,
  NewWealthCheckin,
} from '../data/dataSource'

/** Persistence port — UI/API depend on this shape, not on D1 or any vendor SDK. */
export interface ExpenseRepository {
  loadDataset(owner: string): Promise<ExpenseDataset>
  listOwners(): Promise<string[]>
  insertTransaction(owner: string, input: NewTransaction): Promise<Transaction>
  updateTransaction(
    owner: string,
    id: number,
    patch: Partial<NewTransaction>,
  ): Promise<Transaction>
  deleteTransaction(owner: string, id: number): Promise<void>
  deleteTransactions(owner: string, ids: number[]): Promise<number>
  bulkUpdateTransactions(
    owner: string,
    ids: number[],
    patch: BulkTransactionPatch,
  ): Promise<Transaction[]>
  setStatementPaid(
    owner: string,
    accountId: number,
    yearMonth: string,
    paid: boolean,
    paidOn?: string,
  ): Promise<AccountStatement>
  setCashActual(owner: string, yearMonth: string, actualCashCents: number): Promise<CashActual>
  clearCashActual(owner: string, yearMonth: string): Promise<void>
  createCategory(owner: string, input: NewCategory): Promise<Category>
  updateCategory(owner: string, id: number, patch: Partial<NewCategory>): Promise<Category>
  deleteCategory(
    owner: string,
    id: number,
    options?: DeleteCategoryOptions,
  ): Promise<DeleteCategoryResult>
  createAccount(owner: string, input: NewAccount): Promise<Account>
  updateAccount(owner: string, id: number, patch: Partial<NewAccount>): Promise<Account>
  deleteAccount(
    owner: string,
    id: number,
    options?: DeleteAccountOptions,
  ): Promise<DeleteAccountResult>
  /**
   * Attachment metadata only. The bytes are the ReceiptStore port's job — the
   * two are deliberately separate so a missing R2 binding degrades to "no
   * receipts" instead of breaking every dataset read.
   */
  /** Ownership gate for attachment writes; the handler holds no SQL. */
  transactionExists(owner: string, id: number): Promise<boolean>
  listAttachments(owner: string, transactionId: number): Promise<TransactionAttachment[]>
  /**
   * What the serve route needs to stream one attachment. Returns null rather
   * than throwing so a miss and a foreign id are indistinguishable to the
   * caller — an attachment you do not own must look like one that is not there.
   */
  findAttachmentSource(owner: string, id: number): Promise<AttachmentSource | null>
  createAttachment(owner: string, input: NewAttachment): Promise<TransactionAttachment>
  /** Returns the R2 keys to delete, so the caller can clean up the bytes. */
  deleteAttachment(owner: string, id: number): Promise<{ objectKey: string; thumbKey?: string }>
  /**
   * R2 keys held by these transactions. Read before deleting them — the rows
   * carrying the keys go with the transaction.
   */
  attachmentKeysForTransactions(owner: string, transactionIds: number[]): Promise<string[]>
  /** Total bytes this owner is storing, for the quota check. */
  attachmentBytesUsed(owner: string): Promise<number>
  createFlag(owner: string, input: NewFlag): Promise<Flag>
  updateFlag(owner: string, id: number, patch: Partial<NewFlag>): Promise<Flag>
  /** Deletes the flag and clears it from its transactions in one batch. */
  deleteFlag(owner: string, id: number): Promise<{ unflagged: number }>
  updateSettings(owner: string, patch: Partial<ExpenseSettings>): Promise<ExpenseSettings>
  updateGoals(owner: string, patch: Partial<GoalInputs>): Promise<GoalInputs>
  createScenario(owner: string, input: NewGoalScenario): Promise<GoalScenario>
  updateScenario(
    owner: string,
    id: number,
    patch: Partial<NewGoalScenario>,
  ): Promise<GoalScenario>
  deleteScenario(owner: string, id: number): Promise<void>
  bulkInsertTransactions(owner: string, inputs: NewTransaction[]): Promise<Transaction[]>
  createInstallmentPlan(owner: string, input: NewInstallmentPlan): Promise<InstallmentPlan>
  updateInstallmentPlan(
    owner: string,
    id: number,
    patch: Partial<NewInstallmentPlan>,
  ): Promise<InstallmentPlan>
  deleteInstallmentPlan(owner: string, id: number): Promise<void>
  createWealthAccount(owner: string, input: NewWealthAccount): Promise<WealthAccount>
  updateWealthAccount(owner: string, id: number, patch: Partial<NewWealthAccount>): Promise<WealthAccount>
  deleteWealthAccount(owner: string, id: number): Promise<void>
  createWealthCheckin(owner: string, input: NewWealthCheckin): Promise<WealthCheckin>
  updateWealthCheckin(owner: string, id: number, patch: Partial<NewWealthCheckin>): Promise<WealthCheckin>
  deleteWealthCheckin(owner: string, id: number): Promise<void>
}
