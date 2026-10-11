import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { samplePlan } from '../../../../testing/samplePlan'
import { LazySpreadChart } from './LazySpreadChart'

// The card's code is fetched on its own when the card is first shown, which can fail: a connection that
// drops, or a deploy that replaced the hashed file under a page that was already open.
vi.mock('./SpreadChart', () => ({
  // Reading the export is what the lazy import does next, so it is where the failure is raised.
  get SpreadChart(): never {
    throw new Error('Failed to fetch dynamically imported module')
  },
}))

afterEach(() => vi.restoreAllMocks())

describe('LazySpreadChart when its code does not load', () => {
  const draft = (() => {
    const { id, isActive, ...rest } = samplePlan()
    void id
    void isActive
    return rest
  })()

  it('says that the card could not be shown, in its own place, and leaves the rest of the page up', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    render(
      <main>
        <p>The rest of the page</p>
        <LazySpreadChart draft={draft} milestones={[]} runs={200} />
      </main>,
    )
    return screen.findByRole('status').then((status) => {
      expect(status).toHaveTextContent('This card could not be shown. Reload the page to try again.')
      expect(screen.getByRole('heading', { name: 'How far luck could move the plan' })).toBeInTheDocument()
      expect(screen.getByText('The rest of the page')).toBeInTheDocument()
      expect(screen.queryByText('Working it out…')).not.toBeInTheDocument()
    })
  })

  it('offers a button that reloads the page', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const reload = vi.fn()
    const original = window.location
    Object.defineProperty(window, 'location', { configurable: true, value: { ...original, reload } })
    try {
      render(<LazySpreadChart draft={draft} milestones={[]} runs={200} />)
      fireEvent.click(await screen.findByRole('button', { name: 'Reload' }))
      expect(reload).toHaveBeenCalledTimes(1)
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: original })
    }
  })
})
