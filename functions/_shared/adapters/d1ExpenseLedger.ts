import type { ExpenseRepository } from '../../domain/ports/expenseRepository'
import type { Env } from '../env'
import { listOwners, loadDataset } from '../db'
import { getTransaction, queryTransactions, recentTransactions, summarizeTransactions } from '../dbTransactionQuery'
import { readLedgerReference, readMonthCells, readMonthRows } from '../dbLedgerParts'
import { readSeries } from '../dbSeries'
import { suggestDescriptions } from '../dbDescriptionSuggest'
import { readUsage } from '../dbUsage'
import { readExportChunk } from '../dbExport'
import { deleteTransaction, insertTransaction, updateTransaction } from '../dbTransactionWrite'
import { bulkInsertTransactions, bulkUpdateTransactions, deleteTransactions } from '../dbTransactionBulkWrite'
import { addLabelsToTransactions, bulkUpdateTransactionsByFilter } from '../dbBulkEdit'
import { setStatementPaid } from '../dbStatements'
import { clearCashActual, setCashActual } from '../dbCashActuals'
import {
  attachmentBytesUsed,
  attachmentKeysForTransactions,
  createAttachment,
  deleteAttachment,
  findAttachmentSource,
  listAttachments,
  transactionExists,
} from '../dbAttachments'

type LedgerReads = Pick<
  ExpenseRepository,
  | 'loadDataset'
  | 'listOwners'
  | 'queryTransactions'
  | 'summarizeTransactions'
  | 'getTransaction'
  | 'recentTransactions'
  | 'readLedgerReference'
  | 'readMonthRows'
  | 'readMonthCells'
  | 'readSeries'
  | 'suggestDescriptions'
  | 'readUsage'
  | 'readExportChunk'
>

/**
 * Reads of the ledger: the dataset, transaction pages and summaries, the ledger parts, series, suggestions, usage and
 * the export.
 */
export function ledgerReads(env: Env): LedgerReads {
  return {
    loadDataset: (owner) => loadDataset(env, owner),
    listOwners: () => listOwners(env),
    queryTransactions: (
      owner,
      filter,
      page,
    ) => queryTransactions(env, owner, filter, page),
    summarizeTransactions: (
      owner,
      filter,
    ) => summarizeTransactions(env, owner, filter),
    getTransaction: (
      owner,
      id,
    ) => getTransaction(env, owner, id),
    recentTransactions: (
      owner,
      limit,
    ) => recentTransactions(env, owner, limit),
    readLedgerReference: (owner) => readLedgerReference(env, owner),
    readMonthRows: (
      owner,
      range,
      maxRows,
    ) => readMonthRows(env, owner, range, maxRows),
    readMonthCells: (
      owner,
      range,
      maxCells,
    ) => readMonthCells(env, owner, range, maxCells),
    readSeries: (owner) => readSeries(env, owner),
    suggestDescriptions: (
      owner,
      request,
    ) => suggestDescriptions(env, owner, request),
    readUsage: (owner) => readUsage(env, owner),
    readExportChunk: (
      owner,
      request,
    ) => readExportChunk(env, owner, request),
  }
}

type LedgerWrites = Pick<
  ExpenseRepository,
  | 'insertTransaction'
  | 'updateTransaction'
  | 'deleteTransaction'
  | 'deleteTransactions'
  | 'bulkUpdateTransactions'
  | 'bulkUpdateTransactionsByFilter'
  | 'addLabelsToTransactions'
  | 'setStatementPaid'
  | 'setCashActual'
  | 'clearCashActual'
  | 'bulkInsertTransactions'
>

/** Writes to transactions, one or many, and to the statements and cash actuals that hang off them. */
export function ledgerWrites(env: Env): LedgerWrites {
  return {
    insertTransaction: (
      owner,
      input,
    ) => insertTransaction(env, owner, input),
    updateTransaction: (
      owner,
      id,
      patch,
    ) => updateTransaction(env, owner, id, patch),
    deleteTransaction: (
      owner,
      id,
    ) => deleteTransaction(env, owner, id),
    deleteTransactions: (
      owner,
      ids,
    ) => deleteTransactions(env, owner, ids),
    bulkUpdateTransactions: (
      owner,
      ids,
      patch,
    ) => bulkUpdateTransactions(env, owner, ids, patch),
    bulkUpdateTransactionsByFilter: (
      owner,
      target,
      patch,
    ) => bulkUpdateTransactionsByFilter(env, owner, target, patch),
    addLabelsToTransactions: (
      owner,
      target,
      labelIds,
    ) => addLabelsToTransactions(env, owner, target, labelIds),
    setStatementPaid: (
      owner,
      accountId,
      yearMonth,
      paid,
      paidOn,
    ) => setStatementPaid(env, owner, accountId, yearMonth, paid, paidOn),
    setCashActual: (
      owner,
      yearMonth,
      cents,
    ) => setCashActual(env, owner, yearMonth, cents),
    clearCashActual: (
      owner,
      yearMonth,
    ) => clearCashActual(env, owner, yearMonth),
    bulkInsertTransactions: (
      owner,
      inputs,
    ) => bulkInsertTransactions(env, owner, inputs),
  }
}

type Attachments = Pick<
  ExpenseRepository,
  | 'transactionExists'
  | 'listAttachments'
  | 'findAttachmentSource'
  | 'createAttachment'
  | 'deleteAttachment'
  | 'attachmentBytesUsed'
  | 'attachmentKeysForTransactions'
>

/** Receipt attachments: the rows that point at stored files, not the files. */
export function attachments(env: Env): Attachments {
  return {
    transactionExists: (
      owner,
      id,
    ) => transactionExists(env, owner, id),
    listAttachments: (
      owner,
      transactionId,
    ) => listAttachments(env, owner, transactionId),
    findAttachmentSource: (
      owner,
      id,
    ) => findAttachmentSource(env, owner, id),
    createAttachment: (
      owner,
      input,
    ) => createAttachment(env, owner, input),
    deleteAttachment: (
      owner,
      id,
    ) => deleteAttachment(env, owner, id),
    attachmentBytesUsed: (owner) => attachmentBytesUsed(env, owner),
    attachmentKeysForTransactions: (
      owner,
      ids,
    ) => attachmentKeysForTransactions(env, owner, ids),
  }
}
