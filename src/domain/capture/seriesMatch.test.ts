import { describe, expect, it } from 'vitest'
import { makeTxn, monthlyDates } from '../engine/recurringTestHelpers'
import { groupTransactions } from '../engine/recurringDetect'
import type { Transaction } from '../types'
import { type PushToMatch, type SeriesHint, SERIES_MATCH_DAYS, matchPushesToSeries } from './seriesMatch'

let nextId = 1

/** A monthly series of invented charges: same description, account, category and type each month. */
function series(
  description: string,
  dates: string[],
  overrides: Partial<Transaction> = {},
): Transaction[] {
  return dates.map((date) => makeTxn({ id: nextId++, date, description, amountCents: 1299, ...overrides }))
}

function push(
  localDate: string,
  overrides: Partial<PushToMatch> = {},
): PushToMatch {
  return {
    id: `p${nextId++}`,
    createdAt: `${localDate}T09:00:00Z`,
    localDate,
    amountCents: 1299,
    currency: 'EUR',
    suggestedType: 'expense',
    accountId: 1,
    votedDescription: null,
    ...overrides,
  }
}

function hintFor(
  p: PushToMatch,
  rows: Transaction[],
  options: Parameters<typeof matchPushesToSeries>[2] = {},
): SeriesHint {
  return matchPushesToSeries([p], rows, options).get(p.id)!
}

function kindOf(
  p: PushToMatch,
  rows: Transaction[],
): SeriesHint['kind'] {
  return hintFor(p, rows).kind
}

/** Streaming on the 10th since June; November's charge is not logged yet. */
const streaming = () => series('Streaming Plus', monthlyDates(2026, 6, 10, 5))

describe('matchPushesToSeries', () => {
  describe('amount', () => {
    it('matches the amount to the cent', () => {
      const hint = hintFor(push('2026-11-10'), streaming())
      expect(hint).toEqual({
        kind: 'series',
        series: {
          seriesKey: 'streaming plus|1|1|expense',
          description: 'Streaming Plus',
          accountId: 1,
          categoryId: 1,
          type: 'expense',
          amountCents: 1299,
          usualDate: '2026-11-10',
          daysFromUsual: 0,
        },
      })
    })

    it('does not match one cent off either way, or ten percent off', () => {
      for (const amountCents of [1298, 1300, 1169, 1429]) {
        expect(kindOf(push('2026-11-10', { amountCents }), streaming())).toBe('none')
      }
    })

    it('reads the amount of the newest charge, so a price change matches from the month after', () => {
      const rows = [...streaming(), ...series('Streaming Plus', ['2026-11-10'], { amountCents: 1499 })]
      expect(kindOf(push('2026-12-10', { amountCents: 1499 }), rows)).toBe('series')
      expect(kindOf(push('2026-12-10', { amountCents: 1299 }), rows)).toBe('none')
    })
  })

  describe('day', () => {
    it(`matches up to ${SERIES_MATCH_DAYS} days early or late and no further`, () => {
      const at = (localDate: string) => hintFor(push(localDate), streaming())
      expect(at('2026-11-05')).toMatchObject({ kind: 'series', series: { daysFromUsual: -5 } })
      expect(at('2026-11-15')).toMatchObject({ kind: 'series', series: { daysFromUsual: 5 } })
      expect(at('2026-11-04').kind).toBe('none')
      expect(at('2026-11-16').kind).toBe('none')
    })

    it('measures across a month end from the nearest usual day', () => {
      const rows = series('Rent', ['2026-05-31', '2026-06-30', '2026-07-31', '2026-08-31'])
      expect(hintFor(push('2026-10-02'), rows)).toMatchObject({
        kind: 'series',
        series: { usualDate: '2026-09-30', daysFromUsual: 2 },
      })
      expect(hintFor(push('2026-09-27'), rows)).toMatchObject({
        kind: 'series',
        series: { usualDate: '2026-09-30', daysFromUsual: -3 },
      })
    })

    it('clamps the usual day to a short February', () => {
      const rows = series('Rent', ['2026-11-30', '2026-12-30', '2027-01-30'])
      expect(hintFor(push('2027-03-02'), rows)).toMatchObject({
        kind: 'series',
        series: { usualDate: '2027-02-28', daysFromUsual: 2 },
      })
      expect(hintFor(push('2027-02-23'), rows)).toMatchObject({
        kind: 'series',
        series: { usualDate: '2027-02-28', daysFromUsual: -5 },
      })
      expect(kindOf(push('2027-02-22'), rows)).toBe('none')
    })

    it('gives the same answer wherever the device is, across the night the clocks change', () => {
      // Billed on the 26th; the clocks went back on Sunday 25 October in much of Europe.
      const rows = series('Cloud Storage', monthlyDates(2026, 7, 26, 3))
      const dates = ['2026-10-20', '2026-10-21', '2026-10-25', '2026-10-31', '2026-11-01']
      const originalTz = process.env.TZ
      try {
        const answers = ['UTC', 'Europe/Madrid', 'America/Los_Angeles', 'Pacific/Kiritimati'].map((tz) => {
          process.env.TZ = tz
          return dates.map((d) => {
            const hint = hintFor(push(d), rows)
            return hint.kind === 'series' ? `series ${hint.series.daysFromUsual}` : hint.kind
          })
        })
        expect(answers[0]).toEqual(['none', 'series -5', 'series -1', 'series 5', 'none'])
        for (const answer of answers) expect(answer).toEqual(answers[0])
      } finally {
        if (originalTz === undefined) delete process.env.TZ
        else process.env.TZ = originalTz
      }
    })
  })

  describe('direction', () => {
    it('never matches a refund to a charge', () => {
      expect(kindOf(push('2026-11-10', { suggestedType: 'refund' }), streaming())).toBe('none')
      expect(kindOf(push('2026-11-10', { suggestedType: 'income' }), streaming())).toBe('none')
    })

    it('matches money in with money in', () => {
      const pay = series('Monthly Pay', monthlyDates(2026, 6, 28, 5), { type: 'income', amountCents: 250000 })
      expect(kindOf(push('2026-11-27', { suggestedType: 'income', amountCents: 250000 }), pay)).toBe('series')
      expect(kindOf(push('2026-11-27', { suggestedType: 'expense', amountCents: 250000 }), pay)).toBe('none')
    })

    it('gives no hint to a push it cannot read', () => {
      for (const p of [
        push('2026-11-10', { suggestedType: null }),
        push('2026-11-10', { amountCents: null }),
        push('2026-11-10', { currency: 'USD' }),
      ]) {
        expect(kindOf(p, streaming())).toBe('none')
      }
    })
  })

  describe('account', () => {
    it('asks "moved it?" when the one fit is paid from another account', () => {
      expect(hintFor(push('2026-11-10', { accountId: 2 }), streaming())).toMatchObject({
        kind: 'moved',
        pushAccountId: 2,
        series: { accountId: 1, description: 'Streaming Plus' },
      })
    })

    it('fills the series in when the push names no account', () => {
      expect(kindOf(push('2026-11-10', { accountId: null }), streaming())).toBe('series')
    })
  })

  describe('several series', () => {
    it('offers both and picks neither when two fit', () => {
      const rows = [...streaming(), ...series('Music Family', monthlyDates(2026, 6, 12, 5))]
      const hint = hintFor(push('2026-11-11'), rows)
      expect(hint.kind).toBe('choose')
      if (hint.kind !== 'choose') return
      expect(hint.series.map((s) => s.description).sort()).toEqual(['Music Family', 'Streaming Plus'])
    })

    it('offers both even when only one is on the push account', () => {
      const rows = [...streaming(), ...series('Music Family', monthlyDates(2026, 6, 12, 5), { accountId: 2 })]
      expect(kindOf(push('2026-11-11'), rows)).toBe('choose')
    })

    it('offers both even when the votes name one of them', () => {
      const rows = [...streaming(), ...series('Music Family', monthlyDates(2026, 6, 12, 5))]
      expect(kindOf(push('2026-11-11', { votedDescription: 'Music Family' }), rows)).toBe('choose')
    })

    it('gives the series to the older of two pushes in one month, and nothing to the second', () => {
      // The second reached the server first, but the payment dated earlier is this month's charge.
      const first = push('2026-11-10', { createdAt: '2026-11-12T10:00:00Z' })
      const second = push('2026-11-12', { createdAt: '2026-11-12T08:00:00Z' })
      const hints = matchPushesToSeries([second, first], streaming())
      expect(hints.get(first.id)?.kind).toBe('series')
      expect(hints.get(second.id)?.kind).toBe('none')
    })

    it("lets a push still waiting from last month leave this month's charge to this month's push", () => {
      // October logged; November's push was never reviewed, and December's arrives.
      const rows = series('Streaming Plus', monthlyDates(2026, 7, 10, 4))
      const november = push('2026-11-10')
      const december = push('2026-12-10')
      const hints = matchPushesToSeries([november, december], rows)
      expect(hints.get(november.id)).toMatchObject({ kind: 'series', series: { usualDate: '2026-11-10' } })
      expect(hints.get(december.id)).toMatchObject({ kind: 'series', series: { usualDate: '2026-12-10' } })
    })

    it('takes neither series with a choice, so the next push is offered both too', () => {
      const rows = [...streaming(), ...series('Music Family', monthlyDates(2026, 6, 10, 5), { accountId: 2 })]
      const first = push('2026-11-09', { accountId: 2, createdAt: '2026-11-09T08:00:00Z' })
      const second = push('2026-11-09', { accountId: 1, createdAt: '2026-11-09T10:00:00Z' })
      const hints = matchPushesToSeries([first, second], rows)
      expect(hints.get(first.id)?.kind).toBe('choose')
      expect(hints.get(second.id)?.kind).toBe('choose')
    })
  })

  describe('only series still waiting for this month', () => {
    it('does not match a series whose charge for the month is logged', () => {
      const rows = [...streaming(), ...series('Streaming Plus', ['2026-11-08'])]
      expect(kindOf(push('2026-11-10'), rows)).toBe('none')
    })

    it('counts a row logged since the series was built', () => {
      const built = groupTransactions(streaming())
      const rows = [...streaming(), ...series('Streaming Plus', ['2026-11-09'])]
      expect(kindOf(push('2026-11-10'), streaming())).toBe('series')
      expect(hintFor(push('2026-11-10'), rows, { groups: built }).kind).toBe('none')
    })

    it('does not match a series the owner stopped, until a newer charge comes', () => {
      const stopped = { 'streaming plus|1|1|expense': { after: '2026-10-10' } }
      expect(hintFor(push('2026-11-10'), streaming(), { stopped }).kind).toBe('none')
      expect(
        hintFor(push('2026-11-10'), streaming(), { stopped: { 'streaming plus|1|1|expense': { after: '2026-09-10' } } })
          .kind,
      ).toBe('series')
    })

    it('does not match a series that has missed the two charges it waited for', () => {
      expect(kindOf(push('2026-12-10'), streaming())).toBe('series')
      expect(kindOf(push('2027-01-10'), streaming())).toBe('none')
    })

    it('waits for the next month after one skipped month', () => {
      // October skipped: the series still waits, and November's push is its charge.
      const rows = series('Gym', ['2026-06-03', '2026-07-03', '2026-08-03', '2026-09-03'])
      expect(hintFor(push('2026-11-04'), rows)).toMatchObject({ kind: 'series', series: { usualDate: '2026-11-03' } })
    })

    it('keeps matching a series charged twice in one month', () => {
      const rows = series('Gym', ['2026-06-03', '2026-07-03', '2026-08-03', '2026-08-20', '2026-09-03', '2026-10-03'])
      expect(kindOf(push('2026-11-03'), rows)).toBe('series')
    })

    it('does not match a series that is not monthly', () => {
      const weekly = series('Market', ['2026-10-06', '2026-10-13', '2026-10-20', '2026-10-27', '2026-11-03'])
      expect(kindOf(push('2026-11-03'), weekly)).toBe('none')
      const irregular = series('Garden', ['2026-06-10', '2026-07-02', '2026-08-25', '2026-10-10'])
      expect(kindOf(push('2026-11-10'), irregular)).toBe('none')
    })
  })

  describe('votes', () => {
    it('asks when the votes name the fit differently, likely its old name', () => {
      const rows = series('Streaming Premium', monthlyDates(2026, 6, 10, 5))
      expect(hintFor(push('2026-11-10', { votedDescription: ' Streaming Basic ' }), rows)).toMatchObject({
        kind: 'renamed',
        votedDescription: 'Streaming Basic',
        series: { description: 'Streaming Premium' },
      })
    })

    it('agrees when the votes name the fit, whatever the case and accents', () => {
      const rows = series('Café Club', monthlyDates(2026, 6, 10, 5))
      expect(kindOf(push('2026-11-10', { votedDescription: 'cafe club' }), rows)).toBe('series')
      expect(kindOf(push('2026-11-10', { votedDescription: '  ' }), rows)).toBe('series')
    })

    it("gives no hint when the votes name another live series, as after a price rise onto this one's price", () => {
      const video = series('Video Stream', monthlyDates(2026, 6, 10, 5))
      const gym = series('Gym', monthlyDates(2026, 6, 11, 5), { amountCents: 1599 })
      const rise = push('2026-11-10', { amountCents: 1599, votedDescription: 'video stream' })
      expect(kindOf(rise, [...video, ...gym])).toBe('none')
      // The same votes with the old series gone are a rename.
      expect(hintFor(rise, gym)).toMatchObject({ kind: 'renamed', votedDescription: 'video stream' })
    })

    it('looks for the voted series on the push account only', () => {
      const elsewhere = series('Video Stream', monthlyDates(2026, 6, 10, 5), { accountId: 2 })
      const gym = series('Gym', monthlyDates(2026, 6, 11, 5), { amountCents: 1599 })
      const rise = push('2026-11-10', { amountCents: 1599, votedDescription: 'Video Stream' })
      expect(kindOf(rise, [...elsewhere, ...gym])).toBe('renamed')
      expect(kindOf({ ...rise, accountId: null }, [...elsewhere, ...gym])).toBe('none')
    })

    it('asks "moved it?" before "renamed?" when both apply', () => {
      expect(kindOf(push('2026-11-10', { accountId: 2, votedDescription: 'Other Name' }), streaming())).toBe('moved')
    })
  })
})
