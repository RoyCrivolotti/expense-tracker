import { describe, expect, it } from 'vitest'
import { scenarioToParams } from '../../../../engine'
import { samplePlan } from '../../../../testing/samplePlan'
import type { ScenarioLine } from './heroLegendState'
import { axisSpans, chipsAboveHint, restNote, restYear } from './heroRestYear'

const ORIGIN = '2026-01-01'

function line(
  offsetYears: number,
  horizonYears: number,
  scenarioId: number | null = 1,
): ScenarioLine {
  const params = scenarioToParams(samplePlan({ horizonYears }), 0.02)
  return {
    id: 'l',
    scenarioId,
    name: 'L',
    color: '#000',
    dashed: false,
    params,
    offsetYears,
    startsIn: null,
    endsIn: null,
    ownMoney: null,
  }
}

function rest(
  specs: [number, number][],
  lastIndex: number,
) {
  const lines = specs.map(([o, h]) => line(o, h))
  return restYear(axisSpans(lines, [], ORIGIN), lastIndex)
}

describe('the year the figures rest on, on a calendar', () => {
  it('is the last year every line drawn reaches', () => {
    expect(
      rest(
        [
          [0, 30],
          [1.5, 30],
        ],
        32,
      ),
    ).toEqual({ index: 30, everyReaches: true })
    expect(
      rest(
        [
          [0, 30],
          [0.5, 20],
        ],
        30,
      ),
    ).toEqual({ index: 20, everyReaches: true })
  })

  it('is the last year shown where a window ends before that', () => {
    expect(
      rest(
        [
          [0, 30],
          [1.5, 30],
        ],
        10,
      ),
    ).toEqual({ index: 10, everyReaches: true })
  })

  it('is the last year drawn where no year has every line, and says so', () => {
    // One ends before the other starts.
    expect(
      rest(
        [
          [0, 10],
          [12, 20],
        ],
        32,
      ),
    ).toEqual({ index: 32, everyReaches: false })
    // One starts after the window.
    expect(
      rest(
        [
          [0, 30],
          [7.5, 30],
        ],
        5,
      ),
    ).toEqual({ index: 5, everyReaches: false })
  })

  it('is the year every line reaches where one starts exactly then, and the last year shown where that is exactly it', () => {
    // The second starts in year 10, the year the first ends.
    expect(
      rest(
        [
          [0, 10],
          [10, 20],
        ],
        30,
      ),
    ).toEqual({ index: 10, everyReaches: true })
    expect(
      rest(
        [
          [0, 10],
          [0, 20],
        ],
        10,
      ),
    ).toEqual({ index: 10, everyReaches: true })
    expect(
      rest(
        [
          [0, 10],
          [11, 20],
        ],
        31,
      ),
    ).toEqual({ index: 31, everyReaches: false })
  })

  it('takes an end a hair under a whole year, as a float sum gives it, as that year', () => {
    expect(restYear({ starts: [0], ends: [30 - 1e-12] }, 40)).toEqual({ index: 30, everyReaches: true })
  })

  it('counts a scenario that is not drawn, so hiding a line cannot move it off the comparison table’s year', () => {
    const lines = [line(0, 30, null), line(1.5, 30, 2)]
    const hidden = samplePlan({ id: 3, planStartDate: '2027-01-01', horizonYears: 15 })
    const drawn = samplePlan({ id: 2, planStartDate: '2027-07-02', horizonYears: 30 })
    const spans = axisSpans(lines, [drawn, hidden], ORIGIN)
    expect(spans.ends).toHaveLength(3)
    // The hidden one ends in 2042, axis year 16, before the drawn ones do.
    expect(restYear(spans, 32)).toEqual({ index: 16, everyReaches: true })
  })

  // The comparison table's figures: A from 2026 for 5 years, B from 2032 for 10, and a 30-year plan.
  const a = samplePlan({ id: 1, planStartDate: '2026-01-01', horizonYears: 5 })
  const b = samplePlan({ id: 2, planStartDate: '2032-01-01', horizonYears: 10 })
  const plan = samplePlan({ id: 3, planStartDate: '2026-01-01', horizonYears: 30 })

  it('counts where a hidden scenario starts, so one that starts after another ends moves it to the last year shown, as on the table', () => {
    // A and the plan drawn, B hidden: the table rests on 2056, the last year any scenario reaches.
    const lines = [line(0, 5, 1), line(0, 30, 3)]
    expect(restYear(axisSpans(lines, [a, b, plan], ORIGIN), 30)).toEqual({ index: 30, everyReaches: false })
  })

  it('stays on the last year drawn where a hidden scenario reaches past every line drawn', () => {
    // A alone drawn, B hidden: the table rests on 2042, which the axis does not reach, so the chart says 2031 is only the last year shown.
    expect(restYear(axisSpans([line(0, 5, 1)], [a, b], ORIGIN), 5)).toEqual({ index: 5, everyReaches: false })
  })

  it('is named by its calendar year, and by why it is that year', () => {
    expect(chipsAboveHint({ index: 30, everyReaches: true }, '2026-01-01')).toBe(
      'The values in the chips above are for 2056, the last year every scenario reaches, or for the year you point at.',
    )
    expect(restNote({ index: 5, everyReaches: false }, '2026-01-01')).toBe(
      'The values are for 2031, the last year shown.',
    )
  })
})
