import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { buildDescriptionIndex } from '../../data/descriptionIndex'
import type { TransactionSeed } from '../actions'
import { ClearableDescription } from './ClearableDescription'

const index = buildDescriptionIndex([])

function Harness({ seed, initial }: { seed: TransactionSeed | undefined; initial: string }) {
  const [value, setValue] = useState(initial)
  return <ClearableDescription seed={seed} value={value} index={index} onChange={setValue} onAccept={() => undefined} />
}

// The field dismisses its suggestion list 120ms after it loses focus. Waiting that out keeps the timer from firing after
// the test environment is gone, which fails the run with an unhandled error.
afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 150))
})

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
