import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_LEVERS, MAX_LEVERS, type LeverKey } from '../../../../engine'
import { makeScenario } from '../../../../testing/factories'
import type { StarredLevers } from '../useStarredLevers'
import { AllInputsPanel } from './AllInputsPanel'
import { LeversBar } from './LeversBar'
import { useKeyboardStarToggle } from './useKeyboardStarToggle'

vi.mock('../../../hooks/isNativeDatePicker', () => ({ isNativeDatePicker: () => true }))

const PANEL = 'inputs-panel'

function makeDraft() {
  const { id, ...rest } = makeScenario()
  void id
  return rest
}

/** The bar and the panel over a list that really changes, wired the way PlanDesktop wires them. */
function Page({ initial }: { initial: readonly LeverKey[] }) {
  const [keys, setKeys] = useState<readonly LeverKey[]>(initial)
  const base: StarredLevers = {
    keys,
    canEdit: true,
    canAdd: keys.length < MAX_LEVERS,
    isDefault: false,
    toggle: (key) => setKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key])),
    reset: () => setKeys(DEFAULT_LEVERS),
  }
  const starred = useKeyboardStarToggle(base, PANEL)
  const draft = makeDraft()
  return (
    <>
      <LeversBar
        draft={draft}
        resultDraft={draft}
        keys={starred.keys}
        onChange={vi.fn()}
        onUnstar={starred.toggle}
        expanded
        panelId={PANEL}
        onToggle={vi.fn()}
      />
      <AllInputsPanel id={PANEL} open draft={draft} latest={null} onChange={vi.fn()} starred={starred} />
    </>
  )
}

const removeStar = (name: string) => screen.getByRole('button', { name: `Remove ${name} from the bar` })

describe('the keyboard\'s place after a star is pressed', () => {
  it('goes to the star that takes the pressed one\'s place in the bar', async () => {
    render(<Page initial={DEFAULT_LEVERS} />)
    removeStar('Horizon').focus()

    await userEvent.keyboard('{Enter}')

    await waitFor(() => expect(removeStar('House purchase')).toHaveFocus())
    expect(screen.queryByRole('button', { name: 'Remove Horizon from the bar' })).not.toBeInTheDocument()
  })

  it('goes to the last star left when the pressed one was the last', async () => {
    render(<Page initial={DEFAULT_LEVERS} />)
    removeStar('Starting invested').focus()

    await userEvent.keyboard('{Enter}')

    await waitFor(() => expect(removeStar('House purchase')).toHaveFocus())
  })

  it('goes to the button that opens the inputs when the bar is empty', async () => {
    render(<Page initial={['horizonYears']} />)
    removeStar('Horizon').focus()

    await userEvent.keyboard('{Enter}')

    await waitFor(() => expect(screen.getByRole('button', { name: 'All inputs' })).toHaveFocus())
  })

  it('goes to the next input\'s star in the panel when an input is sent to the bar', async () => {
    render(<Page initial={[]} />)
    const panel = screen.getByRole('region', { name: 'All inputs' })
    const stars = within(panel).getAllByRole('button', { name: /^Add .* to the bar$/ })
    const second = stars[1]!
    const third = stars[2]!.getAttribute('aria-label')
    second.focus()

    await userEvent.keyboard('{Enter}')

    await waitFor(() => expect(document.activeElement?.getAttribute('aria-label')).toBe(third))
  })

  it('goes to the button that opens the inputs when the bar fills and every star is held back', async () => {
    render(<Page initial={DEFAULT_LEVERS.slice(0, 4)} />)
    const panel = screen.getByRole('region', { name: 'All inputs' })
    within(panel).getByRole('button', { name: 'Add House price to the bar' }).focus()

    await userEvent.keyboard('{Enter}')

    await waitFor(() => expect(screen.getByRole('button', { name: 'All inputs' })).toHaveFocus())
  })

  it('moves to the next star in the bar without letting the browser scroll to it', async () => {
    render(<Page initial={DEFAULT_LEVERS} />)
    const focus = vi.spyOn(HTMLElement.prototype, 'focus')
    removeStar('Horizon').focus()
    focus.mockClear()

    await userEvent.keyboard('{Enter}')

    await waitFor(() => expect(removeStar('House purchase')).toHaveFocus())
    const calls = focus.mock.calls.filter((_, i) => focus.mock.contexts[i] === removeStar('House purchase'))
    expect(calls).toHaveLength(1)
    expect(calls[0]?.[0]?.preventScroll).toBe(true)
    focus.mockRestore()
  })

  it('lets the browser scroll to the next star in the panel, which can be further off when the list closes up', async () => {
    render(<Page initial={[]} />)
    const panel = screen.getByRole('region', { name: 'All inputs' })
    const stars = within(panel).getAllByRole('button', { name: /^Add .* to the bar$/ })
    const next = stars[2]!.getAttribute('aria-label')
    stars[1]!.focus()
    const focus = vi.spyOn(HTMLElement.prototype, 'focus')

    await userEvent.keyboard('{Enter}')

    await waitFor(() => expect(document.activeElement?.getAttribute('aria-label')).toBe(next))
    const calls = focus.mock.calls.filter((_, i) => (focus.mock.contexts[i] as Element).getAttribute('aria-label') === next)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.[0]?.preventScroll).toBe(false)
    focus.mockRestore()
  })

  it('leaves focus alone when the star was pressed without taking it', () => {
    render(<Page initial={DEFAULT_LEVERS} />)

    fireEvent.click(removeStar('Horizon'))

    expect(document.body).toHaveFocus()
    expect(screen.queryByRole('button', { name: 'Remove Horizon from the bar' })).not.toBeInTheDocument()
  })
})
