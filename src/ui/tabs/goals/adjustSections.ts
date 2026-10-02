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

function sectionElement(key: AdjustSection): HTMLDetailsElement | null {
  const el = document.getElementById(adjustSectionId(key))
  return el instanceof HTMLDetailsElement ? el : null
}

/** The sections whose controls are shown on the page now, in the order they are shown. */
export function openAdjustSections(): AdjustSection[] {
  return ADJUST_SECTIONS.filter((s) => sectionElement(s.key)?.open).map((s) => s.key)
}

/** Show these sections' controls and fold the others. */
export function showAdjustSections(open: readonly AdjustSection[]): void {
  for (const s of ADJUST_SECTIONS) {
    const el = sectionElement(s.key)
    if (el) el.open = open.includes(s.key)
  }
}

/**
 * The section the viewer is in: the last whose top has reached the line under the pinned
 * stack. The sections at the end of the page may be too short, or folded to a row, to ever
 * reach that line, so scrolled to the end the answer is at least `endsIn`, the last section
 * whose controls are shown (-1 when not at the end, or when none is shown).
 */
export function pickActiveSection(tops: readonly number[], line: number, endsIn: number): number {
  let active = Math.max(endsIn, 0)
  tops.forEach((top, i) => {
    if (top <= line && i > active) active = i
  })
  return active
}
