import { singleParams } from './ledgerPartParams'

/**
 * Decimal digits and nothing else, or NaN, which the validators refuse. `Number` alone would read `0x10`,
 * `1e1` and ` 5 ` as numbers, and a blank as 0.
 */
const numeric = (raw: string): number => (/^\d{1,9}$/.test(raw) ? Number(raw) : Number.NaN)

/**
 * `?q=&before=&limit=&locale=`, still unchecked: the application layer validates the values. Any other
 * parameter is refused, the owner included, since a request cannot name one.
 */
export function parseDescriptionSuggest(url: URL): { q?: string; before?: string; limit?: number; locale?: string } {
  const { q, before, limit, locale } = singleParams(url, ['q', 'before', 'limit', 'locale'])
  return {
    ...(q !== undefined ? { q } : {}),
    ...(before !== undefined ? { before } : {}),
    ...(limit !== undefined ? { limit: numeric(limit) } : {}),
    ...(locale !== undefined ? { locale } : {}),
  }
}
