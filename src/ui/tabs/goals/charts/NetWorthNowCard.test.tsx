import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { NetWorthNowCard } from './NetWorthNowCard'
import { makeScenario } from '../../../../testing/factories'

// startInvestedCents is €100k, so €80k is already passed and €150k is next.
const passed = { amountCents: 8_000_000, label: 'House deposit' }
const upcoming = { amountCents: 15_000_000, label: 'Coast FI' }

describe('NetWorthNowCard', () => {
  it('names the first milestone above the current invested value', () => {
    const draft = makeScenario({ annualSpendCents: 4_000_000 })
    render(<NetWorthNowCard draft={draft} milestones={[passed, upcoming]} />)
    expect(screen.getByText('Coast FI')).toBeTruthy()
    expect(screen.queryByText('House deposit')).toBeNull()
  })

  it('falls back to the formatted amount for an unnamed next milestone', () => {
    const draft = makeScenario({ annualSpendCents: 4_000_000 })
    render(<NetWorthNowCard draft={draft} milestones={[{ amountCents: 15_000_000, label: '' }]} />)
    expect(screen.getByText(/Next milestone:/)).toBeTruthy()
  })

  it('omits the next-milestone line when every milestone is already passed', () => {
    const draft = makeScenario({ annualSpendCents: 4_000_000 })
    render(<NetWorthNowCard draft={draft} milestones={[passed]} />)
    expect(screen.queryByText(/Next milestone:/)).toBeNull()
  })

  it('omits the next-milestone line when there are no milestones', () => {
    const draft = makeScenario({ annualSpendCents: 4_000_000 })
    render(<NetWorthNowCard draft={draft} milestones={[]} />)
    expect(screen.queryByText(/Next milestone:/)).toBeNull()
  })

  it('mentions the next milestone in the no-FI-target branch', () => {
    const draft = makeScenario({ annualSpendCents: 0 })
    render(<NetWorthNowCard draft={draft} milestones={[upcoming]} />)
    expect(screen.getByText(/next milestone Coast FI/)).toBeTruthy()
  })

  it('renders the no-FI-target branch without a milestone when the list is empty', () => {
    const draft = makeScenario({ annualSpendCents: 0 })
    render(<NetWorthNowCard draft={draft} milestones={[]} />)
    expect(screen.getByText(/Set annual spend at FI/)).toBeTruthy()
  })
})
