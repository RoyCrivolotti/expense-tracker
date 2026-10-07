import { clampPx, onDevicePixels, placementToPx, pxToPlacement, type Placement, type Point } from './cardPlacement'
import { effectiveScale, scaledSize } from './cardScale'
import type { Size } from './useElementSize'

export interface CardElements {
  /** The box the card is moved about in. */
  stage: HTMLElement
  /** The card as a whole: given its size and its place here, and nothing else. */
  card: HTMLElement
  /** The controls along the card's top, which are not scaled. */
  bar: HTMLElement
  /** The room under the content that the resize corner takes, which is not scaled either. */
  foot: HTMLElement
  /** What the card says, laid out at its own size and drawn scaled. */
  content: HTMLElement
}

export interface CardLayout {
  box: () => Size
  size: () => Size
  at: () => Point
  scale: () => number
  /** The size the content is laid out at, before it is scaled. */
  natural: () => Size
  /** Size and place from what is known: the content, the box and the placement. */
  refresh: () => void
  /** A position, written as it is (a drag has already held it inside the box). */
  moveTo: (to: Point) => void
  /** A step, held inside the box, and remembered. */
  shift: (step: Point) => void
  /** A size, held to what is allowed, from where the card's top left is; what was asked for is kept. */
  rescale: (scale: number) => void
  /** Where the card is now, as a share of the room it has in the box and size that are given. */
  remember: (box: Size, size: Size) => void
}

/** Hundredths of a pixel, which is more than a screen can show and less than a float's own noise. */
const px = (value: number) => `${Math.round(value * 100) / 100}px`

/**
 * Where a floating card is and how big. The card is sized here, from its content's own size and the
 * box, and placed by a share of the room it has, so that when either changes it is put back
 * where it was. It is written to the elements directly: a drag or a resize has no React state, and
 * nothing is read that has been written by the same step, so a move is one write and no layout.
 *
 * `choice` is the scale the person has asked for (null until they have): kept by the caller, so that
 * it outlives the card.
 */
export function createLayout(
  { stage, card, bar, foot, content }: CardElements,
  placement: { current: Placement },
  choice: { current: number | null },
): CardLayout {
  let at: Point = { x: 0, y: 0 }
  let size: Size = { width: 0, height: 0 }
  let scale = 1
  const box = (): Size => ({ width: stage.clientWidth, height: stage.clientHeight })
  const natural = (): Size => ({ width: content.offsetWidth, height: content.offsetHeight })

  const resize = (wanted: number | null) => {
    const own = natural()
    const chrome = bar.offsetHeight + foot.offsetHeight
    scale = effectiveScale(wanted, box(), own, chrome)
    size = scaledSize(own, chrome, scale)
    content.style.transform = `scale(${scale})`
    card.style.width = px(size.width)
    card.style.height = px(size.height)
  }
  const place = (to: Point) => {
    at = clampPx(onDevicePixels(to, window.devicePixelRatio || 1), box(), size)
    card.style.transform = `translate3d(${at.x}px, ${at.y}px, 0)`
  }
  const remember = (inBox: Size, ofSize: Size) => {
    placement.current = pxToPlacement(at, inBox, ofSize, placement.current)
  }

  return {
    box,
    size: () => size,
    at: () => at,
    scale: () => scale,
    natural,
    refresh() {
      resize(choice.current)
      place(placementToPx(placement.current, box(), size))
    },
    moveTo(to) {
      at = to
      card.style.transform = `translate3d(${to.x}px, ${to.y}px, 0)`
    },
    shift(step) {
      place({ x: at.x + step.x, y: at.y + step.y })
      remember(box(), size)
    },
    rescale(wanted) {
      resize(wanted)
      choice.current = scale
      place(at)
    },
    remember,
  }
}
