import { describe, expect, it, vi } from 'vitest'
import { buildMerchantIndex } from '../../domain/capture/review'
import { makeRecommendation, makeReviewModel } from '../../testing/reviewKit'
import type { TransactionSeed } from '../actions'
import { describeRecommendation, type ReviewView } from './reviewFields'
import { queuedSeed, WaitingList, type QueueSteps } from './reviewQueue'

const model = makeReviewModel()
const merchants = buildMerchantIndex(model.dataset.transactions)
const ID = (n: number) => `0b0c0d0e-1111-4222-8333-${String(n).padStart(12, '0')}`
const view = (n: number): ReviewView =>
  describeRecommendation(
    makeRecommendation({ id: ID(n), merchantRaw: `PLACE ${n}`, amountCents: 100 * n, localDate: '2026-11-10' }),
    model,
    merchants,
  )

function setUp(count: number) {
  const views = Array.from({ length: count }, (_, i) => view(i + 1))
  const list = new WaitingList()
  list.set(views)
  const steps: QueueSteps = {
    dontAdd: vi.fn(),
    rememberFor: () => () => Promise.resolve(null),
    choose: vi.fn(),
    intro: () => ({ arrived: '', amount: '', message: null, reasons: [], notes: [] }),
  }
  const open = (n: number) => queuedSeed(views[n - 1]!, list, steps)
  return { views, list, steps, open }
}

const idOf = (seed: TransactionSeed | undefined) => seed?.recommendationId
const spotOf = (seed: TransactionSeed | undefined) => seed?.queue?.spot()

describe('a payment placed among the ones waiting', () => {
  it('counts its place from one, in the order of the list', () => {
    const { open } = setUp(4)
    expect([1, 2, 3, 4].map((n) => spotOf(open(n)))).toEqual([
      { at: 1, of: 4 },
      { at: 2, of: 4 },
      { at: 3, of: 4 },
      { at: 4, of: 4 },
    ])
  })

  it('moves to the one before and after without deciding anything, and goes nowhere past either end', () => {
    const { open, steps, list } = setUp(3)
    const middle = open(2)
    expect(idOf(middle.queue!.previous())).toBe(ID(1))
    expect(idOf(middle.queue!.following())).toBe(ID(3))
    expect(open(1).queue!.previous()).toBeUndefined()
    expect(open(3).queue!.following()).toBeUndefined()
    expect(steps.dontAdd).not.toHaveBeenCalled()
    expect(list.open()).toHaveLength(3)
  })

  it('walks to every payment and back to where it started', () => {
    const { open } = setUp(5)
    let seed: TransactionSeed | undefined = open(3)
    const seen = [idOf(seed)]
    for (const step of ['following', 'following', 'previous', 'previous', 'previous', 'previous'] as const) {
      seed = seed!.queue![step]()
      seen.push(idOf(seed))
    }
    expect(seen).toEqual([ID(3), ID(4), ID(5), ID(4), ID(3), ID(2), ID(1)])
  })
})

describe('deciding the payment on screen', () => {
  it('shows the one after it in the same place, and the saved one never comes back', () => {
    const { open } = setUp(4)
    const next = open(2).queue!.next()
    expect(idOf(next)).toBe(ID(3))
    expect(spotOf(next)).toEqual({ at: 2, of: 3 })
    // The list still holds it until it is read again; the arrows must not.
    expect(idOf(next!.queue!.previous())).toBe(ID(1))
  })

  it('shows the one before it at the end of the list, so none still waiting is passed over', () => {
    const { open } = setUp(3)
    const next = open(3).queue!.next()
    expect(idOf(next)).toBe(ID(2))
    expect(spotOf(next)).toEqual({ at: 2, of: 2 })
  })

  it('ends when it was the only one', () => {
    const { open } = setUp(1)
    expect(open(1).queue!.next()).toBeUndefined()
    expect(setUp(1).open(1).queue!.dontAdd()).toBeUndefined()
  })

  it('puts it aside on Don’t add, leaves it out at once, and counts it again when it is undone', () => {
    const { open, steps, list, views } = setUp(3)
    const next = open(1).queue!.dontAdd()
    expect(steps.dontAdd).toHaveBeenCalledWith(views[0])
    expect(idOf(next)).toBe(ID(2))
    expect(spotOf(next)).toEqual({ at: 1, of: 2 })
    // Undo puts it back in the list's views.
    list.set(views)
    expect(spotOf(next)).toEqual({ at: 2, of: 3 })
  })

  it('never shows 0 of N for a payment still waiting, however the list changes', () => {
    const { open, list, views } = setUp(3)
    const seed = open(2)
    list.set([view(9), ...views])
    expect(spotOf(seed)).toEqual({ at: 3, of: 4 })
    list.set([views[1]!])
    expect(spotOf(seed)).toEqual({ at: 1, of: 1 })
  })
})

describe('a payment that leaves the list under the form', () => {
  it('says it is no longer waiting, and deciding it shows the one now in its place', () => {
    const { open, list, views } = setUp(4)
    const seed = open(3)
    expect(spotOf(seed)).toEqual({ at: 3, of: 4 })
    list.set([views[0]!, views[1]!, views[3]!])
    expect(spotOf(seed)).toEqual({ at: 0, of: 3 })
    expect(seed.queue!.previous()).toBeUndefined()
    expect(seed.queue!.following()).toBeUndefined()
    expect(idOf(seed.queue!.next())).toBe(ID(4))
  })

  it('remembers where it last was as the list shifted, so deciding it shows the one that followed it', () => {
    const { open, list, views } = setUp(7)
    const seed = open(4)
    // Payment 1 is decided elsewhere: the form's payment moves up one, and the pager reads its place again.
    list.set(views.slice(1))
    expect(spotOf(seed)).toEqual({ at: 3, of: 6 })
    // Then the payment on screen itself goes.
    list.set(views.filter((_, i) => i !== 0 && i !== 3))
    expect(idOf(seed.queue!.dontAdd())).toBe(ID(5))
  })

  it('shows the last one left when everything after it went too', () => {
    const { open, list, views } = setUp(4)
    const seed = open(4)
    seed.queue!.spot()
    list.set([views[0]!])
    expect(idOf(seed.queue!.dontAdd())).toBe(ID(1))
  })
})

describe('the waiting list', () => {
  it('forgets a saved payment once the list no longer has it, and keeps it out until then', () => {
    const { list, views } = setUp(2)
    list.saveOf(ID(1))
    list.set(views)
    expect(list.open().map((v) => v.rec.id)).toEqual([ID(2)])
    list.set([views[1]!])
    // Listed again later (another device undid it, say), it is a payment waiting like any other.
    list.set(views)
    expect(list.open().map((v) => v.rec.id)).toEqual([ID(1), ID(2)])
  })

  it('tells whoever watches when it changes, until they stop', () => {
    const { list, views } = setUp(2)
    const heard = vi.fn()
    const stop = list.watch(heard)
    list.set(views)
    list.saveOf(ID(1))
    list.putAside(ID(2))
    expect(heard).toHaveBeenCalledTimes(3)
    stop()
    list.set(views)
    expect(heard).toHaveBeenCalledTimes(3)
  })
})
