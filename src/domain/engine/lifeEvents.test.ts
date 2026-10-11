import { describe, expect, it } from 'vitest'
import { LIFE_EVENT_MAX_COUNT, lifeEventsFrom, validateLifeEvents } from './lifeEvents'

const event = (over: Record<string, unknown> = {}) => ({ year: 5, amountCents: -3_000_000, label: 'Car', ...over })

describe('validateLifeEvents', () => {
  it('takes a list of events, an empty one included, in either direction of money', () => {
    expect(validateLifeEvents([])).toBeNull()
    expect(validateLifeEvents([event(), event({ year: 12, amountCents: 5_000_000, label: 'Inheritance' })])).toBeNull()
    expect(validateLifeEvents([event({ year: 0 }), event({ year: 100 })])).toBeNull()
  })

  it.each([
    ['not a list', 'abc'],
    ['an object', { year: 5 }],
    ['null', null],
    ['an entry that is null', [null]],
    ['an entry that is a string', ['Car']],
    ['no year', [{ amountCents: 1, label: 'x' }]],
    ['a fractional year', [event({ year: 2.5 })]],
    ['a negative year', [event({ year: -1 })]],
    ['a year past a century', [event({ year: 101 })]],
    ['an amount that is text', [event({ amountCents: '5000' })]],
    ['an amount with cents in the cents', [event({ amountCents: 10.5 })]],
    ['an amount that is not finite', [event({ amountCents: Number.POSITIVE_INFINITY })]],
    ['an amount beyond any balance', [event({ amountCents: 1e14 })]],
    ['a label that is not text', [event({ label: 7 })]],
    ['a label of a hundred and one characters', [event({ label: 'x'.repeat(101) })]],
  ])('refuses %s, which would reach the engine as NaN or crash the Goals screen', (_name, value) => {
    expect(validateLifeEvents(value)).not.toBeNull()
  })

  it('refuses more events than a plan can show', () => {
    const many = Array.from({ length: LIFE_EVENT_MAX_COUNT + 1 }, (_, k) => event({ year: k % 50 }))
    expect(validateLifeEvents(many)).toMatch(/at most/)
    expect(validateLifeEvents(many.slice(0, LIFE_EVENT_MAX_COUNT))).toBeNull()
  })
})

describe('lifeEventsFrom: what a stored value reads as', () => {
  it('keeps the valid events and drops the others one by one, so a bad entry does not blank the plan', () => {
    const good = event()
    expect(lifeEventsFrom([null, good, { amountCents: 'x' }, 'abc', event({ year: 9, label: 'Roof' })])).toEqual([
      good,
      event({ year: 9, label: 'Roof' }),
    ])
  })

  it('reads anything that is not a list as no events', () => {
    for (const value of [null, undefined, 'abc', 7, { year: 1 }]) expect(lifeEventsFrom(value)).toEqual([])
  })

  it('keeps only the three fields of an event', () => {
    expect(lifeEventsFrom([{ ...event(), extra: 'x' }])).toEqual([event()])
  })

  it('reads no more events than a plan can show', () => {
    const many = Array.from({ length: LIFE_EVENT_MAX_COUNT + 5 }, () => event())
    expect(lifeEventsFrom(many)).toHaveLength(LIFE_EVENT_MAX_COUNT)
  })
})
