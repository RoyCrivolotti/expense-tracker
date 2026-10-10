import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { GoalScenario, Milestone } from '../../../types'
import type { NewGoalScenario } from '../../../data/dataSource'
import { Card } from '../../components/primitives'
import { useRadioGroupKeys } from '../../hooks/useRadioGroupKeys'
import { ScenarioComparison } from './charts/ScenarioComparison'
import { CompositionChart } from './charts/CompositionChart'
import { MilestoneMatrix } from './charts/MilestoneMatrix'
import { FireChart } from './charts/FireChart'
import { RentVsOwnChart } from './charts/RentVsOwnChart'
import { LazySpreadChart } from './charts/LazySpreadChart'
import { preloadSpreadChart } from './charts/spreadChartLoader'
import { SavingsRateChart } from './charts/SavingsRateChart'
import type { MonthlyFlow, PlanFromToday } from '../../../engine'
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

type SecondaryView = (typeof VIEWS)[number]['value']

/** Tracks whether a horizontally scrollable element has more content off either edge. */
function useScrollEdges() {
  const ref = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ atStart: true, atEnd: true })
  const update = useCallback(() => {
    const el = ref.current
    if (!el) return
    const atStart = el.scrollLeft <= 1
    const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1
    setEdges((prev) =>
      prev.atStart === atStart && prev.atEnd === atEnd ? prev : { atStart, atEnd },
    )
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

const PRELOAD_DELAY_MS = 1_500

interface SecondaryChartsProps {
  scenarios: GoalScenario[]
  draft: NewGoalScenario
  monthly: MonthlyFlow[]
  milestones: Milestone[]
  reached: Map<number, string>
  /**
   * The draft is a row of its own in the tables only when it is a line of its own on the
   * chart: detached, or a loaded scenario with edits. Loaded and unchanged, it is that
   * scenario, and the chart draws it once.
   */
  activeId: number | null
  dirty: boolean
  /** The plan restarted from the latest check-in, for the tables that list scenarios. */
  fromToday: PlanFromToday | null
  /** The Nominal view: the spread is drawn in the money of each year, as the main chart is. */
  nominal?: boolean
}

function SecondaryViewChart({
  view,
  scenarios,
  draft,
  monthly,
  milestones,
  reached,
  includeDraft,
  fromToday,
  nominal,
}: {
  view: SecondaryView
  scenarios: GoalScenario[]
  draft: NewGoalScenario
  monthly: MonthlyFlow[]
  milestones: Milestone[]
  reached: Map<number, string>
  includeDraft: boolean
  fromToday: PlanFromToday | null
  nominal: boolean
}) {
  switch (view) {
    case 'compare':
      return <ScenarioComparison scenarios={scenarios} draft={draft} includeDraft={includeDraft} fromToday={fromToday} embedded />
    case 'composition':
      return <CompositionChart draft={draft} embedded />
    case 'milestones':
      return (
        <MilestoneMatrix
          scenarios={scenarios}
          draft={draft}
          milestones={milestones}
          reached={reached}
          includeDraft={includeDraft}
          fromToday={fromToday}
          embedded
        />
      )
    case 'fire':
      return <FireChart draft={draft} embedded />
    case 'rent':
      return <RentVsOwnChart draft={draft} embedded />
    case 'savings':
      return <SavingsRateChart draft={draft} monthly={monthly} embedded />
    case 'spread':
      return <LazySpreadChart draft={draft} milestones={milestones} nominal={nominal} embedded />
  }
}

function SecondaryTabPicker({
  view,
  onViewChange,
}: {
  view: SecondaryView
  onViewChange: (v: SecondaryView) => void
}) {
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
  const cls = [
    styles.tabScroller,
    atStart ? '' : styles.canScrollLeft,
    atEnd ? '' : styles.canScrollRight,
  ]
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

function TabbedChart({
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

export function SecondaryCharts({
  scenarios,
  draft,
  monthly,
  milestones,
  reached,
  activeId,
  dirty,
  fromToday,
  nominal = false,
}: SecondaryChartsProps) {
  const [view, setView] = useState<SecondaryView>('compare')
  const includeDraft = activeId === null || dirty
  // After the page has settled, so it does not compete with what the reader is looking at.
  useEffect(() => {
    const timer = setTimeout(preloadSpreadChart, PRELOAD_DELAY_MS)
    return () => clearTimeout(timer)
  }, [])

  return (
    <TabbedChart view={view} onViewChange={setView}>
      <SecondaryViewChart
        view={view}
        scenarios={scenarios}
        draft={draft}
        monthly={monthly}
        milestones={milestones}
        reached={reached}
        includeDraft={includeDraft}
        fromToday={fromToday}
        nominal={nominal}
      />
    </TabbedChart>
  )
}
