import type { CSSProperties } from 'react'
import type { Milestone } from '../../../../types'
import { milestoneLabelWithAmount, type MoneyFormat } from '../../../../engine'
import { formatMoneyShort } from '../chartTheme'
import { GUTTER } from './timelineModel'

/** What every row of the timeline draws against. */
export interface Frame {
  milestones: Milestone[]
  reached: Map<number, string>
  /** The calendar year the axis starts in, which is today's. */
  startYear: number
  span: number
  /** The width in pixels the axis takes, which decides how many labels fit. */
  track: number
  /** The milestone being followed, or null. */
  follow: number | null
  /** Each milestone as prose ("House deposit (100k €)") and as a short amount ("100k"). */
  full: string[]
  bare: string[]
  onRead: (text: string) => void
}

export const at = (
  t: number,
  span: number,
): CSSProperties => ({ '--t': t / span }) as CSSProperties

/** The frame for the timeline as it is drawn now: `width` is the tracks' measured width. */
export function timelineFrame({
  milestones,
  reached,
  startYear,
  span,
  width,
  follow,
  format,
  onRead,
}: Omit<Frame, 'track' | 'full' | 'bare'> & { width: number; format: MoneyFormat }): Frame {
  return {
    milestones,
    reached,
    startYear,
    span,
    track: Math.max(0, width - 2 * GUTTER),
    follow,
    full: milestones.map((m) => milestoneLabelWithAmount(m, (cents) => formatMoneyShort(cents, format))),
    bare: milestones.map((m) => formatMoneyShort(m.amountCents, { ...format, symbol: '' }).trim()),
    onRead,
  }
}
