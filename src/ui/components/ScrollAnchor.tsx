import { Component, type RefObject } from 'react'
import { anchorShift, captureAnchor, type Anchor } from '../hooks/windowDom'

/** Moves under this are layout rounding, not a row changing size. */
const SHIFT_PX = 0.5

interface ScrollAnchorProps {
  list: RefObject<HTMLElement | null>
}

/**
 * Keeps what the viewer is reading where it is when rows above it change size.
 *
 * The windowed list only measures a row once it is rendered, so a row above the screen that turns
 * out taller or shorter than guessed moves everything under it. Chromium would put that right by
 * itself, but the list opts out of that (`overflow-anchor`) so every engine behaves the same, and
 * WebKit has no such thing. The row at the top of the screen is looked up before React changes
 * the DOM and again after, and the page is scrolled by the difference. Only a class component is
 * told what the DOM was like just before an update (getSnapshotBeforeUpdate).
 */
export class ScrollAnchor extends Component<ScrollAnchorProps, unknown, Anchor | null> {
  getSnapshotBeforeUpdate(): Anchor | null {
    const list = this.props.list.current
    return list ? captureAnchor(list) : null
  }

  componentDidUpdate(_props: ScrollAnchorProps, _state: unknown, anchor: Anchor | null) {
    const shift = anchorShift(anchor)
    if (Math.abs(shift) >= SHIFT_PX) window.scrollBy(0, shift)
  }

  render() {
    return null
  }
}
