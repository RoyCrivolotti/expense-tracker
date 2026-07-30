import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { GoalsNarrative } from './GoalsNarrative'
import { makeScenario } from '../../../testing/factories'

// startInvestedCents is €100k, so €150k is the next milestone and €1M the top.
const next = { amountCents: 15_000_000, label: 'Coast FI' }
const top = { amountCents: 100_000_000, label: 'Two comma club' }

describe('GoalsNarrative', () => {
  it('names the next milestone in the compact strip, with its amount', () => {
    render(<GoalsNarrative draft={makeScenario()} milestones={[next, top]} compact />)
    expect(screen.getByText(/^Coast FI \(.*\) invested$/)).toBeTruthy()
  })

  it('narrates both the next milestone and the top of the ladder in full mode', () => {
    render(<GoalsNarrative draft={makeScenario()} milestones={[next, top]} />)
    expect(screen.getByText(/Coast FI \(.*\) invested lands around year/)).toBeTruthy()
    expect(screen.getByText(/Two comma club \(.*\) invested lands around year/)).toBeTruthy()
  })

  it('narrates a single milestone when the next one is also the top', () => {
    render(<GoalsNarrative draft={makeScenario()} milestones={[next]} />)
    const body = screen.getByText(/Coast FI \(.*\) invested lands around year/)
    expect(body.textContent?.match(/Coast FI/g)).toHaveLength(1)
  })

  it('says so when a milestone is out of reach within the horizon', () => {
    const draft = makeScenario({ horizonYears: 2, monthlyContributionCents: 0 })
    render(<GoalsNarrative draft={draft} milestones={[top]} />)
    expect(screen.getByText(/Two comma club \(.*\) is not reached in the horizon/)).toBeTruthy()
  })

  it('omits milestone prose entirely when there are none', () => {
    render(<GoalsNarrative draft={makeScenario()} milestones={[]} />)
    expect(screen.queryByText(/lands around year/)).toBeNull()
    expect(screen.getByText(/What this means/)).toBeTruthy()
  })

  it('omits the milestone stat from the compact strip when there are none', () => {
    render(<GoalsNarrative draft={makeScenario()} milestones={[]} compact />)
    expect(screen.getByText('Current plan summary')).toBeTruthy()
    expect(screen.queryByText(/invested$/)).toBeNull()
  })
})
