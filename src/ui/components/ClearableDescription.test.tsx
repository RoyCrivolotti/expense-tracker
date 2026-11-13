import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { buildDescriptionIndex } from '../../data/descriptionIndex'
import type { TransactionSeed } from '../actions'
import { ClearableDescription } from './ClearableDescription'

const index = buildDescriptionIndex([])

function Harness({ seed, initial }: { seed: TransactionSeed | undefined; initial: string }) {
  const [value, setValue] = useState(initial)
  return <ClearableDescription seed={seed} value={value} index={index} onChange={setValue} onAccept={() => undefined} />
}

const captured: TransactionSeed = { recommendationId: 'r', description: 'TAXI DEMO' }
const clear = () => screen.queryByRole('button', { name: 'Clear description' })

describe('the description of a captured payment', () => {
  it('has a clear button while it holds the text the payment was given', () => {
    render(<Harness seed={captured} initial="TAXI DEMO" />)

    expect(clear()).toBeInTheDocument()
  })

  it('empties the field in one click and leaves the cursor in it, and the button goes', async () => {
    render(<Harness seed={captured} initial="TAXI DEMO" />)

    await userEvent.click(clear()!)

    const input = screen.getByRole('combobox')
    expect(input).toHaveValue('')
    expect(input).toHaveFocus()
    expect(clear()).not.toBeInTheDocument()
  })

  it('lets the person type their own after clearing, and the button comes back for text', async () => {
    render(<Harness seed={captured} initial="TAXI DEMO" />)
    await userEvent.click(clear()!)

    await userEvent.keyboard('Cab')

    expect(screen.getByRole('combobox')).toHaveValue('Cab')
    expect(clear()).toBeInTheDocument()
  })

  it('is reached by the keyboard after the field, and works with Enter', async () => {
    render(<Harness seed={captured} initial="TAXI DEMO" />)
    screen.getByRole('combobox').focus()

    await userEvent.tab()
    expect(clear()).toHaveFocus()
    await userEvent.keyboard('{Enter}')

    expect(screen.getByRole('combobox')).toHaveValue('')
    expect(screen.getByRole('combobox')).toHaveFocus()
  })

  it('does not take focus from the field when it is pressed, which keeps the keyboard up on a phone', () => {
    render(<Harness seed={captured} initial="TAXI DEMO" />)

    const notCancelled = fireEvent.mouseDown(clear()!)

    expect(notCancelled).toBe(false)
  })

  it('is not there when the field is empty', () => {
    render(<Harness seed={captured} initial="" />)

    expect(clear()).not.toBeInTheDocument()
  })

  it('is not there for a payment the app gave no description, or for an ordinary add or duplicate', () => {
    const { unmount } = render(<Harness seed={{ recommendationId: 'r' }} initial="typed" />)
    expect(clear()).not.toBeInTheDocument()
    unmount()
    const second = render(<Harness seed={{ description: 'Copied' }} initial="Copied" />)
    expect(clear()).not.toBeInTheDocument()
    second.unmount()
    render(<Harness seed={undefined} initial="Anything" />)
    expect(clear()).not.toBeInTheDocument()
  })
})

describe('the field going away right after it lost focus', () => {
  it('clears its pending close of the list, so it cannot fire on a field that is no longer there', () => {
    const setSpy = vi.spyOn(window, 'setTimeout')
    const clearSpy = vi.spyOn(window, 'clearTimeout')
    try {
      const { unmount } = render(<Harness seed={captured} initial="TAXI DEMO" />)
      screen.getByRole('combobox').focus()
      screen.getByRole('combobox').blur()
      const index = setSpy.mock.calls.findIndex(([, delay]) => delay === 120)
      expect(index).toBeGreaterThanOrEqual(0)
      const timer = setSpy.mock.results[index]!.value as number

      unmount()

      expect(clearSpy).toHaveBeenCalledWith(timer)
    } finally {
      setSpy.mockRestore()
      clearSpy.mockRestore()
    }
  })
})
