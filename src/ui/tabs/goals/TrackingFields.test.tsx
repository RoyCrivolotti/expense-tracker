import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../hooks/isNativeDatePicker', () => ({ isNativeDatePicker: () => true }))

import { samplePlan } from '../../../testing/samplePlan'
import { TrackingFields } from './goalControlSections'

function draftWith(over: Parameters<typeof samplePlan>[0]) {
  const { id, ...draft } = samplePlan(over)
  void id
  return draft
}

function moveStartTo(date: string, over: Parameters<typeof samplePlan>[0]) {
  const onChange = vi.fn()
  render(<TrackingFields draft={draftWith(over)} latest={null} onChange={onChange} />)
  fireEvent.change(screen.getByLabelText('Plan start date'), { target: { value: date } })
  return onChange
}

describe('moving the plan start date past a monthly change', () => {
  const changes = [
    { from: '2026-03', monthlyCents: 150_000 },
    { from: '2027-09', monthlyCents: 200_000 },
  ]

  it('makes the change the plan starts with, so the starting amount and the history show what the plan uses', () => {
    const onChange = moveStartTo('2026-09-01', { planStartDate: '2026-01-01', monthlyContributionCents: 100_000, contributionSchedule: changes })
    expect(onChange).toHaveBeenCalledWith({
      planStartDate: '2026-09-01',
      monthlyContributionCents: 150_000,
      contributionSchedule: [{ from: '2027-09', monthlyCents: 200_000 }],
    })
  })

  it('changes only the date when no change has begun by the new start', () => {
    const onChange = moveStartTo('2026-02-01', { planStartDate: '2026-01-01', monthlyContributionCents: 100_000, contributionSchedule: changes })
    expect(onChange).toHaveBeenCalledWith({ planStartDate: '2026-02-01' })
  })

  it('changes only the date when there are no changes', () => {
    const onChange = moveStartTo('2026-09-01', { planStartDate: '2026-01-01', contributionSchedule: [] })
    expect(onChange).toHaveBeenCalledWith({ planStartDate: '2026-09-01' })
  })

  it('does not touch the changes when the date is cleared', () => {
    const onChange = vi.fn()
    render(<TrackingFields draft={draftWith({ planStartDate: '2026-01-01', contributionSchedule: changes })} latest={null} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('Plan start date'), { target: { value: '' } })
    expect(onChange).toHaveBeenCalledWith({ planStartDate: null })
  })
})
