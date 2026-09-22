import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
})
