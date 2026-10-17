import { ValidationError } from '../domain/application/validationError'

/** What a request's query string says, still unchecked: the application layer validates the values. */
export interface RawTransactionQuery {
  filter: Record<string, unknown>
  limit?: number
  cursor?: string
}

const TEXT = new Set(['month', 'dateFrom', 'dateTo', 'type', 'status', 'query'])
const NUMBER = new Set(['categoryId', 'accountId', 'amountMinCents', 'amountMaxCents'])
const AMOUNT_RANGE = ['queryAmountFromCents', 'queryAmountToCents'] as const

/** A number-shaped value, or NaN, which the validators refuse; never a silent 0 for blank text. */
const numeric = (raw: string): number => (raw.trim() === '' ? Number.NaN : Number(raw))

/** `labelIds=1,2&labelIds=3` and `labelIds=1,2,3` both name three labels. */
function labelIdsOf(values: string[]): number[] {
  return values.flatMap((value) => value.split(',')).map(numeric)
}

function single(url: URL, key: string): string | undefined {
  const values = url.searchParams.getAll(key).filter((value) => value !== '')
  if (values.length > 1) throw new ValidationError(`${key} was given more than once`)
  return values[0]
}

function amountRange(url: URL): { fromCents: number; toCents: number } | undefined {
  const [from, to] = AMOUNT_RANGE.map((key) => single(url, key))
  if (from === undefined && to === undefined) return undefined
  if (from === undefined || to === undefined) {
    throw new ValidationError('queryAmountFromCents and queryAmountToCents go together')
  }
  return { fromCents: numeric(from), toCents: numeric(to) }
}

function assertKnown(url: URL): void {
  const known = new Set([...TEXT, ...NUMBER, ...AMOUNT_RANGE, 'flagId', 'labelIds', 'limit', 'cursor'])
  for (const key of url.searchParams.keys()) {
    if (!known.has(key)) throw new ValidationError(`Unknown parameter: ${key}`)
  }
}

/**
 * The filter, page size and cursor a list or summary request carries. Parameter names are the
 * fields of `TxnFilter`, with `queryAmount` as `queryAmountFromCents` and `queryAmountToCents`.
 * A blank value counts as absent, as it does in the engine. An unknown parameter is refused: a
 * misspelt filter that was quietly ignored would answer with every row. The owner is not a
 * parameter, so a request cannot name one.
 */
export function parseTransactionQuery(url: URL): RawTransactionQuery {
  assertKnown(url)
  const filter: Record<string, unknown> = {}
  for (const key of TEXT) filter[key] = single(url, key)
  for (const key of NUMBER) {
    const value = single(url, key)
    filter[key] = value === undefined ? undefined : numeric(value)
  }
  const flag = single(url, 'flagId')
  filter.flagId = flag === undefined || flag === 'none' ? flag : numeric(flag)
  const labels = url.searchParams.getAll('labelIds').filter((value) => value !== '')
  filter.labelIds = labels.length > 0 ? labelIdsOf(labels) : undefined
  filter.queryAmount = amountRange(url)
  const limit = single(url, 'limit')
  const cursor = single(url, 'cursor')
  return {
    filter,
    ...(limit !== undefined ? { limit: numeric(limit) } : {}),
    ...(cursor !== undefined ? { cursor } : {}),
  }
}
