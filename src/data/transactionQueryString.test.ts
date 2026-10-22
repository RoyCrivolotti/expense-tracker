import { describe, expect, it } from 'vitest'
import { parseTransactionQuery } from '../../functions/_shared/transactionQueryParams'
import { validateTxnFilter } from '../domain/application/transactionQueryService'
import type { TxnFilter } from '../domain/engine/transactions'
import { awkwardLedger, filterStream, vocabularyOf } from '../testing/transactionQueryKit'
import { transactionQueryString } from './transactionQueryString'

/** What the route makes of a query string: the filter it will run, checked and written one way. */
const served = (query: string): TxnFilter =>
  validateTxnFilter(parseTransactionQuery(new URL(`https://expenses.test/list?${query}`)).filter)

describe('transactionQueryString', () => {
  it('is read back by the route as the same filter, for filters that use every field', () => {
    const filters = filterStream(vocabularyOf(awkwardLedger()), 400, 77)
    expect(filters.some((f) => f.labelIds && f.query && f.queryAmount && f.dateFrom)).toBe(true)
    for (const filter of filters) expect(served(transactionQueryString(filter))).toEqual(validateTxnFilter(filter))
  })

  it('leaves out what changes nothing, so equal filters are asked for in the same words', () => {
    expect(transactionQueryString({ type: 'all', status: 'all', labelIds: [], query: '' })).toBe('')
    expect(transactionQueryString({ month: '2026-03', status: 'posted' })).toBe('month=2026-03&status=posted')
  })

  it('names a flag, the labels, an amount range and the paging', () => {
    const query = transactionQueryString(
      { flagId: 'none', labelIds: [3, 1], queryAmount: { fromCents: 6400, toCents: 6499 }, query: 'café & co' },
      { limit: 100, cursor: 'abc_-' },
    )
    expect(Object.fromEntries(new URLSearchParams(query))).toEqual({
      flagId: 'none',
      labelIds: '3,1',
      queryAmountFromCents: '6400',
      queryAmountToCents: '6499',
      query: 'café & co',
      limit: '100',
      cursor: 'abc_-',
    })
  })
})
