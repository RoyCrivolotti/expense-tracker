import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { buildExpenseModel } from '../../buildExpenseModel'
import { installFakeMatchMedia } from '../../../testing/fakeMatchMedia'
import { makeDataset } from '../../../testing/factories'
import { GoalsTab } from './GoalsTab'
import { NARROW_MQ } from './useGoalsNarrow'

const INTRO = /when you can reach financial independence/
const CHART = 'Invested portfolio projection'
const GLOSSARY = 'What do these terms mean?'

/** Whether the first node comes before the second in the document. */
function before(a: Node, b: Node): boolean {
  return Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
}

/** The innermost element that holds both nodes. */
function commonAncestor(a: Node, b: Node): Element {
  let node: Node | null = a
  while (node && !node.contains(b)) node = node.parentNode
  return node as Element
}

describe('Plan intro placement', () => {
  afterEach(() => {
    installFakeMatchMedia().setMatching(() => false)
  })

  it('ends the sidebar on a wide screen, under the controls and apart from the chart, and is rendered once', () => {
    installFakeMatchMedia().setMatching(() => false)
    render(<GoalsTab model={buildExpenseModel(makeDataset())} />)
    const intro = screen.getByText(INTRO)
    const controls = screen.getByLabelText('Monthly investing')
    const chart = screen.getByRole('heading', { name: CHART })

    expect(screen.getAllByText(INTRO)).toHaveLength(1)
    expect(before(controls, intro)).toBe(true)
    expect(before(intro, screen.getByText(GLOSSARY))).toBe(true)
    // The sidebar is what holds the controls and the intro, not the column the chart is in.
    expect(commonAncestor(controls, intro)).not.toContainElement(chart)
  })

  it('follows the charts on a phone, so the chart is what Chart opens on, and is rendered once', () => {
    installFakeMatchMedia().setMatching((query) => query === NARROW_MQ)
    render(<GoalsTab model={buildExpenseModel(makeDataset())} />)

    expect(screen.getAllByText(INTRO)).toHaveLength(1)
    expect(before(screen.getByText(CHART), screen.getByText(INTRO))).toBe(true)
  })
})
