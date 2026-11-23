import { suggestDescriptionsOf } from '../data/descriptionIndex'
import { oneOf, pageOf, recentOf, summaryOf } from '../domain/data/transactionQueryOf'
import { usageFromDataset } from '../domain/engine/recordUsage'
import { seriesFromTransactions } from '../domain/engine/recurringSeries'
import { ledgerReferenceOf, monthCellsOf, monthRowsOf } from '../domain/ledger/partsOfDataset'
import type { ExpenseLedgerReads } from '../domain/ports/expenseLedger'
import { exportChunkOf } from './inMemoryExport'
import { derivedTransactions, type InMemoryState, type Op, using } from './inMemoryStore'

export const loadDataset: Op<'loadDataset'> = (
  state,
  owner,
) => Promise.resolve(state.datasetOf(owner))

export const listOwners: Op<'listOwners'> = (state) => Promise.resolve([...state.stores.keys()])

export const queryTransactions: Op<'queryTransactions'> = (
  state,
  owner,
  filter,
  page,
) => Promise.resolve(pageOf(derivedTransactions(state.storeFor(owner)), filter, page))

export const summarizeTransactions: Op<'summarizeTransactions'> = (
  state,
  owner,
  filter,
) => Promise.resolve(summaryOf(derivedTransactions(state.storeFor(owner)), filter))

export const getTransaction: Op<'getTransaction'> = (
  state,
  owner,
  id,
) => Promise.resolve(oneOf(derivedTransactions(state.storeFor(owner)), id))

export const recentTransactions: Op<'recentTransactions'> = (
  state,
  owner,
  limit,
) => Promise.resolve(recentOf(derivedTransactions(state.storeFor(owner)), limit))

export const readLedgerReference: Op<'readLedgerReference'> = (
  state,
  owner,
) => Promise.resolve(ledgerReferenceOf(state.datasetOf(owner)))

export const readMonthRows: Op<'readMonthRows'> = (
  state,
  owner,
  range,
  maxRows,
) => Promise.resolve(monthRowsOf(state.datasetOf(owner), range, maxRows))

export const readMonthCells: Op<'readMonthCells'> = (
  state,
  owner,
  range,
  maxCells,
) => Promise.resolve(monthCellsOf(state.datasetOf(owner), range, maxCells))

export const readSeries: Op<'readSeries'> = (
  state,
  owner,
) => Promise.resolve(seriesFromTransactions(derivedTransactions(state.storeFor(owner))))

export const suggestDescriptions: Op<'suggestDescriptions'> = (
  state,
  owner,
  request,
) => Promise.resolve(suggestDescriptionsOf(derivedTransactions(state.storeFor(owner)), request))

export const readUsage: Op<'readUsage'> = (
  state,
  owner,
) => Promise.resolve(usageFromDataset(state.datasetOf(owner)))

export const readExportChunk: Op<'readExportChunk'> = (
  state,
  owner,
  request,
) => Promise.resolve(exportChunkOf(state.datasetOf(owner), request))

export function ledgerReads(state: InMemoryState): ExpenseLedgerReads {
  return {
    loadDataset: using(state, loadDataset),
    listOwners: using(state, listOwners),
    queryTransactions: using(state, queryTransactions),
    summarizeTransactions: using(state, summarizeTransactions),
    getTransaction: using(state, getTransaction),
    recentTransactions: using(state, recentTransactions),
    readLedgerReference: using(state, readLedgerReference),
    readMonthRows: using(state, readMonthRows),
    readMonthCells: using(state, readMonthCells),
    readSeries: using(state, readSeries),
    suggestDescriptions: using(state, suggestDescriptions),
    readUsage: using(state, readUsage),
    readExportChunk: using(state, readExportChunk),
  }
}
