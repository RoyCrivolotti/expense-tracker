import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../data/apiClient'

vi.mock('../hooks/isNativeDatePicker', () => ({ isNativeDatePicker: vi.fn(() => true) }))
import { isNativeDatePicker } from '../hooks/isNativeDatePicker'
import { StatementPaymentSheet } from './StatementPaymentSheet'

function renderSheet(overrides: Partial<Parameters<typeof StatementPaymentSheet>[0]> = {}) {
  const onSave = vi.fn().mockResolvedValue(undefined)
  const onClose = vi.fn()
  render(
    <StatementPaymentSheet
      cardName="Visa"
      yearMonth="2026-09"
      amountCents={12_345}
      paid
      paidOn="2026-09-05"
      onSave={onSave}
      onClose={onClose}
      {...overrides}
    />,
  )
  return { onSave, onClose }
}

describe('StatementPaymentSheet — Escape while the paid-on date popover is open', () => {
  // Only this block needs the popover fallback; the native control has no
  // separate focus trap for the Modal to collide with.
  beforeEach(() => {
    vi.mocked(isNativeDatePicker).mockReturnValue(false)
  })

  afterEach(() => {
    vi.mocked(isNativeDatePicker).mockReturnValue(true)
  })

  it('closes just the date popover, not the whole sheet', () => {
    const { onClose } = renderSheet()
    fireEvent.click(screen.getByRole('button', { name: 'Statement paid on' }))
    expect(screen.getByRole('dialog', { name: 'Choose a date' })).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByRole('dialog', { name: 'Choose a date' })).not.toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  // The native input never reports a date it already holds; the calendar does.
  it('does not save when the day that was picked is the one it already has', () => {
    const { onSave } = renderSheet()
    fireEvent.click(screen.getByRole('button', { name: 'Statement paid on' }))

    fireEvent.click(screen.getByRole('button', { name: '5 September 2026' }))

    expect(onSave).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog', { name: 'Choose a date' })).not.toBeInTheDocument()
  })
})

describe('StatementPaymentSheet — a statement that is due', () => {
  beforeEach(() => {
    // The date field starts on today, so the day has to hold still.
    vi.setSystemTime(new Date(2026, 8, 12, 12))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  const dateField = () => screen.getByLabelText('Statement paid on')

  it('offers to mark it paid, with today in the date field', () => {
    renderSheet({ paid: false, paidOn: undefined })

    expect(screen.getByText('Due')).toBeInTheDocument()
    expect(dateField()).toHaveValue('2026-09-12')
    expect(screen.getByRole('button', { name: 'Mark as paid' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Mark as due' })).not.toBeInTheDocument()
  })

  it('marks it paid on today by default and closes', async () => {
    const { onSave, onClose } = renderSheet({ paid: false, paidOn: undefined })

    await userEvent.click(screen.getByRole('button', { name: 'Mark as paid' }))

    expect(onSave).toHaveBeenCalledWith(true, '2026-09-12')
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('saves nothing until Mark as paid is pressed, then uses the date that was picked', async () => {
    const { onSave } = renderSheet({ paid: false, paidOn: undefined })

    fireEvent.change(dateField(), { target: { value: '2026-09-03' } })
    expect(onSave).not.toHaveBeenCalled()
    expect(dateField()).toHaveValue('2026-09-03')

    await userEvent.click(screen.getByRole('button', { name: 'Mark as paid' }))
    expect(onSave).toHaveBeenCalledWith(true, '2026-09-03')
  })

  it('keeps the draft date when the field is cleared', () => {
    renderSheet({ paid: false, paidOn: undefined })

    fireEvent.change(dateField(), { target: { value: '' } })

    expect(dateField()).toHaveValue('2026-09-12')
  })

  it('stays open until the save has come back', async () => {
    let finish!: () => void
    const onSave = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )
    const { onClose } = renderSheet({ paid: false, paidOn: undefined, onSave })

    await userEvent.click(screen.getByRole('button', { name: 'Mark as paid' }))
    expect(onClose).not.toHaveBeenCalled()

    finish()
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('stays open and says why when the save fails, and can be tried again', async () => {
    const onSave = vi
      .fn()
      .mockRejectedValueOnce(new ApiError('Paid date is not a valid day.', 400))
      .mockResolvedValue(undefined)
    const { onClose } = renderSheet({ paid: false, paidOn: undefined, onSave })

    await userEvent.click(screen.getByRole('button', { name: 'Mark as paid' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Paid date is not a valid day.')
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Mark as paid' })).toBeEnabled()

    await userEvent.click(screen.getByRole('button', { name: 'Mark as paid' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('locks the date and the button while a save is in flight', () => {
    renderSheet({ paid: false, paidOn: undefined, disabled: true })

    expect(dateField()).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Mark as paid' })).toBeDisabled()
  })
})

describe('StatementPaymentSheet — a statement that is paid', () => {
  const dateField = () => screen.getByLabelText('Statement paid on')

  it('shows it as paid, on the saved date, with a way to mark it due', () => {
    renderSheet()

    expect(screen.getByText('Paid')).toBeInTheDocument()
    expect(dateField()).toHaveValue('2026-09-05')
    expect(screen.getByRole('button', { name: 'Mark as due' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Mark as paid' })).not.toBeInTheDocument()
  })

  it('has no control that is named for the state it is in', () => {
    renderSheet()

    expect(screen.queryByRole('button', { name: 'Paid' })).not.toBeInTheDocument()
    expect(document.querySelector('[aria-pressed]')).toBeNull()
  })

  it('marks it due, without a date, and closes', async () => {
    const { onSave, onClose } = renderSheet()

    await userEvent.click(screen.getByRole('button', { name: 'Mark as due' }))

    expect(onSave).toHaveBeenCalledWith(false, undefined)
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('saves a new date at once and stays open', async () => {
    const { onSave, onClose } = renderSheet()

    fireEvent.change(dateField(), { target: { value: '2026-09-09' } })

    await waitFor(() => expect(onSave).toHaveBeenCalledWith(true, '2026-09-09'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('does not save a blank date', () => {
    const { onSave } = renderSheet()

    fireEvent.change(dateField(), { target: { value: '' } })

    expect(onSave).not.toHaveBeenCalled()
  })

  it('stays open and says why when a new date cannot be saved', async () => {
    const onSave = vi.fn().mockRejectedValue(new ApiError('Paid date is not a valid day.', 400))
    const { onClose } = renderSheet({ onSave })

    fireEvent.change(dateField(), { target: { value: '2026-09-09' } })

    expect(await screen.findByRole('alert')).toHaveTextContent('Paid date is not a valid day.')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('asks for a date when an older paid statement has none', () => {
    renderSheet({ paidOn: undefined })

    expect(screen.getByText('Select date')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mark as due' })).toBeEnabled()
  })

  it('locks the date and the button while a save is in flight', () => {
    renderSheet({ disabled: true })

    expect(dateField()).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Mark as due' })).toBeDisabled()
  })
})
