import {
  DEFAULT_SUGGEST_LIMIT,
  MAX_SUGGEST_LIMIT,
  MAX_SUGGEST_PREFIX,
  type DescriptionSuggestRequest,
  type DescriptionSuggestResult,
} from '../data/descriptionSuggest'
import { localeIsSupported } from '../engine/descriptionSearch'
import { normalizeDesc } from '../engine/recurringDetect'
import type { ExpenseRepository } from '../ports/expenseRepository'
import { ValidationError } from './validationError'

/** The longest locale tag accepted. BCP 47 tags run to about thirty characters in practice. */
const MAX_LOCALE_LENGTH = 35

/** What a request's query string says, still unchecked. */
export interface RawDescriptionSuggest {
  q?: unknown
  before?: unknown
  limit?: unknown
  locale?: unknown
}

/** The prefix as the browser's index reads it: trimmed and lower-cased, and not blank. */
function prefix(value: unknown): string {
  if (typeof value !== 'string') throw new ValidationError('q must be text')
  if (value.length > MAX_SUGGEST_PREFIX * 4) throw new ValidationError(`q must be ${MAX_SUGGEST_PREFIX} characters or fewer`)
  const normalized = normalizeDesc(value)
  if (/\p{Cs}/u.test(normalized)) throw new ValidationError('q must be valid text')
  const length = [...normalized].length
  if (length === 0) throw new ValidationError('q must not be blank')
  if (length > MAX_SUGGEST_PREFIX) throw new ValidationError(`q must be ${MAX_SUGGEST_PREFIX} characters or fewer`)
  return normalized
}

function limit(value: unknown): number {
  if (value === undefined) return DEFAULT_SUGGEST_LIMIT
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > MAX_SUGGEST_LIMIT) {
    throw new ValidationError(`limit must be a whole number from 1 to ${MAX_SUGGEST_LIMIT}`)
  }
  return value as number
}

function before(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    throw new ValidationError('before must be a budget month, YYYY-MM')
  }
  return value
}

function locale(value: unknown): string {
  if (typeof value !== 'string' || value.length > MAX_LOCALE_LENGTH || !localeIsSupported(value)) {
    throw new ValidationError('locale must be a language tag this server has sorting rules for, such as en or sv-SE')
  }
  return value
}

/** Throws a {@link ValidationError} naming the first field that is not usable. */
export function validateDescriptionSuggest(raw: RawDescriptionSuggest): DescriptionSuggestRequest {
  return {
    prefix: prefix(raw.q),
    limit: limit(raw.limit),
    ...(raw.before !== undefined ? { before: before(raw.before) } : {}),
    ...(raw.locale !== undefined ? { locale: locale(raw.locale) } : {}),
  }
}

/**
 * The first `limit` descriptions that start with what was typed among the owner's rows booked in months
 * before `before` (every row when it is absent), in the order the browser's index lists them, or `tooBroad`
 * and no matches when the prefix is too short to answer. The browser merges the matches with its own
 * (`mergeDescriptionMatches`).
 */
export async function suggestDescriptions(
  repo: ExpenseRepository,
  owner: string,
  raw: RawDescriptionSuggest,
): Promise<DescriptionSuggestResult> {
  return repo.suggestDescriptions(owner, validateDescriptionSuggest(raw))
}
