import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { applyJx, jxActive } from './jitterFlags'
import { JitterLab } from './JitterLab'
import { ALL_OFF } from './jitterToggles'

function openPanel() {
  render(<JitterLab />)
  fireEvent.click(screen.getByRole('button', { name: 'jx' }))
}

describe('JitterLab', () => {
  afterEach(() => applyJx([]))

  it('stays a small button until it is opened, and closes again', () => {
    render(<JitterLab />)
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'jx' }))
    expect(screen.getByRole('dialog', { name: 'Jitter lab' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('turns a single switch on and off', () => {
    openPanel()
    const box = screen.getByLabelText('Date rows not sticky')

    fireEvent.click(box)
    expect(jxActive()).toEqual(['stickyOff'])

    fireEvent.click(box)
    expect(jxActive()).toEqual([])
  })

  it('switches every suspect off at once, and resets', () => {
    openPanel()

    fireEvent.click(screen.getByRole('button', { name: 'All off' }))
    expect(jxActive()).toEqual(ALL_OFF)
    expect(jxActive()).not.toContain('layers')

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    expect(jxActive()).toEqual([])
  })

  it('shows the numbers on demand and clears them', () => {
    openPanel()
    expect(screen.queryByText(/inner h/)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Show numbers' }))
    expect(screen.getByText(/inner h/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Clear ranges' }))
    expect(screen.queryByText(/inner h/)).toBeNull()
  })
})
