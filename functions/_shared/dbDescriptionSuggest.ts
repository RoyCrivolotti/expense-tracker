import {
  MAX_SUGGEST_KEYS,
  type DescriptionMatch,
  type DescriptionSuggestRequest,
  type DescriptionSuggestResult,
} from '../domain/data/descriptionSuggest'
import { descriptionCollator, inSuggestionOrder } from '../domain/engine/descriptionSearch'
import { ensureDescriptionNorm } from './descriptionNormBackfill'
import { suggestSql, type SuggestRow } from './descriptionSuggestSql'
import type { Env } from './env'

/** The match a row speaks for, or null for a description walked that has no eligible row. */
function matchOf(row: SuggestRow): { key: string; entry: DescriptionMatch } | null {
  if (row.id === null) return null
  return {
    key: row.description_norm,
    entry: {
      label: row.description!,
      template: { type: row.type!, categoryId: row.category_id!, accountId: row.account_id! },
      date: row.date!,
      id: row.id,
    },
  }
}

/**
 * The first `limit` descriptions that start with the prefix, among the rows booked in months before
 * `before`, in the browser's order. The statement walks the whole range of the prefix and the Worker sorts
 * what it finds, so a prefix that matches more than {@link MAX_SUGGEST_KEYS} descriptions is answered with
 * `tooBroad` and nothing else rather than from a cut-off list. Like the series read it first makes sure no
 * row is still waiting for its normalized description, and answers 503 while one is.
 */
export async function suggestDescriptions(
  env: Env,
  owner: string,
  { prefix, before, limit, locale }: DescriptionSuggestRequest,
): Promise<DescriptionSuggestResult> {
  await ensureDescriptionNorm(env.DB, owner)
  const { sql, params } = suggestSql(owner, prefix, before, MAX_SUGGEST_KEYS + 1)
  const { results } = await env.DB.prepare(sql)
    .bind(...params)
    .all<SuggestRow>()
  const rows = results ?? []
  if (rows.length > MAX_SUGGEST_KEYS) return { items: [], tooBroad: true }
  const matches = rows.flatMap((row) => matchOf(row) ?? [])
  const items = inSuggestionOrder(matches, descriptionCollator(locale))
    .slice(0, limit)
    .map(({ entry }) => entry)
  return { items, tooBroad: false }
}
