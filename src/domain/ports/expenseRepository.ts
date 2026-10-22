import type {
  Account,
  AccountStatement,
  CashActual,
  Category,
  ExpenseDataset,
  ExpenseSettings,
  Flag,
  Label,
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
  NewLabel,
  NewTransaction,
  NewWealthAccount,
  NewWealthCheckin,
} from '../data/dataSource'
import type {
  TransactionPage,
  TransactionPageRequest,
  TransactionSummary,
} from '../data/transactionQuery'
import type { DescriptionSuggestRequest, DescriptionSuggestResult } from '../data/descriptionSuggest'
import type { Usage } from '../data/usage'
import type { RecurringSeries } from '../engine/recurringSeries'
import type { TxnFilter } from '../engine/transactions'
import type { BulkTarget, FilterTarget } from '../data/bulkEdit'
import type { ExportChunk, ExportChunkRequest } from '../data/exportTables'
import type { LedgerReferenceRead, MonthRange, MonthRowsRead } from '../data/ledgerParts'
import type { MonthCell } from '../ledger/types'

/** Persistence port — UI/API depend on this shape, not on D1 or any vendor SDK. */
export interface ExpenseRepository {
  loadDataset(owner: string): Promise<ExpenseDataset>
  listOwners(): Promise<string[]>
  /**
   * One page of the owner's transactions that match `filter`, in `date DESC, id DESC` order, with the
   * status and `labelIds` the dataset carries. The reference for what matches is `filterTransactions`
   * in the engine; statement-payment rows are synthesized on the client and are not part of this.
   * Paging is by position, not offset, so rows inserted or deleted between pages never repeat or
   * hide a row that was there throughout.
   */
  queryTransactions(
    owner: string,
    filter: TxnFilter,
    page: TransactionPageRequest,
  ): Promise<TransactionPage>
  /** Count (capped) and net spend of the rows `filter` matches; see `TransactionSummary`. */
  summarizeTransactions(owner: string, filter: TxnFilter): Promise<TransactionSummary>
  /** One row, or null if there is none with that id for this owner (a foreign id looks the same). */
  getTransaction(owner: string, id: number): Promise<Transaction | null>
  /**
   * The parts of the ledger that are small however many transactions there are, and what the ledger
   * holds: reference tables, pinned rows (see `isPinned`), budget months and row counts. The
   * installment backfill is the caller's to run first, as `loadDataset` runs it.
   */
  readLedgerReference(owner: string): Promise<LedgerReferenceRead>
  /**
   * Every real row whose budget month is in `range`, newest first, as `loadDataset` carries them.
   * Null when the range holds more than `maxRows` rows: a partial month would give wrong totals, so
   * it is never returned.
   */
  readMonthRows(owner: string, range: MonthRange, maxRows: number): Promise<MonthRowsRead | null>
  /**
   * The cells (`buildCells`) of the unpinned rows in `range`, ordered as `buildCells` orders them.
   * Null when there are more than `maxCells`.
   */
  readMonthCells(owner: string, range: MonthRange, maxCells: number): Promise<MonthCell[] | null>
  /**
   * The owner's recurring series over the whole history, newest first: what the detectors need so that
   * a caller holding only some of the rows can finish them. `seriesFromTransactions` in the engine is
   * the reference. The D1 adapter answers with a 503 while rows still wait for their normalized
   * description (migration 0038), because grouping before then would leave rows out.
   */
  readSeries(owner: string): Promise<RecurringSeries[]>
  /**
   * The first `limit` descriptions that start with `prefix` among the owner's rows booked in months before
   * `before`, as the browser's index lists them: `buildDescriptionIndex` in `src/data/descriptionIndex.ts`
   * is the reference. A prefix that matches more than `MAX_SUGGEST_KEYS` descriptions is answered with
   * `tooBroad` and no matches, and the D1 adapter answers 503 while rows still wait for their normalized
   * description.
   */
  suggestDescriptions(owner: string, request: DescriptionSuggestRequest): Promise<DescriptionSuggestResult>
  /**
   * How many transactions, plans and statements name each of the owner's categories, accounts, flags and
   * labels, with zero counts included. `usageFromDataset` in the engine is the reference.
   */
  readUsage(owner: string): Promise<Usage>
  /**
   * Up to `request.limit` rows of one table, in primary-key order, after the position `request.after` names,
   * in the shape `loadDataset` carries them, and the position to continue from (null at the end). Reads that
   * table and nothing else, so it does not run the installment backfill. The CSV export and the backup walk
   * a ledger with it; `loadDataset` is the reference for what the rows are.
   */
  readExportChunk(owner: string, request: ExportChunkRequest): Promise<ExportChunk>
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
  /**
   * The same edit as `bulkUpdateTransactions`, for the rows `target.filter` matches. Refused with a 409 unless
   * exactly `target.expectedCount` rows match, and with a 400 above `MAX_FILTER_EDIT_ROWS`; one atomic write,
   * which is undone if the matching rows change while it is made. Does not hand the rows back.
   */
  bulkUpdateTransactionsByFilter(
    owner: string,
    target: FilterTarget,
    patch: BulkTransactionPatch,
  ): Promise<{ updated: number }>
  /**
   * Adds the labels to the rows (by id or by filter, with the refusals above), keeping the labels they have.
   * `matched` is the owner's rows among the targets, `added` the label links that were new.
   */
  addLabelsToTransactions(
    owner: string,
    target: BulkTarget,
    labelIds: number[],
  ): Promise<{ matched: number; added: number }>
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
  /** One transaction's receipts, or every receipt the owner has when no transaction is named. */
  listAttachments(owner: string, transactionId?: number): Promise<TransactionAttachment[]>
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
  createLabel(owner: string, input: NewLabel): Promise<Label>
  updateLabel(owner: string, id: number, patch: Partial<NewLabel>): Promise<Label>
  /** Deletes the label and unlinks it from its transactions in one operation. */
  deleteLabel(owner: string, id: number): Promise<{ unlabeled: number }>
  /** Replaces a transaction's whole label set; ids are deduped and ownership-checked. */
  setTransactionLabels(
    owner: string,
    transactionId: number,
    labelIds: number[],
  ): Promise<Transaction>
  updateSettings(owner: string, patch: Partial<ExpenseSettings>): Promise<ExpenseSettings>
  createScenario(owner: string, input: NewGoalScenario): Promise<GoalScenario>
  updateScenario(
    owner: string,
    id: number,
    patch: Partial<NewGoalScenario>,
  ): Promise<GoalScenario>
  /** Exactly one plan per owner: activating one deactivates the rest, atomically. */
  activateScenario(owner: string, id: number): Promise<GoalScenario>
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
