import { describe, expect, it } from 'vitest'
import {
  defaultMilestones,
  milestoneLabelWithAmount,
  milestoneName,
  normalizeMilestones,
  parseMilestones,
  validateMilestones,
} from './milestones'
import {
  DEFAULT_MILESTONE_CENTS,
  MILESTONE_LABEL_MAX_LENGTH,
  MILESTONE_MAX_CENTS,
  MILESTONE_MAX_COUNT,
} from './projectionConstants'

describe('defaultMilestones', () => {
  it('mirrors the default ladder with empty labels', () => {
    expect(defaultMilestones().map((m) => m.amountCents)).toEqual([...DEFAULT_MILESTONE_CENTS])
    expect(defaultMilestones().every((m) => m.label === '')).toBe(true)
  })

  it('returns a fresh array each call so callers cannot mutate the default', () => {
    const first = defaultMilestones()
    first[0]!.amountCents = 1
    expect(defaultMilestones()[0]!.amountCents).toBe(DEFAULT_MILESTONE_CENTS[0])
  })
})

describe('normalizeMilestones', () => {
  it('sorts ascending by amount', () => {
    const result = normalizeMilestones([
      { amountCents: 30_000_000, label: 'c' },
      { amountCents: 10_000_000, label: 'a' },
      { amountCents: 20_000_000, label: 'b' },
    ])
    expect(result.map((m) => m.label)).toEqual(['a', 'b', 'c'])
  })

  it('drops duplicate amounts, keeping the lowest-sorted first occurrence', () => {
    const result = normalizeMilestones([
      { amountCents: 10_000_000, label: 'first' },
      { amountCents: 10_000_000, label: 'second' },
    ])
    expect(result).toEqual([{ amountCents: 10_000_000, label: 'first' }])
  })

  it('trims surrounding whitespace from labels', () => {
    expect(normalizeMilestones([{ amountCents: 1, label: '  House  ' }])[0]!.label).toBe('House')
  })

  it('truncates labels longer than the storable length', () => {
    const long = 'x'.repeat(MILESTONE_LABEL_MAX_LENGTH + 10)
    expect(normalizeMilestones([{ amountCents: 1, label: long }])[0]!.label).toHaveLength(
      MILESTONE_LABEL_MAX_LENGTH,
    )
  })

  it('treats a missing label as empty', () => {
    const input = [{ amountCents: 1 }] as unknown as { amountCents: number; label: string }[]
    expect(normalizeMilestones(input)[0]!.label).toBe('')
  })

  it('does not mutate the input array', () => {
    const input = [
      { amountCents: 20_000_000, label: 'b' },
      { amountCents: 10_000_000, label: 'a' },
    ]
    normalizeMilestones(input)
    expect(input[0]!.amountCents).toBe(20_000_000)
  })
})

describe('validateMilestones', () => {
  it('accepts a well-formed list', () => {
    expect(validateMilestones([{ amountCents: 10_000_000, label: 'House' }])).toBeNull()
  })

  it('accepts an empty list as a deliberate choice', () => {
    expect(validateMilestones([])).toBeNull()
  })

  it('accepts an entry with no label', () => {
    expect(validateMilestones([{ amountCents: 1 }])).toBeNull()
  })

  it('rejects a non-array', () => {
    expect(validateMilestones('nope')).toMatch(/must be an array/)
    expect(validateMilestones(null)).toMatch(/must be an array/)
  })

  it('rejects more entries than the matrix can show', () => {
    const tooMany = Array.from({ length: MILESTONE_MAX_COUNT + 1 }, (_, i) => ({
      amountCents: i + 1,
      label: '',
    }))
    expect(validateMilestones(tooMany)).toMatch(/at most/)
  })

  it('rejects a non-object entry', () => {
    expect(validateMilestones([42])).toMatch(/must be an object/)
    expect(validateMilestones([null])).toMatch(/must be an object/)
  })

  it('rejects a non-integer, zero, negative or oversized amount', () => {
    expect(validateMilestones([{ amountCents: 1.5, label: '' }])).toMatch(/amountCents/)
    expect(validateMilestones([{ amountCents: 0, label: '' }])).toMatch(/amountCents/)
    expect(validateMilestones([{ amountCents: -1, label: '' }])).toMatch(/amountCents/)
    expect(validateMilestones([{ amountCents: MILESTONE_MAX_CENTS + 1, label: '' }])).toMatch(
      /amountCents/,
    )
    expect(validateMilestones([{ amountCents: '10' }])).toMatch(/amountCents/)
  })

  it('accepts the largest allowed amount', () => {
    expect(validateMilestones([{ amountCents: MILESTONE_MAX_CENTS, label: '' }])).toBeNull()
  })

  it('rejects a non-string label', () => {
    expect(validateMilestones([{ amountCents: 1, label: 5 }])).toMatch(/label must be a string/)
  })
})

describe('parseMilestones', () => {
  it('falls back to defaults when the column was never set', () => {
    expect(parseMilestones(null)).toEqual(defaultMilestones())
  })

  it('preserves a deliberately empty list', () => {
    expect(parseMilestones('[]')).toEqual([])
  })

  it('normalizes a stored list', () => {
    const raw = JSON.stringify([
      { amountCents: 20_000_000, label: 'b' },
      { amountCents: 10_000_000, label: ' a ' },
    ])
    expect(parseMilestones(raw)).toEqual([
      { amountCents: 10_000_000, label: 'a' },
      { amountCents: 20_000_000, label: 'b' },
    ])
  })

  it('falls back to defaults on malformed JSON rather than blanking the matrix', () => {
    expect(parseMilestones('{oops')).toEqual(defaultMilestones())
  })

  it('falls back to defaults when the stored JSON is the wrong shape', () => {
    expect(parseMilestones('{"a":1}')).toEqual(defaultMilestones())
    expect(parseMilestones('[{"amountCents":-5}]')).toEqual(defaultMilestones())
  })
})

describe('milestoneName', () => {
  it('trims the stored name', () => {
    expect(milestoneName({ amountCents: 8_000_000, label: '  Deposit ' })).toBe('Deposit')
  })

  it('is null when unnamed', () => {
    expect(milestoneName({ amountCents: 8_000_000, label: '' })).toBeNull()
  })

  it('treats a whitespace-only name as unnamed', () => {
    expect(milestoneName({ amountCents: 8_000_000, label: '   ' })).toBeNull()
  })
})

describe('milestoneLabelWithAmount', () => {
  it('shows the name and the amount when named', () => {
    expect(milestoneLabelWithAmount({ amountCents: 8_000_000, label: 'Deposit' }, () => '€80k')).toBe(
      'Deposit (€80k)',
    )
  })

  it('shows the amount alone when unnamed', () => {
    expect(milestoneLabelWithAmount({ amountCents: 8_000_000, label: '' }, () => '€80k')).toBe('€80k')
  })

  it('does not leave empty parentheses for a whitespace-only name', () => {
    expect(milestoneLabelWithAmount({ amountCents: 8_000_000, label: '  ' }, () => '€80k')).toBe(
      '€80k',
    )
  })

  it('uses the formatter it is given, so callers pick full or short money', () => {
    expect(
      milestoneLabelWithAmount({ amountCents: 8_000_000, label: 'Deposit' }, () => '80.000,00 €'),
    ).toBe('Deposit (80.000,00 €)')
  })
})
