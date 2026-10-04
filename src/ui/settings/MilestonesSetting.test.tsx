import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MilestonesSetting } from './MilestonesSetting'
import { defaultExpenseSettings, defaultMilestones, MILESTONE_MAX_CENTS, MILESTONE_MAX_COUNT } from '../../engine'
import type { ExpenseSettings, Milestone } from '../../types'

// The native date field, so a change event carries the value straight through.
vi.mock('../hooks/isNativeDatePicker', () => ({ isNativeDatePicker: () => true }))

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

  it('saves a target date, and clears it again', () => {
    const onChange = vi.fn()
    const { rerender } = render(
      <MilestonesSetting settings={settingsWith(oneMilestone)} onChange={onChange} />,
    )

    fireEvent.change(screen.getByLabelText('Target date for milestone House deposit'), {
      target: { value: '2028-06-01' },
    })
    const dated = [{ amountCents: 10_000_000, label: 'House deposit', targetDate: '2028-06-01' }]
    expect(onChange).toHaveBeenLastCalledWith({ milestones: dated })

    // The clear button only exists once the saved list carries the date.
    rerender(<MilestonesSetting settings={settingsWith(dated)} onChange={onChange} />)
    fireEvent.click(screen.getByLabelText('Clear target date for milestone House deposit'))
    expect(onChange).toHaveBeenLastCalledWith({
      milestones: [{ amountCents: 10_000_000, label: 'House deposit' }],
    })
  })

  it('keeps a date picked while the amount edit is still in flight', () => {
    const onChange = vi.fn(() => new Promise<void>(() => {}))
    render(<MilestonesSetting settings={settingsWith(oneMilestone)} onChange={onChange} />)
    const amount = screen.getByLabelText(/Milestone amount/)
    fireEvent.change(amount, { target: { value: '250000' } })
    fireEvent.blur(amount)
    fireEvent.change(screen.getByLabelText('Target date for milestone House deposit'), {
      target: { value: '2028-06-01' },
    })
    expect(onChange).toHaveBeenLastCalledWith({
      milestones: [{ amountCents: 25_000_000, label: 'House deposit', targetDate: '2028-06-01' }],
    })
  })

  it('still addresses the row after a failed amount save, and says the save failed', async () => {
    const onChange = vi
      .fn()
      .mockRejectedValueOnce(new Error('Network down'))
      .mockResolvedValue(undefined)
    render(<MilestonesSetting settings={settingsWith(oneMilestone)} onChange={onChange} />)
    const amount = screen.getByLabelText(/Milestone amount/)
    fireEvent.change(amount, { target: { value: '250000' } })
    fireEvent.blur(amount)
    expect(await screen.findByRole('alert')).toHaveTextContent('Network down')

    // The row shows what the server holds again, and the next edit addresses that.
    await waitFor(() => expect(amount).toHaveValue('100.000,00'))
    fireEvent.change(screen.getByLabelText('Target date for milestone House deposit'), {
      target: { value: '2028-06-01' },
    })
    expect(onChange).toHaveBeenLastCalledWith({
      milestones: [{ amountCents: 10_000_000, label: 'House deposit', targetDate: '2028-06-01' }],
    })
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })

  it('does not roll back a later save that landed when an earlier one fails', async () => {
    let failFirst: (e: Error) => void = () => {}
    const onChange = vi
      .fn()
      .mockImplementationOnce(() => new Promise<void>((_, reject) => { failFirst = reject }))
      .mockResolvedValue(undefined)
    render(<MilestonesSetting settings={settingsWith(oneMilestone)} onChange={onChange} />)
    const amount = screen.getByLabelText(/Milestone amount/)
    fireEvent.change(amount, { target: { value: '250000' } })
    fireEvent.blur(amount)
    fireEvent.change(screen.getByLabelText('Target date for milestone House deposit'), {
      target: { value: '2028-06-01' },
    })
    // The second save carried the amount along and landed; now the first fails.
    failFirst(new Error('Network down'))
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(2))
    // The working list keeps what the server holds, and nothing says a save failed.
    fireEvent.change(screen.getAllByLabelText('Milestone name')[0]!, { target: { value: 'Deposit' } })
    fireEvent.blur(screen.getAllByLabelText('Milestone name')[0]!)
    expect(onChange).toHaveBeenLastCalledWith({
      milestones: [{ amountCents: 25_000_000, label: 'Deposit', targetDate: '2028-06-01' }],
    })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
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

  describe('reads the amount by the currency format', () => {
    const usd = { ...defaultExpenseSettings(), currencyCode: 'USD', numberLocale: 'en-US', milestones: oneMilestone }

    it('shows the amount as the currency writes it', () => {
      const { unmount } = render(<MilestonesSetting settings={settingsWith(oneMilestone)} onChange={vi.fn()} />)
      expect(screen.getByLabelText(/Milestone amount/)).toHaveValue('100.000,00')
      unmount()

      render(<MilestonesSetting settings={usd} onChange={vi.fn()} />)
      expect(screen.getByLabelText(/Milestone amount/)).toHaveValue('100,000.00')
    })

    it('reads a point as the group mark where the decimal mark is the comma', () => {
      const onChange = vi.fn()
      render(<MilestonesSetting settings={settingsWith(oneMilestone)} onChange={onChange} />)
      const input = screen.getByLabelText(/Milestone amount/)
      // A number field reads this as 150: a hundred and fifty euros.
      fireEvent.change(input, { target: { value: '150.000' } })
      fireEvent.blur(input)

      expect(onChange).toHaveBeenCalledWith({ milestones: [{ amountCents: 15_000_000, label: 'House deposit' }] })
      expect(input).toHaveValue('150.000,00')
    })

    it('reads a comma as the group mark where the decimal mark is the point', () => {
      const onChange = vi.fn()
      render(<MilestonesSetting settings={usd} onChange={onChange} />)
      const input = screen.getByLabelText(/Milestone amount/)
      fireEvent.change(input, { target: { value: '150,000' } })
      fireEvent.blur(input)

      expect(onChange).toHaveBeenCalledWith({ milestones: [{ amountCents: 15_000_000, label: 'House deposit' }] })
    })

    it('takes the other mark as the decimal one when it is alone with one or two digits, as the other fields do', () => {
      const onChange = vi.fn()
      render(<MilestonesSetting settings={usd} onChange={onChange} />)
      const input = screen.getByLabelText(/Milestone amount/)
      fireEvent.change(input, { target: { value: '2500,5' } })
      fireEvent.blur(input)

      expect(onChange).toHaveBeenCalledWith({ milestones: [{ amountCents: 250_050, label: 'House deposit' }] })
    })

    it('goes back to the saved amount for text with no digit in it', () => {
      const onChange = vi.fn()
      render(<MilestonesSetting settings={settingsWith(oneMilestone)} onChange={onChange} />)
      const input = screen.getByLabelText(/Milestone amount/)
      fireEvent.change(input, { target: { value: 'lots' } })
      fireEvent.blur(input)

      expect(onChange).toHaveBeenCalledWith({ milestones: oneMilestone })
      expect(input).toHaveValue('100.000,00')
    })

    it('keeps the ceiling on an amount past it', () => {
      const onChange = vi.fn()
      render(<MilestonesSetting settings={settingsWith(oneMilestone)} onChange={onChange} />)
      const input = screen.getByLabelText(/Milestone amount/)
      fireEvent.change(input, { target: { value: '99999999999999' } })
      fireEvent.blur(input)

      expect(onChange).toHaveBeenCalledWith({ milestones: [{ amountCents: MILESTONE_MAX_CENTS, label: 'House deposit' }] })
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

  describe('overlapping saves', () => {
    const twoMilestones = [
      { amountCents: 10_000_000, label: 'A' },
      { amountCents: 20_000_000, label: 'B' },
    ]

    it('builds a second rename on the first while it is still in flight', () => {
      const onChange = vi.fn(() => new Promise<void>(() => {}))
      render(<MilestonesSetting settings={settingsWith(twoMilestones)} onChange={onChange} />)
      const names = screen.getAllByLabelText('Milestone name')

      fireEvent.change(names[0]!, { target: { value: 'Alpha' } })
      fireEvent.blur(names[0]!)
      fireEvent.change(names[1]!, { target: { value: 'Beta' } })
      fireEvent.blur(names[1]!)

      expect(onChange).toHaveBeenNthCalledWith(2, {
        milestones: [
          { amountCents: 10_000_000, label: 'Alpha' },
          { amountCents: 20_000_000, label: 'Beta' },
        ],
      })
    })

    it('keeps an in-flight rename when another row is removed before it lands', () => {
      const onChange = vi.fn(() => new Promise<void>(() => {}))
      render(<MilestonesSetting settings={settingsWith(twoMilestones)} onChange={onChange} />)
      const names = screen.getAllByLabelText('Milestone name')

      fireEvent.change(names[1]!, { target: { value: 'Beta' } })
      fireEvent.blur(names[1]!)
      fireEvent.click(screen.getByLabelText('Remove milestone A'))

      expect(onChange).toHaveBeenNthCalledWith(2, {
        milestones: [{ amountCents: 20_000_000, label: 'Beta' }],
      })
    })

    it('reverts an amount that collides with another milestone', () => {
      const onChange = vi.fn()
      render(<MilestonesSetting settings={settingsWith(twoMilestones)} onChange={onChange} />)
      const amounts = screen.getAllByLabelText(/Milestone amount/)

      fireEvent.change(amounts[0]!, { target: { value: '200000' } })
      fireEvent.blur(amounts[0]!)

      expect(onChange).toHaveBeenCalledWith({ milestones: twoMilestones })
    })

    it('rolls the working list back when a save fails', async () => {
      const onChange = vi.fn().mockRejectedValueOnce(new Error('offline'))
      render(<MilestonesSetting settings={settingsWith(twoMilestones)} onChange={onChange} />)
      const names = screen.getAllByLabelText('Milestone name')

      fireEvent.change(names[0]!, { target: { value: 'Alpha' } })
      fireEvent.blur(names[0]!)
      await Promise.resolve()

      fireEvent.change(names[1]!, { target: { value: 'Beta' } })
      fireEvent.blur(names[1]!)

      expect(onChange).toHaveBeenNthCalledWith(2, {
        milestones: [
          { amountCents: 10_000_000, label: 'A' },
          { amountCents: 20_000_000, label: 'Beta' },
        ],
      })
    })
  })
})
