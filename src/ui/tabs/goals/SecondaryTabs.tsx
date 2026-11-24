import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Card } from '../../components/primitives'
import { useRadioGroupKeys } from '../../hooks/useRadioGroupKeys'
import styles from './goals.module.css'

const VIEWS = [
  { value: 'compare', label: 'Compare' },
  { value: 'composition', label: 'Composition' },
  { value: 'milestones', label: 'Milestones' },
  { value: 'fire', label: 'FI' },
  { value: 'rent', label: 'Rent vs buy' },
  { value: 'savings', label: 'Investing' },
  { value: 'spread', label: 'Spread' },
] as const

export type SecondaryView = (typeof VIEWS)[number]['value']

/** Tracks whether a horizontally scrollable element has more content off either edge. */
function useScrollEdges() {
  const ref = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ atStart: true, atEnd: true })
  const update = useCallback(() => {
    const el = ref.current
    if (!el) return
    const atStart = el.scrollLeft <= 1
    const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1
    setEdges((prev) => (prev.atStart === atStart && prev.atEnd === atEnd ? prev : { atStart, atEnd }))
  }, [])
  useEffect(() => {
    const el = ref.current
    if (!el) return
    update()
    el.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      el.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [update])
  return { ref, ...edges }
}

function SecondaryTabPicker({ view, onViewChange }: { view: SecondaryView; onViewChange: (v: SecondaryView) => void }) {
  const { ref, atStart, atEnd } = useScrollEdges()
  const { stop, onKeyDown } = useRadioGroupKeys({
    groupRef: ref,
    count: VIEWS.length,
    selected: VIEWS.findIndex((v) => v.value === view),
    onSelect: (index) => {
      const next = VIEWS[index]
      if (next && next.value !== view) onViewChange(next.value)
    },
  })
  const scrollStep = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * 140, behavior: 'smooth' })
  const cls = [styles.tabScroller, atStart ? '' : styles.canScrollLeft, atEnd ? '' : styles.canScrollRight]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={cls}>
      <button
        type="button"
        className={`${styles.tabChevron} ${styles.tabChevronLeft}`}
        aria-label="Scroll chart tabs left"
        tabIndex={-1}
        onClick={() => scrollStep(-1)}
      >
        ‹
      </button>
      <div
        className={styles.chipRow}
        role="radiogroup"
        aria-label="Secondary chart view"
        ref={ref}
        onKeyDown={onKeyDown}
      >
        {VIEWS.map((opt, i) => (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={view === opt.value}
            tabIndex={i === stop ? 0 : -1}
            className={`${styles.chip}${view === opt.value ? ` ${styles.chipActive}` : ''}`}
            onClick={() => onViewChange(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        className={`${styles.tabChevron} ${styles.tabChevronRight}`}
        aria-label="Scroll chart tabs right"
        tabIndex={-1}
        onClick={() => scrollStep(1)}
      >
        ›
      </button>
    </div>
  )
}

export function TabbedChart({
  view,
  onViewChange,
  children,
}: {
  view: SecondaryView
  onViewChange: (v: SecondaryView) => void
  children: ReactNode
}) {
  return (
    <Card className={styles.tabbedChart}>
      <div className={styles.tabHeader}>
        <SecondaryTabPicker view={view} onViewChange={onViewChange} />
      </div>
      <div className={styles.tabBody}>{children}</div>
    </Card>
  )
}
