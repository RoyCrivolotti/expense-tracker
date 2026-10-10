import { useRef, type ReactNode } from 'react'
import { useNearViewport } from '../../../hooks/useNearViewport'

/** How far from the screen a card still counts as near: far enough to be ready before a scroll reaches it. */
const NEAR_PX = 500

/**
 * Tells a card whether it is near the screen, so it can leave its costly work until then. Its box
 * is the card's own, so the page lays out as it did without it.
 */
export function NearScreen({ children }: { children: (near: boolean) => ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const near = useNearViewport(ref, NEAR_PX)
  return <div ref={ref}>{children(near)}</div>
}
