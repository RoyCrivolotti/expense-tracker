import { describe, expect, it } from 'vitest'
import styles from './goals.module.css'

/** The `order` each area gets under the phone breakpoint, read from the rules the page ships. */
function phoneRules(): CSSStyleRule[] {
  const rules: CSSStyleRule[] = []
  for (const sheet of Array.from(document.styleSheets)) {
    for (const rule of Array.from(sheet.cssRules)) {
      if (rule instanceof CSSMediaRule && rule.conditionText === '(max-width: 899px)') {
        // A nested @media (the short-screen rule) has no selector of its own.
        rules.push(...(Array.from(rule.cssRules).filter((r) => 'selectorText' in r) as CSSStyleRule[]))
      }
    }
  }
  return rules
}

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
