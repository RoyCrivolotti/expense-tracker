import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { AdjustStack } from './AdjustStack'
import { NARROW_MQ } from './useGoalsNarrow'
import { ADJUST_STACK_ID } from './goalsAnchors'
import { installFakeMatchMedia } from '../../../testing/fakeMatchMedia'
import { draftFromDataset } from './goalsDefaults'
import { makeDataset } from '../../../testing/factories'

let media: ReturnType<typeof installFakeMatchMedia>

beforeAll(() => {
  media = installFakeMatchMedia()
})

afterEach(() => {
  media.setMatching(() => false)
})

const draft = draftFromDataset(makeDataset(), 0)
const mini = () => document.querySelector('svg[aria-label^="Projection of the scenario being edited"]')

describe('AdjustStack', () => {
  it('pins the draft chart and the section chips together on a phone', () => {
    media.setMatching((query) => query === NARROW_MQ)
    render(<AdjustStack draft={draft} />)

    const stack = document.getElementById(ADJUST_STACK_ID)
    expect(stack).toContainElement(mini() as HTMLElement)
    // The stack is display:none outside the phone breakpoint, which jsdom cannot match.
    expect(stack).toContainElement(screen.getByRole('navigation', { name: 'Scenario sections', hidden: true }))
  })

  it('renders nothing on a wide screen, chart included', () => {
    const { container } = render(<AdjustStack draft={draft} />)

    expect(container).toBeEmptyDOMElement()
    expect(mini()).not.toBeInTheDocument()
  })

  it('drops the chart when the window is widened past the phone layout', () => {
    media.setMatching((query) => query === NARROW_MQ)
    render(<AdjustStack draft={draft} />)
    expect(mini()).toBeInTheDocument()

    act(() => media.change(NARROW_MQ, false))

    expect(document.getElementById(ADJUST_STACK_ID)).not.toBeInTheDocument()
    expect(mini()).not.toBeInTheDocument()
  })
})
