export type AdjustSection = 'portfolio' | 'housing' | 'fire' | 'tracking' | 'events'

/**
 * What each section is called: `chip` is the short label the phone's section row uses and
 * `title` is the section's own heading. A record, so a section without a name does not compile.
 * The order the keys are written in is the order the sections are shown in.
 */
export const ADJUST_LABELS: Record<AdjustSection, { title: string; chip: string }> = {
  portfolio: { title: 'Portfolio', chip: 'Portfolio' },
  housing: { title: 'Housing', chip: 'Housing' },
  fire: { title: 'Financial independence', chip: 'FI' },
  tracking: { title: 'Plan start', chip: 'Start date' },
  events: { title: 'Life events', chip: 'Events' },
}

/** The sections of the Scenarios controls, in the order they are shown. */
export const ADJUST_SECTIONS: readonly { key: AdjustSection; title: string; chip: string }[] = (
  Object.keys(ADJUST_LABELS) as AdjustSection[]
).map((key) => ({ key, ...ADJUST_LABELS[key] }))

const SECTION_ID_PREFIX = 'goals-adjust-'

export function adjustSectionId(key: AdjustSection): string {
  return `${SECTION_ID_PREFIX}${key}`
}

/** Whether an element is inside the controls of one of the sections (the pinned stack, which
 *  shares the id's prefix, is not a `<details>`). */
export function inAdjustControls(el: Element): boolean {
  return el.closest(`details[id^="${SECTION_ID_PREFIX}"]`) !== null
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
