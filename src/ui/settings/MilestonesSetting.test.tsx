import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MilestonesSetting } from './MilestonesSetting'
import { defaultExpenseSettings, defaultMilestones, MILESTONE_MAX_COUNT } from '../../engine'
import type { ExpenseSettings, Milestone } from '../../types'

function settingsWith(milestones: Milestone[]): ExpenseSettings {
  return { ...defaultExpenseSettings(), milestones }
}

const oneMilestone = [{ amountCents: 10_000_000, label: 'House deposit' }]

describe('MilestonesSetting', () => {
  it('renders a row per milestone', () => {
    render(<MilestonesSetting settings={settingsWith(defaultMilestones())} onChange={vi.fn()} />)
    expect(screen.getAllByLabelText('Milestone name')).toHaveLength(defaultMilestones().length)
  })

  it('shows an empty state when the list is empty', () => {
    render(<MilestonesSetting settings={settingsWith([])} onChange={vi.fn()} />)
    expect(screen.getByText(/No milestones\./)).toBeTruthy()
  })

  it('saves a renamed milestone on blur', () => {
    const onChange = vi.fn()
    render(<MilestonesSetting settings={settingsWith(oneMilestone)} onChange={onChange} />)
    const input = screen.getByLabelText('Milestone name')
    fireEvent.change(input, { target: { value: 'Emergency fund' } })
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.blur(input)
    expect(onChange).toHaveBeenCalledWith({
      milestones: [{ amountCents: 10_000_000, label: 'Emergency fund' }],
    })
  })

  it('converts the amount from major units to cents on blur', () => {
    const onChange = vi.fn()
    render(<MilestonesSetting settings={settingsWith(oneMilestone)} onChange={onChange} />)
    const input = screen.getByLabelText(/Milestone amount/)
    fireEvent.change(input, { target: { value: '250000' } })
    fireEvent.blur(input)
    expect(onChange).toHaveBeenCalledWith({
      milestones: [{ amountCents: 25_000_000, label: 'House deposit' }],
    })
  })

  it('reverts an unparseable amount instead of saving junk', () => {
    const onChange = vi.fn()
    render(<MilestonesSetting settings={settingsWith(oneMilestone)} onChange={onChange} />)
    const input = screen.getByLabelText(/Milestone amount/)
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.blur(input)
    expect(onChange).toHaveBeenCalledWith({ milestones: oneMilestone })
  })

  it('reverts a non-positive amount', () => {
    const onChange = vi.fn()
    render(<MilestonesSetting settings={settingsWith(oneMilestone)} onChange={onChange} />)
    const input = screen.getByLabelText(/Milestone amount/)
    fireEvent.change(input, { target: { value: '-5' } })
    fireEvent.blur(input)
    expect(onChange).toHaveBeenCalledWith({ milestones: oneMilestone })
  })

  it('removes a milestone', () => {
    const onChange = vi.fn()
    render(<MilestonesSetting settings={settingsWith(oneMilestone)} onChange={onChange} />)
    fireEvent.click(screen.getByLabelText('Remove milestone House deposit'))
    expect(onChange).toHaveBeenCalledWith({ milestones: [] })
  })

  it('adds a milestone a step above the current top', () => {
    const onChange = vi.fn()
    render(<MilestonesSetting settings={settingsWith(oneMilestone)} onChange={onChange} />)
    fireEvent.click(screen.getByText('+ Add milestone'))
    expect(onChange).toHaveBeenCalledWith({
      milestones: [...oneMilestone, { amountCents: 20_000_000, label: '' }],
    })
  })

  it('adds a first milestone when the list is empty', () => {
    const onChange = vi.fn()
    render(<MilestonesSetting settings={settingsWith([])} onChange={onChange} />)
    fireEvent.click(screen.getByText('+ Add milestone'))
    expect(onChange).toHaveBeenCalledWith({ milestones: [{ amountCents: 10_000_000, label: '' }] })
  })

  it('stops adding at the matrix limit', () => {
    const full = Array.from({ length: MILESTONE_MAX_COUNT }, (_, i) => ({
      amountCents: (i + 1) * 1_000_000,
      label: '',
    }))
    render(<MilestonesSetting settings={settingsWith(full)} onChange={vi.fn()} />)
    expect(screen.getByText('+ Add milestone').hasAttribute('disabled')).toBe(true)
    expect(screen.getByText(/is the most the matrix can show/)).toBeTruthy()
  })

  it('restores the built-in ladder', () => {
    const onChange = vi.fn()
    render(<MilestonesSetting settings={settingsWith([])} onChange={onChange} />)
    fireEvent.click(screen.getByText('Reset to defaults'))
    expect(onChange).toHaveBeenCalledWith({ milestones: defaultMilestones() })
  })
})
