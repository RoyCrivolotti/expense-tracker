import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { samplePlan } from '../../../../testing/samplePlan'
import { LazySpreadChart } from './LazySpreadChart'

describe('LazySpreadChart', () => {
  it('holds the card\'s place with its title while it loads, then shows the card', async () => {
    const { id, isActive, ...draft } = samplePlan()
    void id
    void isActive
    render(<LazySpreadChart draft={draft} milestones={[]} runs={200} />)
    expect(screen.getByRole('heading', { name: 'How far luck could move the plan' })).toBeInTheDocument()
    expect(screen.getByText('Working it out…')).toBeInTheDocument()
    expect(await screen.findByText(/Each of the 200 runs replays your plan/)).toBeInTheDocument()
    expect(screen.queryByText('Working it out…')).not.toBeInTheDocument()
  })
})
