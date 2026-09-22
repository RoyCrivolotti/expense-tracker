import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EXIT_MS, setMotionDisabledForTests } from '../hooks/motion'
import { isBodyScrollLocked } from '../hooks/useBodyScrollLock'
import { ConfirmSheet } from './ConfirmSheet'
import { Modal } from './Modal'
import { Presence } from './Presence'

describe('ConfirmSheet', () => {
  it('renders a plain string message as a single paragraph', () => {
    render(
      <ConfirmSheet
        title="Delete?"
        message="This can't be undone."
        confirmLabel="Delete"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByText("This can't be undone.")).toBeTruthy()
  })

  it('renders a string array message as separate list items', () => {
    render(
      <ConfirmSheet
        title="Apply?"
        message={['2 new categories: Groceries, Rent', '1 new account: Main debit']}
        confirmLabel="Apply"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByText('2 new categories: Groceries, Rent')).toBeTruthy()
    expect(screen.getByText('1 new account: Main debit')).toBeTruthy()
  })

  it('renders the footnote below the message when provided, and omits it when absent', () => {
    const { rerender } = render(
      <ConfirmSheet
        title="Apply?"
        message="Something will happen."
        footnote="A fixed caveat."
        confirmLabel="Apply"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByText('A fixed caveat.')).toBeTruthy()

    rerender(
      <ConfirmSheet
        title="Apply?"
        message="Something will happen."
        confirmLabel="Apply"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.queryByText('A fixed caveat.')).toBeNull()
  })

  it('references both message and footnote ids in aria-describedby only when a footnote is present', () => {
    const { rerender } = render(
      <ConfirmSheet
        title="Apply?"
        message="Something will happen."
        confirmLabel="Apply"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByRole('alertdialog')).toHaveAttribute('aria-describedby', 'confirm-message')

    rerender(
      <ConfirmSheet
        title="Apply?"
        message="Something will happen."
        footnote="A fixed caveat."
        confirmLabel="Apply"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByRole('alertdialog')).toHaveAttribute(
      'aria-describedby',
      'confirm-message confirm-footnote',
    )
  })
})

describe('ConfirmSheet leaving', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setMotionDisabledForTests(false)
  })
  afterEach(() => {
    vi.useRealTimers()
    setMotionDisabledForTests(true)
  })

  const sheet = (props: { onConfirm?: () => void; onCancel?: () => void } = {}) => (
    <ConfirmSheet
      title="Delete?"
      message="Gone for good."
      confirmLabel="Delete"
      onConfirm={props.onConfirm ?? vi.fn()}
      onCancel={props.onCancel ?? vi.fn()}
    />
  )

  it('renders into the body, out of reach of a transformed parent that would re-contain it', () => {
    const { container } = render(sheet())

    expect(container.querySelector('[role="alertdialog"]')).toBeNull()
    expect(screen.getByRole('alertdialog').closest('body')).toBe(document.body)
  })

  it('leaves over the time its owner holds it for, and takes no more taps meanwhile', () => {
    const { rerender } = render(
      <Presence show exitMs={EXIT_MS.sheet}>
        {sheet()}
      </Presence>,
    )
    const overlay = screen.getByRole('alertdialog').parentElement!
    expect(overlay.hasAttribute('inert')).toBe(false)

    rerender(
      <Presence show={false} exitMs={EXIT_MS.sheet}>
        {sheet()}
      </Presence>,
    )

    expect(overlay.hasAttribute('inert')).toBe(true)
    expect(overlay.className).toContain('overlayClosing')
    expect(screen.getByRole('alertdialog').className).toContain('sheetClosing')
    expect(overlay.style.getPropertyValue('--exit-ms')).toBe(`${EXIT_MS.sheet}ms`)

    void act(() => vi.advanceTimersByTime(EXIT_MS.sheet))
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('does not answer Escape while it is leaving', () => {
    const onCancel = vi.fn()
    const { rerender } = render(
      <Presence show exitMs={EXIT_MS.sheet}>
        {sheet({ onCancel })}
      </Presence>,
    )
    rerender(
      <Presence show={false} exitMs={EXIT_MS.sheet}>
        {sheet({ onCancel })}
      </Presence>,
    )

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onCancel).not.toHaveBeenCalled()
  })

  it('leaves together with the modal it sits on when that modal is closed by the answer', () => {
    // Discard on a form's confirm: the answer closes the modal underneath, and the
    // confirm has to go with it rather than hang there until it is unmounted mid-air.
    function Owner() {
      const [open, setOpen] = useState(true)
      return (
        <Presence show={open} exitMs={EXIT_MS.sheet}>
          <Modal title="Edit" onClose={() => setOpen(false)}>
            <Presence show exitMs={EXIT_MS.sheet}>
              <ConfirmSheet
                title="Discard changes?"
                message="They will be lost."
                confirmLabel="Discard"
                onConfirm={() => setOpen(false)}
                onCancel={vi.fn()}
              />
            </Presence>
          </Modal>
        </Presence>
      )
    }
    render(<Owner />)

    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))

    const confirm = screen.getByRole('alertdialog')
    expect(confirm.className).toContain('sheetClosing')
    expect(screen.getByRole('dialog').className).toContain('sheetClosing')

    void act(() => vi.advanceTimersByTime(EXIT_MS.sheet))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('lets the page go as soon as it leaves with the modal under it, while both still show', () => {
    function Owner() {
      const [open, setOpen] = useState(true)
      return (
        <Presence show={open} exitMs={EXIT_MS.sheet}>
          <Modal title="Edit" onClose={() => setOpen(false)}>
            <Presence show exitMs={EXIT_MS.sheet}>
              <ConfirmSheet
                title="Discard changes?"
                message="They will be lost."
                confirmLabel="Discard"
                onConfirm={() => setOpen(false)}
                onCancel={vi.fn()}
              />
            </Presence>
          </Modal>
        </Presence>
      )
    }
    render(<Owner />)
    expect(isBodyScrollLocked()).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))

    expect(screen.getByRole('alertdialog')).not.toBeNull()
    expect(isBodyScrollLocked()).toBe(false)
  })

  it('keeps the page pinned when only the confirm leaves and the modal stays', () => {
    const tree = (confirmOpen: boolean) => (
      <Presence show exitMs={EXIT_MS.sheet}>
        <Modal title="Edit" onClose={vi.fn()}>
          <Presence show={confirmOpen} exitMs={EXIT_MS.sheet}>
            {sheet()}
          </Presence>
        </Modal>
      </Presence>
    )
    const { rerender } = render(tree(true))

    rerender(tree(false))

    expect(screen.getByRole('alertdialog').className).toContain('sheetClosing')
    expect(isBodyScrollLocked()).toBe(true)
  })
})
