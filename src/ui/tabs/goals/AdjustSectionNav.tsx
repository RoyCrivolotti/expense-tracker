import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { scrollBehavior } from '../../hooks/scrollTiming'
import {
  ADJUST_SECTIONS,
  adjustSectionId,
  inAdjustControls,
  pickActiveSection,
  type AdjustSection,
} from './adjustSections'
import { keepClearOfStack, pinnedBottom, scrollToAdjustSection } from './scrollToAdjustSection'
import { NameHintLine, UnsavedGroup, type UnsavedActions } from './UnsavedGroup'
import { useGoalsNarrow } from './useGoalsNarrow'
import styles from './goals.module.css'

/** Under the line by this much, a section counts as the one being read. */
const READING_MARGIN_PX = 12

/** How the viewer got to scrolling: a touch, the wheel, a key or a press (a scrollbar drag
 *  makes no other event), rather than a chip's jump. */
const USER_SCROLL_EVENTS = ['touchstart', 'wheel', 'keydown', 'pointerdown'] as const

/**
 * Save and Discard at the end of the row, and while the scenario has no name the reason Save is
 * off on a line of its own under them (the row is a phone's width, with no room beside them, and
 * a tooltip is never shown to a finger).
 */
function RowActions({ unsaved, onGone }: { unsaved: UnsavedActions; onGone: () => void }) {
  const hintId = useId()
  const unnamed = unsaved.name.trim().length === 0
  return (
    <>
      <UnsavedGroup unsaved={unsaved} onGone={onGone} hintId={hintId} />
      {unnamed ? <NameHintLine id={hintId} className={styles.sectionHint} /> : null}
    </>
  )
}

/**
 * Jump links to the Scenario sections, pinned with the draft's chart (on a screen with room for
 * both) so a slider two sections down is a tap away. The chip for the section being read is
 * marked as it scrolls past.
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
      const next = ADJUST_SECTIONS[pickActiveSection(tops, pinnedBottom() + READING_MARGIN_PX, endsIn)]
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

  // A field of the controls that takes focus, with the keyboard up or from a key press, is not
  // left behind the pinned block. Buttons are not fields to clear, the block's own are not
  // under it, and a dialog's field is on a layer of its own that the block does not cover.
  useEffect(() => {
    if (!narrow) return
    const onFocus = (event: FocusEvent) => {
      const target = event.target
      if (target instanceof Element && target.matches('input, select, textarea') && inAdjustControls(target)) {
        keepClearOfStack(target)
      }
    }
    document.addEventListener('focusin', onFocus)
    return () => document.removeEventListener('focusin', onFocus)
  }, [narrow])

  // Where focus goes when the actions leave with it: the chip for the section being read.
  const focusMarkedChip = useCallback(() => {
    strip.current?.querySelector<HTMLElement>('[aria-current="true"]')?.focus({ preventScroll: true })
  }, [])

  // The strip scrolls sideways, so the marked chip is kept in sight inside it. The actions
  // narrow it when they appear, which can leave the marked chip half under the fade.
  const hasActions = unsaved !== undefined
  useEffect(() => {
    const chip = strip.current?.querySelector<HTMLElement>('[aria-current="true"]')
    const row = strip.current
    if (!chip || !row || typeof row.scrollTo !== 'function') return
    row.scrollTo({
      left: chip.offsetLeft - (row.clientWidth - chip.offsetWidth) / 2,
      behavior: scrollBehavior('smooth'),
    })
  }, [active, hasActions])

  if (!narrow) return null
  return (
    <div className={`${styles.sectionRow}${unsaved ? ` ${styles.sectionRowActions}` : ''}`}>
      <nav aria-label="Scenario sections" className={styles.sectionNav}>
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
      {unsaved ? <RowActions unsaved={unsaved} onGone={focusMarkedChip} /> : null}
    </div>
  )
}
