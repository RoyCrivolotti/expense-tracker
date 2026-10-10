import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installFakeIntersectionObserver } from '../../../../testing/fakeIntersectionObserver'
import { makeScenario } from '../../../../testing/factories'
import { DetailGrid } from './DetailGrid'

function renderGrid(over: Parameters<typeof makeScenario>[0] = {}) {
  const { id, ...draft } = makeScenario(over)
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
    expect(await screen.findByText(/Each of the 10.000 runs replays your plan/, undefined, { timeout: 8_000 })).toBeInTheDocument()
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

  describe('the two cards that replay the market', () => {
    afterEach(() => {
      vi.restoreAllMocks()
      vi.unstubAllGlobals()
    })

    it('leaves their replays until they are near the screen', async () => {
      // The card's code is loaded first: a card that wrongly rendered would then be on screen within the wait below,
      // where from cold it would still be on its way and the test would pass for the wrong reason.
      await import('../charts/SpreadChart')
      const io = installFakeIntersectionObserver()
      // Everything is far below the screen.
      vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ top: 9000, bottom: 9400 } as DOMRect)
      renderGrid({ startInvestedCents: 1_000_000_00, annualSpendCents: 2_400_000 })
      await act(() => new Promise((resolve) => setTimeout(resolve, 50)))
      expect(screen.getByText('Working it out…')).toBeInTheDocument()
      expect(screen.queryByText(/the money lasts all 30 years in/)).not.toBeInTheDocument()

      act(() => io.emit(0.3))
      expect(await screen.findByText(/Each of the 10.000 runs replays your plan/, undefined, { timeout: 8_000 })).toBeInTheDocument()
      expect(screen.getByText(/the money lasts all 30 years in/)).toBeInTheDocument()
    })
  })
})
