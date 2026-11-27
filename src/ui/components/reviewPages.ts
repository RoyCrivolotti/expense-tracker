import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type Dispatch, type SetStateAction } from 'react'
import type { TransactionSeed } from '../actions'
import type { QueueSpot, SeedQueue } from '../seedQueue'
import { EXIT_MS, motionEnabled } from '../hooks/motion'
import { prefersReducedMotion } from '../hooks/prefersReducedMotion'

const noWatch = () => () => {}

/** Where the form's payment sits among the ones waiting, read again whenever that list changes. */
export function useQueueSpot(queue: SeedQueue | undefined): QueueSpot {
  // A string, so an unchanged place reads as the same snapshot and does not draw again.
  const text = useSyncExternalStore(queue?.watch ?? noWatch, () => {
    const spot = queue?.spot()
    return spot ? `${spot.at}/${spot.of}` : '0/0'
  })
  const [at = 0, of = 0] = text.split('/').map(Number)
  return { at, of }
}

/** One payment the review sheet has shown since it opened, kept with its form. */
export interface ReviewPage {
  key: string
  seed: TransactionSeed
}

const keyOf = (seed: TransactionSeed) => `${seed.recommendationId ?? ''}|${seed.fromSeries ?? ''}`

/** A setter that puts `key` in the set or takes it out, and keeps the same set when nothing changes. */
const toggler =
  (set: Dispatch<SetStateAction<ReadonlySet<string>>>) =>
  (
    key: string,
    on: boolean,
  ) =>
    set((held) => {
      if (held.has(key) === on) return held
      const next = new Set(held)
      if (on) next.add(key)
      else next.delete(key)
      return next
    })

const samePages = (
  a: readonly ReviewPage[],
  b: readonly ReviewPage[],
) => a.length === b.length && a.every((p, i) => p === b[i])

/**
 * Whether `seed` starts a fresh form for its payment rather than showing the one kept for it: only when the person
 * picked a series for it, which fills the fields anew. The arrows build a payment from the list, where a series picked
 * in the form is not recorded, so a seed with no series never replaces a kept one.
 */
const replaces = (
  seed: TransactionSeed,
  kept: ReviewPage | undefined,
) => !kept || (seed.fromSeries !== undefined && seed.fromSeries !== kept.seed.fromSeries)

/**
 * The payments the review sheet has shown since it opened, each kept with its own form, so that what was typed or
 * chosen for one is still there when the person comes back to it. The form on screen is the seed's payment's. A payment
 * shown again keeps the form it had, the series picked for it included; picking another series for it starts a fresh
 * one, as it always has. A payment no longer waiting (added, put aside, linked) is let go with whatever was typed for
 * it. Null outside a review.
 */
export function useReviewPages(seed: TransactionSeed | undefined) {
  const [pages, setPages] = useState<readonly ReviewPage[]>([])
  const [dirty, setDirty] = useState<ReadonlySet<string>>(new Set())
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set())
  // Drawn again when the list changes, to let go of the payments decided.
  useQueueSpot(seed?.queue)
  const setters = useMemo(() => ({ dirty: toggler(setDirty), busy: toggler(setBusy) }), [])
  if (!seed?.queue || !seed.recommendationId) return null
  const id = seed.recommendationId
  const own = pages.find((p) => p.seed.recommendationId === id)
  const current = replaces(seed, own) ? { key: keyOf(seed), seed } : own!
  // In the order they were first shown, so no form's element moves in the page.
  const live = pages
    .filter((p) => p === own || (p.seed.queue?.spot().at ?? 0) > 0)
    .map((p) => (p === own ? current : p))
  if (!own) live.push(current)
  const shown = current.key
  if (!samePages(live, pages)) setPages(live)
  return {
    pages: live,
    shown,
    /** Some payment's form holds a change, on screen or not, so closing the sheet asks before it discards it. */
    dirty: live.some((p) => dirty.has(p.key)),
    /** The payment on screen is being saved, so the sheet stays on it until that is done. */
    busy: busy.has(shown),
    setDirty: setters.dirty,
    setBusy: setters.busy,
  }
}

export type PageDirection = 'previous' | 'next'

/** The arrows' move from one payment to another, and where it is in its motion. */
export interface PageMove {
  dir: PageDirection
  /**
   * `out` while the payment on screen leaves, `in` while the next one arrives, `held` for a moment after a move made at
   * once, which has no motion to wait for.
   */
  phase: 'out' | 'in' | 'held'
}

/** About as long as a move takes with motion: a second tap within it is the same double tap. */
const HOLD_MS = 300

/**
 * Moves the review sheet to the payment before or after, leaving the one on screen waiting. The one on screen slides
 * out the way the list goes and the other slides in from the far side, mirrored for the other arrow. A press while a
 * move is under way does nothing, so a double tap moves once. For someone who asked for less movement the move is at
 * once, and held for a moment just the same.
 */
export function usePageMove(
  queue: SeedQueue | undefined,
  open: (seed: TransactionSeed) => void,
) {
  const [move, setMove] = useState<PageMove | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  const land = (dir: PageDirection) => {
    const seed = dir === 'previous' ? queue?.previous() : queue?.following()
    if (seed) open(seed)
  }
  const go = (dir: PageDirection) => {
    if (move || !queue) return
    if (!motionEnabled()) {
      land(dir)
      // Without the motion there is nothing to wait for, but a double tap still moves once.
      if (prefersReducedMotion()) {
        setMove({ dir, phase: 'held' })
        timer.current = setTimeout(() => setMove(null), HOLD_MS)
      }
      return
    }
    setMove({ dir, phase: 'out' })
    timer.current = setTimeout(() => {
      land(dir)
      setMove({ dir, phase: 'in' })
      // The arrival's animation says when it is done; this lets go if it never plays.
      timer.current = setTimeout(() => setMove(null), EXIT_MS.sheet * 2)
    }, EXIT_MS.fade)
  }
  const arrived = () => {
    clearTimeout(timer.current)
    setMove(null)
  }
  return { move, go, arrived, exitMs: EXIT_MS.fade }
}

/**
 * The review sheet's part of the modal: the forms kept for each payment shown and the move between them. Every kept
 * form counts towards the close guard, so closing asks before discarding a change made to a payment the person has
 * moved away from. `review` is null outside a review.
 */
export function useReviewSheet(
  seed: TransactionSeed | undefined,
  open: (seed: TransactionSeed) => void,
  setDirty: (dirty: boolean) => void,
) {
  const review = useReviewPages(seed)
  const move = usePageMove(seed?.queue, open)
  const dirty = review?.dirty
  useEffect(() => {
    if (dirty !== undefined) setDirty(dirty)
  }, [dirty, setDirty])
  return { review, move }
}

export type ReviewSheet = ReturnType<typeof useReviewSheet>
