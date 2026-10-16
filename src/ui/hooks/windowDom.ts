import { DAY_HEADER_SELECTOR } from '../components/dayGroupId'
import type { Sample } from './rowHeights'

/** Marks the wrapper around each rendered row, which is what gets measured. */
export const ROW_ATTR = 'data-vrow'

export function readSamples(list: HTMLElement): Sample[] {
  return Array.from(list.querySelectorAll<HTMLElement>(`[${ROW_ATTR}]`), (el) => ({
    key: el.dataset.vrow ?? '',
    shape: Number(el.dataset.shape),
    height: el.getBoundingClientRect().height,
  }))
}

/** The height of a day header and the space between days, or null where nothing has layout (jsdom, a hidden tab). */
export function readChrome(list: HTMLElement): { header: number; gap: number } | null {
  const header = list.querySelector<HTMLElement>(DAY_HEADER_SELECTOR)?.getBoundingClientRect().height ?? 0
  const gap = Number.parseFloat(getComputedStyle(list).rowGap)
  return header > 0 && Number.isFinite(gap) ? { header, gap } : null
}

export interface Anchor {
  el: HTMLElement
  /** From the top of the screen. */
  top: number
}

/** The row at the top of the screen, and where it is. */
export function captureAnchor(list: HTMLElement): Anchor | null {
  for (const el of list.querySelectorAll<HTMLElement>(`[${ROW_ATTR}]`)) {
    const { top, bottom } = el.getBoundingClientRect()
    if (bottom > 0) return { el, top }
  }
  return null
}

/** How far the anchor has moved down the screen since it was captured; 0 if it is gone. */
export function anchorShift(anchor: Anchor | null): number {
  return anchor?.el.isConnected ? anchor.el.getBoundingClientRect().top - anchor.top : 0
}
