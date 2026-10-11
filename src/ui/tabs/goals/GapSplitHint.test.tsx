import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { EU_MONEY_FORMAT } from '../../../engine/money'
import type { GapSplit } from '../../../engine'
import { GapSplitHint } from './GapSplitHint'

const split: GapSplit = {
  kind: 'split',
  gapCents: -600_000,
  verdict: 'behind',
  fromDate: '2026-03-01',
  toDate: '2027-03-01',
  beforeFirstCheckin: false,
  parts: { timing: -30_000, start: -200_000, saving: 400_000, market: -770_000 },
  merged: null,
  recordedShort: false,
  accountsChanged: false,
  plannedMonthCents: 100_000,
}

const show = (over: Partial<GapSplit> = {}) =>
  render(<GapSplitHint reading={{ ...split, ...over }} planStartDate="2026-01-01" format={EU_MONEY_FORMAT} onRebaseline={undefined} />)

const NOTE = 'Anything you put in that is not recorded as an investment counts as the market.'

describe('GapSplitHint', () => {
  it('says that what was put in and not recorded counts as the market when the recorded investing falls short, and not otherwise', () => {
    const short = show({ recordedShort: true })
    expect(short.container.textContent).toContain(NOTE)
    short.unmount()
    expect(show({ recordedShort: false }).container.textContent).not.toContain(NOTE)
  })

  it('draws a row that adds in the success text colour and one that takes away in the danger one, and the timing row in neither', () => {
    show()
    const amountOf = (label: string) => screen.getByText(label).parentElement!.querySelector('[class*="gapAmount"]')!
    expect(amountOf('You started behind the plan').className).toMatch(/gapAmountDown/)
    expect(amountOf('Investing more than planned').className).toMatch(/gapAmountUp/)
    expect(amountOf('The market doing worse than the plan assumes').className).toMatch(/gapAmountDown/)
    expect(amountOf("The plan's line moves a year at a time (not something you did)").className).not.toMatch(/gapAmountUp|gapAmountDown/)
  })

  it('says an investment account was opened or emptied between the check-ins, when one was', () => {
    expect(show({ accountsChanged: true }).container.textContent).toContain('An investment account was opened or emptied between these check-ins')
  })
})
