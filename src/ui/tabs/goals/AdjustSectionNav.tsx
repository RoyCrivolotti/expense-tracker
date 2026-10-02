import { useEffect, useRef, useState } from 'react'
import {
  ADJUST_SECTIONS,
  adjustSectionId,
  pickActiveSection,
  type AdjustSection,
} from './adjustSections'
import { keepClearOfStack, scrollToAdjustSection, stackBottom } from './scrollToAdjustSection'
import { useGoalsNarrow } from './useGoalsNarrow'
import styles from './goals.module.css'

/** What can be done with edits to a saved scenario that have not been saved. */
export interface UnsavedActions {
  /** The scenario the edits are to. The buttons are named after it, since the scenario card
   *  above the controls has a Save and a Discard of its own. */
  name: string
  onSave: () => void
  onDiscard: () => void
}

/** Under the line by this much, a section counts as the one being read. */
const READING_MARGIN_PX = 12

/** How the viewer got to scrolling: a touch, the wheel, a key or a press (a scrollbar drag
 *  makes no other event), rather than a chip's jump. */
const USER_SCROLL_EVENTS = ['touchstart', 'wheel', 'keydown', 'pointerdown'] as const

/**
 * Jump links to the Adjust sections, pinned with the draft's chart so a slider two sections
 * down is a tap away. The chip for the section being read is marked as it scrolls past.
 *
 * A chip's section cannot always reach the top of the screen (the last ones sit on a short
 * page), so after a tap that chip stays marked until the viewer scrolls for themselves.
 *
 * Edits to a saved scenario are saved or dropped from the same row, since the controls that
 * make them are screens below the card that holds those buttons.
 */
export function AdjustSectionNav({ unsaved }: { unsaved?: UnsavedActions | undefined }) {
  const narrow = useGoalsNarrow()
  const [active, setActive] = useState<AdjustSection>('portfolio')
  const strip = useRef<HTMLDivElement>(null)
  const pinned = useRef(false)

  useEffect(() => {
    if (!narrow) return
    const update = () => {
      if (pinned.current) return
      const sections = ADJUST_SECTIONS.map((s) => document.getElementById(adjustSectionId(s.key)))
      const tops = sections.map((el) => el?.getBoundingClientRect().top ?? Infinity)
      const atBottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2
      const endsIn = atBottom ? sections.map((el) => el instanceof HTMLDetailsElement && el.open).lastIndexOf(true) : -1
      const next = ADJUST_SECTIONS[pickActiveSection(tops, stackBottom() + READING_MARGIN_PX, endsIn)]
      if (next) setActive(next.key)
    }
    const release = () => {
      pinned.current = false
    }
    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    for (const type of USER_SCROLL_EVENTS) window.addEventListener(type, release, { passive: true })
    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
      for (const type of USER_SCROLL_EVENTS) window.removeEventListener(type, release)
    }
  }, [narrow])

  // A field that takes focus, with the keyboard up or from a key press, is not left behind the
  // pinned block. Buttons are not fields to clear, and the block's own are not under it.
  useEffect(() => {
    if (!narrow) return
    const onFocus = (event: FocusEvent) => {
      const target = event.target
      if (target instanceof Element && target.matches('input, select, textarea')) keepClearOfStack(target)
    }
    document.addEventListener('focusin', onFocus)
    return () => document.removeEventListener('focusin', onFocus)
  }, [narrow])

  // The strip scrolls sideways, so the marked chip is kept in sight inside it. The actions
  // narrow it when they appear, which can leave the marked chip half under the fade.
  const hasActions = unsaved !== undefined
  useEffect(() => {
    const chip = strip.current?.querySelector<HTMLElement>('[aria-current="true"]')
    const row = strip.current
    if (!chip || !row || typeof row.scrollTo !== 'function') return
    row.scrollTo({ left: chip.offsetLeft - (row.clientWidth - chip.offsetWidth) / 2, behavior: 'smooth' })
  }, [active, hasActions])

  if (!narrow) return null
  return (
    <div className={`${styles.sectionRow}${unsaved ? ` ${styles.sectionRowActions}` : ''}`}>
      <nav aria-label="Adjust sections" className={styles.sectionNav}>
        <div className={`${styles.chipRow} ${styles.sectionChips}`} ref={strip}>
          {ADJUST_SECTIONS.map((s) => (
            <button
              key={s.key}
              type="button"
              className={`${styles.chip}${s.key === active ? ` ${styles.chipActive}` : ''}`}
              aria-current={s.key === active ? 'true' : undefined}
              onClick={() => {
                pinned.current = true
                setActive(s.key)
                scrollToAdjustSection(s.key, 'smooth')
              }}
            >
              {s.chip}
            </button>
          ))}
        </div>
      </nav>
      {unsaved ? (
        <div role="group" aria-label="Unsaved changes" className={styles.unsavedActions}>
          <button type="button" className={styles.btn} aria-label="Discard changes" onClick={unsaved.onDiscard}>
            Discard
          </button>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPrimary}`}
            aria-label={`Save changes to ${unsaved.name}`}
            onClick={unsaved.onSave}
          >
            Save
          </button>
        </div>
      ) : null}
    </div>
  )
}
