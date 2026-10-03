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

  it('goes from the view switch of a wide screen to the scenarios, which are to the left of the chart', async () => {
    render(<GoalsTab model={buildExpenseModel(makeDataset())} />)
    screen.getByRole('tab', { name: 'Plan' }).focus()
    await userEvent.setup().tab()

    expect(element('areaScenarios')).toContainElement(document.activeElement as HTMLElement)
  })

  it('keeps the sidebar before the blocks beside it on a wide screen', () => {
    render(<GoalsTab model={buildExpenseModel(makeDataset())} />)
    const wide = ['areaScenarios', 'areaControls', 'areaHero', 'areaNow', 'areaSecondary']

    expect(inPageOrder([...wide].reverse())).toEqual(wide)
  })

  it('keeps what was typed in the scenario card when the window crosses 900px, both ways', async () => {
    const user = userEvent.setup()
    const model = buildExpenseModel(makeDataset({ goalScenarios: [makeScenario({ id: 1, isActive: true })] }))
    render(<GoalsTab model={model} actions={makeActions()} />)
    await user.click(screen.getByRole('button', { name: /Save as new scenario/ }))
    await user.type(screen.getByLabelText('Name for new scenario'), ' typed')
    const typed = screen.getByLabelText<HTMLInputElement>('Name for new scenario').value
    expect(inPageOrder(['areaHero', 'areaScenarios'])).toEqual(['areaScenarios', 'areaHero'])

    act(() => media.change(NARROW_MQ, true))
    expect(inPageOrder(['areaHero', 'areaScenarios'])).toEqual(['areaHero', 'areaScenarios'])
    expect(screen.getByLabelText('Name for new scenario')).toHaveValue(typed)

    act(() => media.change(NARROW_MQ, false))
    expect(inPageOrder(['areaHero', 'areaScenarios'])).toEqual(['areaScenarios', 'areaHero'])
    expect(screen.getByLabelText('Name for new scenario')).toHaveValue(typed)
  })
})

describe('the wide grid of the Plan blocks', () => {
  /** Where the wide layout puts each block, read from the rules the page ships. */
  const wide = () => rulesUnder('(min-width: 900px)')
  const gridArea = (area: string) =>
    wide().find((r) => r.selectorText === `.${styles[area]}`)?.style.getPropertyValue('grid-area')

  it('names every block in the grid, the sidebar in its own column down the rows beside the others', () => {
    const grid = wide().find((r) => r.selectorText === `.${styles.layout}`)!
    const rows = grid.style
      .getPropertyValue('grid-template-areas')
      .match(/'[^']+'/g)!
      .map((row) => row.replaceAll("'", '').split(' '))

    expect(rows.map((row) => row[0])).toEqual(['sidebar', 'sidebar', 'sidebar'])
    expect(rows.map((row) => row[1])).toEqual(['hero', 'now', 'secondary'])
  })

  it('puts each block in the grid area of its own name, or it falls into the first free cell', () => {
    expect(gridArea('areaSidebar')).toBe('sidebar')
    expect(gridArea('areaHero')).toBe('hero')
    expect(gridArea('areaNow')).toBe('now')
    expect(gridArea('areaSecondary')).toBe('secondary')
  })
})
