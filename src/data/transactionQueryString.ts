import type { TxnFilter } from '../domain/engine/transactions'

/**
 * The query string of a list or summary request: one parameter per field of the filter, as
 * `parseTransactionQuery` reads them back. A field that changes nothing ('all', no labels, blank text) is left
 * out, so two filters that select the same rows are asked for the same way.
 */
export function transactionQueryString(
  filter: TxnFilter,
  { limit, cursor }: { limit?: number | undefined; cursor?: string | undefined } = {},
): string {
  const params = new URLSearchParams()
  const put = (key: string, value: string | number | undefined) => {
    if (value !== undefined && value !== '') params.set(key, String(value))
  }
  put('month', filter.month)
  put('dateFrom', filter.dateFrom)
  put('dateTo', filter.dateTo)
  put('categoryId', filter.categoryId)
  put('accountId', filter.accountId)
  put('type', filter.type === 'all' ? undefined : filter.type)
  put('status', filter.status === 'all' ? undefined : filter.status)
  put('flagId', filter.flagId)
  put('labelIds', filter.labelIds?.join(','))
  put('query', filter.query)
  put('amountMinCents', filter.amountMinCents)
  put('amountMaxCents', filter.amountMaxCents)
  put('queryAmountFromCents', filter.queryAmount?.fromCents)
  put('queryAmountToCents', filter.queryAmount?.toCents)
  put('limit', limit)
  put('cursor', cursor)
  return params.toString()
}
