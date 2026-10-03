import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildExpenseModel } from '../../buildExpenseModel'
import { installFakeMatchMedia } from '../../../testing/fakeMatchMedia'
import { makeDataset, makeScenario } from '../../../testing/factories'
import { makeActions } from '../../../testing/makeActions'
import { GoalsTab } from './GoalsTab'
import { NARROW_MQ } from './useGoalsNarrow'
import styles from './goals.module.css'

/** The rules a page ships under one media query. */
function rulesUnder(condition: string): CSSStyleRule[] {
  const rules: CSSStyleRule[] = []
  for (const sheet of Array.from(document.styleSheets)) {
    for (const rule of Array.from(sheet.cssRules)) {
      if (rule instanceof CSSMediaRule && rule.conditionText === condition) {
        // A nested @media (the short-screen rule) has no selector of its own.
        rules.push(...(Array.from(rule.cssRules).filter((r) => 'selectorText' in r) as CSSStyleRule[]))
      }
    }
  }
  return rules
}

const phoneRules = () => rulesUnder('(max-width: 899px)')

/** The phone `order` of each area, with the rules for Scenarios (`inAdjust`) winning over the plain ones. */
function phoneOrders(areas: string[], inAdjust: boolean): number[] {
  const rules = phoneRules()
  return areas.map((area) => {
    const cls = `.${styles[area]}`
    const own = (adjust: boolean) =>
      rules.find(
        (r) =>
          r.selectorText.endsWith(cls) &&
          r.selectorText.includes('data-mobile-view') === adjust &&
          r.style.getPropertyValue('order') !== '',
      )
    const rule = (inAdjust ? own(true) : undefined) ?? own(false)
    return Number(rule?.style.getPropertyValue('order'))
  })
}

/** Strictly ascending, so no two areas tie and leave their place to the DOM order. */
function expectInOrder(orders: number[]) {
  expect(orders.every((n) => Number.isInteger(n))).toBe(true)
  expect(orders).toEqual([...orders].sort((a, b) => a - b))
  expect(new Set(orders).size).toBe(orders.length)
}

describe('the phone order of the Plan areas', () => {
  it('puts the chart first in Chart, ahead of the snapshot, the scenarios and the detail charts', () => {
    expectInOrder(phoneOrders(['areaHero', 'areaNow', 'areaScenarios', 'areaSecondary'], false))
  })

  it('keeps the snapshot, the scenarios, the pinned chart and then the controls in Scenarios', () => {
    expectInOrder(phoneOrders(['areaNow', 'areaScenarios', 'areaMini', 'areaControls'], true))
  })
})

describe('the page order of the Plan blocks', () => {
  let media: ReturnType<typeof installFakeMatchMedia>
  beforeAll(() => {
    media = installFakeMatchMedia()
  })
  // Opening Scenarios scrolls to its controls, which jsdom does not implement, and the scroll waits
  // a frame. A real one would run inside whichever test comes next, so the frame runs at once.
  beforeEach(() => {
    vi.spyOn(window, 'scrollBy').mockImplementation(() => {})
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0)
      return 0
    })
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    media.setMatching(() => false)
  })

  const phone = () => media.setMatching((query) => query === NARROW_MQ)
  const element = (area: string) => document.querySelector(`.${styles[area]}`)!
  /** The areas as the document has them, first to last: what Tab and a screen reader go through. */
  const inPageOrder = (areas: string[]) =>
    [...areas].sort((a, b) =>
      element(a).compareDocumentPosition(element(b)) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
    )
  /** The areas as the phone's CSS puts them on screen, top to bottom. */
  const inShownOrder = (areas: string[], inAdjust: boolean) => {
    const orders = phoneOrders(areas, inAdjust)
    return [...areas].sort((a, b) => orders[areas.indexOf(a)]! - orders[areas.indexOf(b)]!)
  }

  it('is the order Chart shows on a phone, so Tab does not skip down the page and back up', () => {
    phone()
    render(<GoalsTab model={buildExpenseModel(makeDataset())} />)
    const shown = ['areaHero', 'areaNow', 'areaScenarios', 'areaSecondary']

    expect(inPageOrder(shown)).toEqual(inShownOrder(shown, false))
  })

  it('is the order Scenarios shows on a phone', async () => {
    phone()
    render(<GoalsTab model={buildExpenseModel(makeDataset())} />)
    await userEvent.setup().click(screen.getByRole('tab', { name: 'Scenarios' }))
    const shown = ['areaNow', 'areaScenarios', 'areaMini', 'areaControls']

    expect(inPageOrder(shown)).toEqual(inShownOrder(shown, true))
  })

  it('goes from the view row of a phone to the chart, not to the scenario controls under it', async () => {
    phone()
    render(<GoalsTab model={buildExpenseModel(makeDataset())} />)
    screen.getByRole('tab', { name: 'Chart' }).focus()
    await userEvent.setup().tab()

    expect(element('areaHero')).toContainElement(document.activeElement as HTMLElement)
  })

  it('goes from the view switch of a wide screen to the scenarios, which are the first thing on the page', async () => {
    render(<GoalsTab model={buildExpenseModel(makeDataset())} />)
    screen.getByRole('tab', { name: 'Plan' }).focus()
    await userEvent.setup().tab()

    const stop = document.activeElement as HTMLElement
    expect(stop).toHaveAttribute('role', 'tab')
    expect(stop.closest('[role="tablist"]')).toHaveAccessibleName('Scenarios')
  })

  it('reads a wide screen from the scenarios to the chart, the inputs, then the detail charts', () => {
    render(<GoalsTab model={buildExpenseModel(makeDataset())} />)
    const top = [
      screen.getByRole('tablist', { name: 'Scenarios' }),
      screen.getByRole('heading', { name: 'Invested portfolio projection' }),
      screen.getByRole('group', { name: 'Key inputs' }),
      screen.getByRole('heading', { name: 'Detailed charts' }),
    ]

    expect([...top].reverse().sort((x, y) => (x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))).toEqual(top)
  })

  it('keeps the edits made to the draft when the window crosses 900px, both ways', async () => {
    const user = userEvent.setup()
    const model = buildExpenseModel(makeDataset({ goalScenarios: [makeScenario({ id: 1, isActive: true })] }))
    render(<GoalsTab model={model} actions={makeActions()} />)
    const lever = screen.getByLabelText('Monthly investing')
    await user.clear(lever)
    await user.type(lever, '750{Enter}')
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()

    // The phone has the same input in its controls, in the half that is not showing.
    act(() => media.change(NARROW_MQ, true))
    expect(screen.getByLabelText('Monthly investing')).toHaveValue('750,00')
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()

    act(() => media.change(NARROW_MQ, false))
    expect(screen.getByLabelText('Monthly investing')).toHaveValue('750')
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
  })
})
