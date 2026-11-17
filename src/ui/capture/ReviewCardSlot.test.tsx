import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeRecommendation } from '../../testing/reviewKit'
import { setMotionDisabledForTests } from '../hooks/motion'
import { ReviewCardSlot } from './ReviewCardSlot'
import { ReviewContext, type ReviewCore } from './reviewContext'

// The card stands in for its lazy chunk: whether it mounts is whether the chunk is fetched.
vi.mock('./ReviewCard', () => ({ default: () => <p>card chunk mounted</p> }))

const coreWith = (items: ReviewCore['items']) => ({ items, count: items.length }) as ReviewCore

function slot(core: ReviewCore | null) {
  return render(
    <ReviewContext.Provider value={core}>
      <ReviewCardSlot />
    </ReviewContext.Provider>,
  )
}

beforeEach(() => setMotionDisabledForTests(true))

describe('the review card slot', () => {
  it('loads the card once a payment is open', async () => {
    slot(coreWith([makeRecommendation()]))

    expect(await screen.findByText('card chunk mounted')).toBeInTheDocument()
  })

  it('does not load the card while nothing is open', async () => {
    slot(coreWith([]))

    // A lazy import resolves within a few ticks; give it them before saying it never came.
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(screen.queryByText('card chunk mounted')).not.toBeInTheDocument()
  })

  it('shows nothing without a provider', () => {
    const { container } = slot(null)

    expect(container).toBeEmptyDOMElement()
  })
})
