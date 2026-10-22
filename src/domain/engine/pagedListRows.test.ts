import { describe, expect, it } from 'vitest'
import { randomLedger } from '../../testing/randomLedger'
import { awkwardLedger, filterStream, vocabularyOf } from '../../testing/transactionQueryKit'
import type { ExpenseDataset } from '../types'
import { computeCashReconciliation } from './cashReconciliation'
import { filteredStatementPayments, pagedListRows } from './pagedListRows'
import { buildTransactionListRows, type TransactionListRow } from './transactionListRows'
import { filterTransactions, type TxnFilter } from './transactions'

const ids = (rows: TransactionListRow[]) => rows.map((r) => (r.kind === 'transaction' ? r.txn.id : r.key))

function readings(ledger: ExpenseDataset, filter: TxnFilter) {
  const { accounts, settings, accountStatements, cashActuals, transactions } = ledger
  const cashRows = computeCashReconciliation(transactions, accounts, settings, cashActuals)
  const ordered = filterTransactions(transactions, filter)
  const payments = filteredStatementPayments(accountStatements, cashRows, accounts, settings, filter)
  const reference = buildTransactionListRows(transactions, filter, accountStatements, cashRows, accounts, settings)
  return { ordered, payments, reference }
}

describe('pagedListRows', () => {
  const ledgers: Array<[string, ExpenseDataset]> = [
    ['awkward', awkwardLedger()],
    ...[1, 2, 3].map((seed): [string, ExpenseDataset] => [`random ${seed}`, randomLedger(seed)]),
  ]

  it('is the list the engine builds once every page is in', () => {
    let withPayments = 0
    for (const [name, ledger] of ledgers) {
      for (const filter of [{}, ...filterStream(vocabularyOf(ledger), 40, 11)]) {
        const { ordered, payments, reference } = readings(ledger, filter)
        withPayments += payments.length > 0 ? 1 : 0
        expect(ids(pagedListRows(ordered, payments, true)), name).toEqual(ids(reference))
      }
    }
    expect(withPayments).toBeGreaterThan(10)
  })

  it('is, at every cut of the pages, the start of the list it will become', () => {
    for (const [name, ledger] of ledgers) {
      const { ordered, payments, reference } = readings(ledger, {})
      const full = ids(reference)
      for (const loaded of new Set([0, 1, 2, 7, 50, Math.floor(ordered.length / 2), ordered.length - 1, ordered.length])) {
        const partial = ids(pagedListRows(ordered.slice(0, loaded), payments, loaded >= ordered.length))
        expect(partial, `${name} ${loaded}`).toEqual(full.slice(0, partial.length))
      }
    }
  })

  it('holds a payment back until the day it falls on has been read to its end', () => {
    const [name, ledger] = ledgers[0]!
    const { ordered, payments } = readings(ledger, {})
    const payment = payments.find((p) => ordered.some((t) => t.date === p.date) && ordered.some((t) => t.date < p.date))!
    expect(payment, name).toBeDefined()
    const lastOfDay = ordered.findLastIndex((t) => t.date === payment.date)
    const shown = (loaded: number) => pagedListRows(ordered.slice(0, loaded), payments, false).includes(payment)
    expect(shown(lastOfDay)).toBe(false)
    // Even with the whole day read, only a row of an older day says that no more of it is coming.
    expect(shown(lastOfDay + 1)).toBe(false)
    expect(shown(lastOfDay + 2)).toBe(true)
  })

  it('shows nothing before the first page has come, and every payment once there are no more pages', () => {
    const { payments } = readings(ledgers[0]![1], {})
    expect(pagedListRows([], payments, false)).toEqual([])
    expect(pagedListRows([], payments, true)).toEqual(payments)
  })
})
