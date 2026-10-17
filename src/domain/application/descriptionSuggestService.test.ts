import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SUGGEST_LIMIT,
  MAX_SUGGEST_KEYS,
  MAX_SUGGEST_LIMIT,
  MAX_SUGGEST_PREFIX,
} from '../data/descriptionSuggest'
import { makeDataset, makeTransaction } from '../../testing/factories'
import { inMemoryExpenseRepository } from '../../testing/inMemoryExpenseRepository'
import { normalizeDesc } from '../engine/recurringDetect'
import { mulberry32 } from '../engine/rng'
import { suggestDescriptions, validateDescriptionSuggest } from './descriptionSuggestService'

const refused = (raw: Parameters<typeof validateDescriptionSuggest>[0]) => () => validateDescriptionSuggest(raw)

describe('the limits, as numbers', () => {
  // Written out here and not read from the constants, so that raising one is a decision this test shows.
  it('are the ones the docs state', () => {
    expect(DEFAULT_SUGGEST_LIMIT).toBe(8)
    expect(MAX_SUGGEST_LIMIT).toBe(25)
    expect(MAX_SUGGEST_PREFIX).toBe(140)
    expect(MAX_SUGGEST_KEYS).toBe(500)
  })

  it('refuse a limit of 26 and a prefix of 141 characters, and accept 25 and 140', () => {
    expect(() => validateDescriptionSuggest({ q: 'a', limit: 26 })).toThrow('from 1 to 25')
    expect(validateDescriptionSuggest({ q: 'a', limit: 25 }).limit).toBe(25)
    expect(() => validateDescriptionSuggest({ q: 'a'.repeat(141) })).toThrow('140 characters or fewer')
    expect(validateDescriptionSuggest({ q: 'a'.repeat(140) }).prefix).toHaveLength(140)
  })
})

describe('validateDescriptionSuggest', () => {
  it('normalizes what was typed the way the browser’s index does', () => {
    expect(validateDescriptionSuggest({ q: '  CAFÉ ' })).toEqual({ prefix: 'café', limit: DEFAULT_SUGGEST_LIMIT })
    expect(validateDescriptionSuggest({ q: 'ΟΔΟΣ' }).prefix).toBe(normalizeDesc('ΟΔΟΣ'))
  })

  it('carries the month, the limit and the locale when given', () => {
    expect(validateDescriptionSuggest({ q: 'ma', before: '2026-01', limit: 3, locale: 'sv' })).toEqual({
      prefix: 'ma',
      limit: 3,
      before: '2026-01',
      locale: 'sv',
    })
  })

  it('refuses a missing, blank or too long prefix', () => {
    expect(refused({})).toThrow('q must be text')
    expect(refused({ q: 5 })).toThrow('q must be text')
    expect(refused({ q: '' })).toThrow('q must not be blank')
    expect(refused({ q: '   ' })).toThrow('q must not be blank')
    expect(refused({ q: '\t\u00a0' })).toThrow('q must not be blank')
    expect(refused({ q: 'x'.repeat(MAX_SUGGEST_PREFIX + 1) })).toThrow(`${MAX_SUGGEST_PREFIX} characters or fewer`)
    expect(refused({ q: `${' '.repeat(MAX_SUGGEST_PREFIX * 4)}x` })).toThrow(`${MAX_SUGGEST_PREFIX} characters or fewer`)
    expect(() => validateDescriptionSuggest({ q: 'x'.repeat(MAX_SUGGEST_PREFIX) })).not.toThrow()
  })

  it('accepts a single letter, however it is spelled', () => {
    expect(validateDescriptionSuggest({ q: 'a' }).prefix).toBe('a')
    expect(validateDescriptionSuggest({ q: ' É ' }).prefix).toBe('é')
    expect(validateDescriptionSuggest({ q: '🍕' }).prefix).toBe('🍕')
  })

  it('counts a letter outside the basic plane as one character, not two', () => {
    expect(validateDescriptionSuggest({ q: '🍕'.repeat(MAX_SUGGEST_PREFIX) }).prefix).toHaveLength(MAX_SUGGEST_PREFIX * 2)
    expect(refused({ q: '🍕'.repeat(MAX_SUGGEST_PREFIX + 1) })).toThrow(`${MAX_SUGGEST_PREFIX} characters or fewer`)
  })

  it('refuses text that cannot be stored', () => {
    expect(refused({ q: 'ab\ud800' })).toThrow('valid text')
    expect(refused({ q: '\udc00ab' })).toThrow('valid text')
  })

  it('refuses a cut-off that is not a budget month, a date included', () => {
    for (const before of ['2026-13', '2026-00', '2026-1', '26-01', '2026-01-31', '2026-02-30', 'yesterday', '', 5, null]) {
      expect(refused({ q: 'ma', before }), String(before)).toThrow('before must be a budget month, YYYY-MM')
    }
  })

  it('refuses a limit that is not a whole number from 1 to the maximum', () => {
    for (const limit of [0, -1, MAX_SUGGEST_LIMIT + 1, 2.5, Number.NaN, '3', null]) {
      expect(refused({ q: 'ma', limit }), String(limit)).toThrow(`from 1 to ${MAX_SUGGEST_LIMIT}`)
    }
    expect(validateDescriptionSuggest({ q: 'ma', limit: MAX_SUGGEST_LIMIT }).limit).toBe(MAX_SUGGEST_LIMIT)
  })

  it('refuses a locale that is not a tag the server can sort by', () => {
    for (const locale of ['', 'not a locale', 'x'.repeat(36), 5, null]) {
      expect(refused({ q: 'ma', locale }), String(locale)).toThrow('locale must be a language tag')
    }
    expect(validateDescriptionSuggest({ q: 'ma', locale: 'es-ES' }).locale).toBe('es-ES')
  })

  it('normalizes the typed text to the same text twice over, so the server can normalize again', () => {
    const rnd = mulberry32(8)
    const pieces = ['A', 'É', 'ß', 'İ', 'Σ', 'ς', 'σ', 'ǅ', 'K', '🍕', ' ', '\t', 'ẞ', 'Ω', 'i', 'I']
    for (let i = 0; i < 3_000; i += 1) {
      const text = Array.from({ length: 1 + Math.floor(rnd() * 8) }, () => pieces[Math.floor(rnd() * pieces.length)]!).join('')
      expect(normalizeDesc(normalizeDesc(text)), JSON.stringify(text)).toBe(normalizeDesc(text))
    }
  })
})

describe('suggestDescriptions', () => {
  const rows = [
    makeTransaction({ id: 1, description: 'Market east', date: '2025-01-01', budgetMonth: '2025-01' }),
    makeTransaction({ id: 2, description: 'MARKET WEST', date: '2025-03-01', budgetMonth: '2025-03', categoryId: 4 }),
    makeTransaction({ id: 3, description: 'Mars bar', date: '2026-02-01', budgetMonth: '2026-02' }),
  ]
  const repo = inMemoryExpenseRepository(makeDataset({ transactions: rows }), 'a@example.com')

  it('answers from the repository with the validated request', async () => {
    const result = await suggestDescriptions(repo, 'a@example.com', { q: ' MAR ', before: '2026-01' })
    expect(result.items.map((i) => i.label)).toEqual(['Market east', 'MARKET WEST'])
    expect(result.items[1]!.template.categoryId).toBe(4)
    expect(result.items[0]).toMatchObject({ date: '2025-01-01', id: 1 })
  })

  it('answers nothing for an owner with no rows, and does not read the request before checking it', async () => {
    expect(await suggestDescriptions(repo, 'b@example.com', { q: 'mar' })).toEqual({ items: [], tooBroad: false })
    await expect(suggestDescriptions(repo, 'a@example.com', { q: ' ' })).rejects.toThrow('must not be blank')
  })
})
