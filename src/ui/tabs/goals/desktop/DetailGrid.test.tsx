import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { makeScenario } from '../../../../testing/factories'
import { DetailGrid } from './DetailGrid'

function renderGrid() {
  const { id, ...draft } = makeScenario()
  void id
  return render(
    <DetailGrid
      scenarios={[]}
      draft={draft}
      latest={null}
      monthly={[]}
      milestones={[]}
      reached={new Map()}
      activeId={null}
      dirty={false}
      fromToday={null}
    />,
  )
}

/** Every heading that is a card's title, in the order they are on the page. */
const titles = () => screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)

describe('DetailGrid', () => {
  it('puts the spread card last, across the whole width under the two columns, not as a fourth card in one of them', async () => {
    renderGrid()
    expect(titles().slice(-2)).toEqual(['Rent vs buy (net worth)', 'How far luck could move the plan'])
    const spread = screen.getByRole('heading', { name: 'How far luck could move the plan' })
    expect(spread.closest('[class*="detailColumn"]')).toBeNull()
    expect(spread.closest('[class*="detailWide"]')).not.toBeNull()
    const grid = document.querySelector('[class*="detailGrid"]')!
    expect(grid.compareDocumentPosition(spread) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(grid.contains(spread)).toBe(false)
    expect(await screen.findByText(/Each of the 10.000 runs replays your plan/)).toBeInTheDocument()
  })

  it('splits the other six cards three and three, so the columns end within a card\'s height of each other', () => {
    renderGrid()
    const columns = document.querySelectorAll('[class*="detailColumn"]')
    expect([...columns].map((c) => c.querySelectorAll('h3').length)).toEqual([3, 3])
  })

  it('gives the years to each milestone the whole width, not a place in a half column', () => {
    renderGrid()
    const matrix = screen.getByRole('heading', { name: 'Years to milestone' })

    // Its table needs about 530px, and a half column has that only from 1440px wide.
    expect(matrix.closest('[class*="detailColumn"]')).toBeNull()
    expect(matrix.closest('[class*="detailWide"]')).not.toBeNull()
    expect(screen.getByRole('region', { name: 'Detailed charts' })).toContainElement(matrix)
  })

  it('leads with that table, then puts the cards in two columns', () => {
    renderGrid()

    expect(titles()[0]).toBe('Detailed charts')
    expect(titles()[1]).toBe('Years to milestone')
    const columns = document.querySelectorAll('[class*="detailColumn"]')
    expect(columns).toHaveLength(2)
  })
})
