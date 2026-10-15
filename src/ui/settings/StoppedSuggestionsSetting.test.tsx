import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { resetStoppedSuggestionsForTests } from '../tabs/stoppedSuggestions'
import { StoppedSuggestionsSetting } from './StoppedSuggestionsSetting'

const KEY = 'expense:stopped-recurring'

function stoppedOnThisDevice(entries: Record<string, { after: string; label: string }>) {
  localStorage.setItem(KEY, JSON.stringify(entries))
}

describe('StoppedSuggestionsSetting', () => {
  beforeEach(() => {
    localStorage.clear()
    resetStoppedSuggestionsForTests()
  })

  it('shows nothing while nothing is stopped', () => {
    const { container } = render(<StoppedSuggestionsSetting />)
    expect(container.firstChild).toBeNull()
  })

  it('lists each stopped series by name with the date of its last charge, in alphabetical order', () => {
    stoppedOnThisDevice({
      'rent|1|2|expense': { after: '2026-06-01', label: 'Rent' },
      'gym|1|1|expense': { after: '2026-08-24', label: 'Gym' },
    })
    render(<StoppedSuggestionsSetting />)

    expect(screen.getByText('Suggestions you stopped')).toBeInTheDocument()
    const items = screen.getAllByRole('listitem')
    expect(items.map((item) => item.textContent)).toEqual([
      'GymLast charge Mon 24 Aug' + 'Suggest again',
      'RentLast charge Mon 1 Jun' + 'Suggest again',
    ])
  })

  it('says it is about this device, and how a series comes back by itself', () => {
    stoppedOnThisDevice({ 'gym|1|1|expense': { after: '2026-08-24', label: 'Gym' } })
    render(<StoppedSuggestionsSetting />)
    expect(screen.getByText(/on this device/)).toBeInTheDocument()
    expect(screen.getByText(/when you log a new charge/)).toBeInTheDocument()
  })

  it('takes a series back with its own button, and the section goes with the last one', () => {
    stoppedOnThisDevice({
      'rent|1|2|expense': { after: '2026-06-01', label: 'Rent' },
      'gym|1|1|expense': { after: '2026-08-24', label: 'Gym' },
    })
    const { container } = render(<StoppedSuggestionsSetting />)

    fireEvent.click(screen.getByRole('button', { name: 'Suggest Gym again' }))
    expect(screen.queryByText('Gym')).not.toBeInTheDocument()
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(1)
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ 'rent|1|2|expense': { after: '2026-06-01', label: 'Rent' } })

    fireEvent.click(screen.getByRole('button', { name: 'Suggest Rent again' }))
    expect(container.firstChild).toBeNull()
  })
})
