import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { installFakeMatchMedia } from '../../../testing/fakeMatchMedia'
import { makeDataset } from '../../../testing/factories'
import { draftFromDataset } from './goalsDefaults'
import { SecondaryCharts } from './SecondaryCharts'
import { NARROW_MQ } from './useGoalsNarrow'

function renderOnPhone() {
  installFakeMatchMedia().setMatching((query) => query === NARROW_MQ)
  return render(
    <SecondaryCharts
      scenarios={[]}
      draft={draftFromDataset(makeDataset(), 0)}
      monthly={[]}
      milestones={[]}
      reached={new Map()}
      activeId={null}
      dirty={false}
      fromToday={null}
    />,
  )
}

const picker = () => within(screen.getByRole('radiogroup', { name: 'Secondary chart view' }))
const radio = (name: string) => picker().getByRole('radio', { name })
const chips = () => picker().getAllByRole('radio')

describe('the phone chart picker', () => {
  afterEach(() => {
    installFakeMatchMedia().setMatching(() => false)
  })

  it('is one tab stop, on the chart that is showing', () => {
    renderOnPhone()

    const stops = chips().filter((r) => r.getAttribute('tabindex') === '0')
    expect(stops).toEqual([radio('Compare')])
  })

  it('moves the chart and the focus with the arrow keys, wrapping at the ends', async () => {
    const user = userEvent.setup()
    renderOnPhone()
    radio('Compare').focus()

    await user.keyboard('{ArrowRight}')
    expect(radio('Composition')).toBeChecked()
    expect(radio('Composition')).toHaveFocus()
    expect(radio('Composition')).toHaveAttribute('tabindex', '0')
    expect(radio('Compare')).toHaveAttribute('tabindex', '-1')

    await user.keyboard('{ArrowLeft}{ArrowLeft}')
    expect(chips().at(-1)).toBeChecked()

    await user.keyboard('{Home}')
    expect(radio('Compare')).toBeChecked()
    await user.keyboard('{End}')
    expect(chips().at(-1)).toBeChecked()
  })

  it('is a radio group, so Up and Down move it as well as Left and Right', async () => {
    const user = userEvent.setup()
    renderOnPhone()
    radio('Compare').focus()

    await user.keyboard('{ArrowDown}')
    expect(radio('Composition')).toBeChecked()
    await user.keyboard('{ArrowUp}{ArrowUp}')
    expect(chips().at(-1)).toBeChecked()
  })

  it('leaves a key alone when Alt, Ctrl or Cmd is held, so browser shortcuts still work', () => {
    renderOnPhone()
    radio('Compare').focus()

    const notPrevented = fireEvent.keyDown(radio('Compare'), { key: 'ArrowRight', altKey: true })

    expect(notPrevented).toBe(true)
    expect(radio('Compare')).toBeChecked()
  })
})
