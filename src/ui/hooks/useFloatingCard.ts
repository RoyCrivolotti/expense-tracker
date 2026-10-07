import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import type { Placement, Turn } from './cardPlacement'
import { attachFloatingCard } from './floatingCard'

/**
 * Lets a card be moved about a box by its grip or the arrow keys, and made larger or smaller by its
 * corner, always whole: the card is as big as its content scaled (so everything on it is shown, with
 * no scrolling), and the box is never left. It is kept where it was, by its share of the room it
 * has, when the box or what the card says changes size.
 *
 * The caller keeps `placement` (which this updates as the card is moved) and `choice` (the scale
 * asked for, null until it has been), which are what outlive the card. The card's own element is
 * given its size and its `transform` and nothing else, so whatever animates it must be a different
 * one, and `content` is scaled by this too. `frozen` leaves a card where it is while it leaves.
 */
export function useFloatingCard({
  stage,
  card,
  bar,
  foot,
  content,
  grip,
  corner,
  placement,
  choice,
  turn,
  frozen,
}: {
  stage: RefObject<HTMLElement | null>
  card: RefObject<HTMLElement | null>
  bar: RefObject<HTMLElement | null>
  foot: RefObject<HTMLElement | null>
  content: RefObject<HTMLElement | null>
  grip: RefObject<HTMLElement | null>
  corner: RefObject<HTMLElement | null>
  placement: RefObject<Placement>
  choice: RefObject<number | null>
  turn: Turn
  frozen: boolean
}): void {
  // Read when a gesture starts, so a phone turning does not take the listeners down.
  const turnNow = useRef(turn)
  useEffect(() => {
    turnNow.current = turn
  }, [turn])

  useLayoutEffect(() => {
    const els = {
      stage: stage.current,
      card: card.current,
      bar: bar.current,
      foot: foot.current,
      content: content.current,
      grip: grip.current,
      corner: corner.current,
    }
    if (frozen || !els.stage || !els.card || !els.bar || !els.foot || !els.content || !els.grip || !els.corner) return
    return attachFloatingCard({
      stage: els.stage,
      card: els.card,
      bar: els.bar,
      foot: els.foot,
      content: els.content,
      grip: els.grip,
      corner: els.corner,
      placement,
      choice,
      turn: () => turnNow.current,
    })
  }, [stage, card, bar, foot, content, grip, corner, placement, choice, frozen])
}
