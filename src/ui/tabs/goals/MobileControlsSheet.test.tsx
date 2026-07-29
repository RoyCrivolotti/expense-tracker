import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeAll } from 'vitest'
import { MobileControlsSheet } from './MobileControlsSheet'
import { makeScenario } from '../../../testing/factories'
import type { NewGoalScenario } from '../../../data/dataSource'

const showModalMock = vi.fn(function (this: HTMLDialogElement) {
  this.setAttribute('open', '')
})
const closeMock = vi.fn(function (this: HTMLDialogElement) {
  this.removeAttribute('open')
  this.dispatchEvent(new Event('close'))
})

beforeAll(() => {
  // JSDOM doesn't implement <dialog> showModal/close
  HTMLDialogElement.prototype.showModal = showModalMock
  HTMLDialogElement.prototype.close = closeMock
})

function makeDraft(): NewGoalScenario {
  return makeScenario()
}

describe('MobileControlsSheet', () => {
  it('is not open when open=false', () => {
    render(
      <MobileControlsSheet
        draft={makeDraft()}
        onChange={vi.fn()}
        open={false}
        onClose={vi.fn()}
      />,
    )
    const dialog = document.querySelector('dialog')
    expect(dialog?.hasAttribute('open')).toBe(false)
  })

  it('calls showModal when open=true', () => {
    render(
      <MobileControlsSheet
        draft={makeDraft()}
        onChange={vi.fn()}
        open={true}
        onClose={vi.fn()}
      />,
    )
    expect(showModalMock).toHaveBeenCalled()
  })

  it('renders GoalControls inside the sheet', () => {
    render(
      <MobileControlsSheet
        draft={makeDraft()}
        onChange={vi.fn()}
        open={true}
        onClose={vi.fn()}
      />,
    )
    // GoalControls renders an "Adjust projection" title and controls
    expect(screen.getByText('Adjust projection')).toBeTruthy()
  })

  it('calls onClose when Done button is clicked', () => {
    const onClose = vi.fn()
    render(
      <MobileControlsSheet
        draft={makeDraft()}
        onChange={vi.fn()}
        open={true}
        onClose={onClose}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /close controls/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('renders the sheet title', () => {
    render(
      <MobileControlsSheet
        draft={makeDraft()}
        onChange={vi.fn()}
        open={true}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByText('Adjust projection')).toBeTruthy()
  })
})
