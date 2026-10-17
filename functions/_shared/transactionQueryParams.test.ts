import { describe, expect, it } from 'vitest'
import { ValidationError } from '../domain/application/validationError'
import { parseTransactionQuery } from './transactionQueryParams'

const parse = (query: string) => parseTransactionQuery(new URL(`https://expenses.test/api?${query}`))
const defined = (value: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined))

describe('parseTransactionQuery', () => {
  it('reads nothing from an empty query string', () => {
    const parsed = parse('')
    expect(defined(parsed.filter)).toEqual({})
    expect(parsed.limit).toBeUndefined()
    expect(parsed.cursor).toBeUndefined()
  })

  it('reads every field of the filter, plus paging', () => {
    const parsed = parse(
      'month=2026-03&dateFrom=2026-01-01&dateTo=2026-02-01&categoryId=3&accountId=2&type=expense&status=posted' +
        '&flagId=4&labelIds=1,2&labelIds=3&query=caf%C3%A9+au+lait&amountMinCents=100&amountMaxCents=900' +
        '&queryAmountFromCents=6400&queryAmountToCents=6499&limit=25&cursor=abc',
    )
    expect(defined(parsed.filter)).toEqual({
      month: '2026-03',
      dateFrom: '2026-01-01',
      dateTo: '2026-02-01',
      categoryId: 3,
      accountId: 2,
      type: 'expense',
      status: 'posted',
      flagId: 4,
      labelIds: [1, 2, 3],
      query: 'café au lait',
      amountMinCents: 100,
      amountMaxCents: 900,
      queryAmount: { fromCents: 6400, toCents: 6499 },
    })
    expect(parsed.limit).toBe(25)
    expect(parsed.cursor).toBe('abc')
  })

  it('reads flagId=none as the word and treats blank values as absent', () => {
    expect(parse('flagId=none').filter.flagId).toBe('none')
    expect(defined(parse('month=&query=&categoryId=&labelIds=&limit=').filter)).toEqual({})
  })

  it('keeps the search text as typed, spaces included', () => {
    expect(parse('query=%20').filter.query).toBe(' ')
    expect(parse('query=100%25+%5F').filter.query).toBe('100% _')
  })

  it('turns text that is not a number into NaN, which the validators refuse', () => {
    expect(parse('categoryId=abc').filter.categoryId).toBeNaN()
    expect(parse('amountMinCents=%20').filter.amountMinCents).toBeNaN()
    expect(parse('labelIds=1,,2').filter.labelIds).toEqual([1, Number.NaN, 2])
    expect(parse('limit=ten').limit).toBeNaN()
    expect(parse('flagId=x').filter.flagId).toBeNaN()
  })

  it('refuses what it does not know, including an owner', () => {
    expect(() => parse('owner=someone%40example.com')).toThrow('Unknown parameter: owner')
    expect(() => parse('month=2026-03&sort=asc')).toThrow(ValidationError)
  })

  it('refuses a field given twice, other than labels', () => {
    expect(() => parse('month=2026-03&month=2026-04')).toThrow('month was given more than once')
    expect(() => parse('limit=5&limit=6')).toThrow('limit was given more than once')
    expect(() => parse('labelIds=1&labelIds=2')).not.toThrow()
  })

  it('wants both ends of the amount range or neither', () => {
    expect(() => parse('queryAmountFromCents=5')).toThrow('go together')
    expect(() => parse('queryAmountToCents=5')).toThrow('go together')
    expect(parse('queryAmountFromCents=5&queryAmountToCents=9').filter.queryAmount).toEqual({
      fromCents: 5,
      toCents: 9,
    })
  })
})
