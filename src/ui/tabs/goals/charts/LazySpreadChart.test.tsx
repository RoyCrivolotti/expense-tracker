import { act, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { samplePlan } from '../../../../testing/samplePlan'
import { LazySpreadChart } from './LazySpreadChart'

// The chunk is fetched once for the whole file and stays loaded, so what a test sees of the placeholder depends on
// the tests before it. What must hold whatever the order: the title is there at once, and the card follows. Waits are
// long because the first test to get here pays for a cold dynamic import, which a loaded machine makes slow.
const LONG = { timeout: 8_000 }

function plan() {
  const { id, isActive, ...draft } = samplePlan()
  void id
  void isActive
  return draft
}

describe('LazySpreadChart', () => {
  it('holds the card\'s place with its title while it loads, then shows the card', async () => {
    render(<LazySpreadChart draft={plan()} milestones={[]} runs={200} />)
    expect(screen.getByRole('heading', { name: 'How far luck could move the plan' })).toBeInTheDocument()
    expect(await screen.findByText(/Each of the 200 runs replays your plan/, undefined, LONG)).toBeInTheDocument()
    expect(screen.queryByText('Working it out…')).not.toBeInTheDocument()
  })

  it('does not load the card while it starts far from the screen, and does once it is near', async () => {
    // Loaded first, so that a card that wrongly rendered would be on screen within the wait below and not still on its way.
    await import('./SpreadChart')
    const draft = plan()
    const { rerender } = render(<LazySpreadChart draft={draft} milestones={[]} runs={200} paused />)
    // Inside act, so that a card that wrongly started loading has its chunk resolved and rendered by the end of the wait.
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)))
    expect(screen.getByText('Working it out…')).toBeInTheDocument()
    expect(screen.queryByText(/Each of the 200 runs replays your plan/)).not.toBeInTheDocument()
    rerender(<LazySpreadChart draft={draft} milestones={[]} runs={200} />)
    expect(await screen.findByText(/Each of the 200 runs replays your plan/, undefined, LONG)).toBeInTheDocument()
    // Once it has been shown it stays: going far away again only stops the replay.
    rerender(<LazySpreadChart draft={draft} milestones={[]} runs={200} paused />)
    expect(screen.getByText(/Each of the 200 runs replays your plan/)).toBeInTheDocument()
  })
})
