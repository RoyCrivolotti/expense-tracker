export type AdjustSection = 'portfolio' | 'housing' | 'fire' | 'tracking' | 'events'

/** The sections of the Adjust controls, in the order they are shown. `chip` is the short label
 *  the phone's section row uses; `title` is the section's own heading. */
export const ADJUST_SECTIONS: readonly { key: AdjustSection; title: string; chip: string }[] = [
  { key: 'portfolio', title: 'Portfolio', chip: 'Portfolio' },
  { key: 'housing', title: 'Housing', chip: 'Housing' },
  { key: 'fire', title: 'FIRE / withdrawal', chip: 'FIRE' },
  { key: 'tracking', title: 'Plan tracking', chip: 'Tracking' },
  { key: 'events', title: 'Life events', chip: 'Events' },
]

export function adjustSectionId(key: AdjustSection): string {
  return `goals-adjust-${key}`
}

/**
 * The section the viewer is in: the last whose top has reached the line under the pinned
 * stack. A last section too short to ever reach that line would never be the answer, so when
 * the page ends in it (scrolled to the end, with that section's controls shown) it is named.
 * Folded, it is a row at the foot of the page, and what is being read is the section above.
 */
export function pickActiveSection(tops: readonly number[], line: number, endsInLast: boolean): number {
  if (endsInLast) return tops.length - 1
  let active = 0
  tops.forEach((top, i) => {
    if (top <= line) active = i
  })
  return active
}
