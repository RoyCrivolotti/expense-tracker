import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { buildExpenseModel } from '../../buildExpenseModel'
import { installFakeMatchMedia } from '../../../testing/fakeMatchMedia'
import { makeDataset } from '../../../testing/factories'
import { GoalsTab } from './GoalsTab'
import { NARROW_MQ } from './useGoalsNarrow'

const INTRO = /when you can reach financial independence/
const CHART = 'Invested portfolio projection'

/** Whether the first node comes before the second in the document. */
function before(a: Node, b: Node): boolean {
  return Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
}

describe('Plan intro placement', () => {
  afterEach(() => {
    installFakeMatchMedia().setMatching(() => false)
  })

  it('leads Plan on a wide screen', () => {
    installFakeMatchMedia().setMatching(() => false)
    render(<GoalsTab model={buildExpenseModel(makeDataset())} />)

    expect(before(screen.getByText(INTRO), screen.getByText(CHART))).toBe(true)
  })

  it('follows the charts on a phone, so the chart is what Chart opens on, and is rendered once', () => {
    installFakeMatchMedia().setMatching((query) => query === NARROW_MQ)
    render(<GoalsTab model={buildExpenseModel(makeDataset())} />)

    expect(screen.getAllByText(INTRO)).toHaveLength(1)
    expect(before(screen.getByText(CHART), screen.getByText(INTRO))).toBe(true)
  })
})
