import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { GoalScenario } from '../../../types'
import type { NewGoalScenario } from '../../../data/dataSource'
import { SegmentedControl } from '../../components/SegmentedControl'
import { Card } from '../../components/primitives'
import { CompositionChart } from './charts/CompositionChart'
import { MilestoneMatrix } from './charts/MilestoneMatrix'
import { FireChart } from './charts/FireChart'
import { RentVsOwnChart } from './charts/RentVsOwnChart'
import { SavingsRateChart, type MonthlySaving } from './charts/SavingsRateChart'
import styles from './goals.module.css'

const VIEWS = [
  { value: 'composition', label: 'Composition' },
  { value: 'milestones', label: 'Milestones' },
  { value: 'fire', label: 'FIRE' },
  { value: 'rent', label: 'Rent vs buy' },
  { value: 'savings', label: 'Saving' },
] as const

type SecondaryView = (typeof VIEWS)[number]['value']

const DESKTOP_LAYOUT = [
  { value: 'stack', label: 'All charts' },
  { value: 'tabs', label: 'One chart' },
] as const

type DesktopLayout = (typeof DESKTOP_LAYOUT)[number]['value']

const NARROW_MQ = '(max-width: 899px)'
const STACK_CHART_HEIGHT = 280

function useGoalsNarrow(): boolean {
  const [narrow, setNarrow] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(NARROW_MQ).matches : false,
  )
  useEffect(() => {
    const mql = window.matchMedia(NARROW_MQ)
    const handler = (e: MediaQueryListEvent) => setNarrow(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])
  return narrow
}

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

interface SecondaryChartsProps {
  scenarios: GoalScenario[]
  draft: NewGoalScenario
  monthly: MonthlySaving[]
}

function SecondaryViewChart({
  view,
  scenarios,
  draft,
  monthly,
  chartHeight,
  embedded = false,
}: {
  view: SecondaryView
  scenarios: GoalScenario[]
  draft: NewGoalScenario
  monthly: MonthlySaving[]
  chartHeight?: number | undefined
  embedded?: boolean
}) {
  const h = chartHeight
  switch (view) {
    case 'composition':
      return h != null ? (
        <CompositionChart draft={draft} height={h} embedded={embedded} />
      ) : (
        <CompositionChart draft={draft} embedded={embedded} />
      )
    case 'milestones':
      return <MilestoneMatrix scenarios={scenarios} draft={draft} embedded={embedded} />
    case 'fire':
      return h != null ? (
        <FireChart draft={draft} height={h} embedded={embedded} />
      ) : (
        <FireChart draft={draft} embedded={embedded} />
      )
    case 'rent':
      return h != null ? (
        <RentVsOwnChart draft={draft} height={h} embedded={embedded} />
      ) : (
        <RentVsOwnChart draft={draft} embedded={embedded} />
      )
    case 'savings':
      return h != null ? (
        <SavingsRateChart draft={draft} monthly={monthly} height={h} embedded={embedded} />
      ) : (
        <SavingsRateChart draft={draft} monthly={monthly} embedded={embedded} />
      )
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
      <div className={styles.chipRow} role="radiogroup" aria-label="Secondary chart view" ref={ref}>
        {VIEWS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={view === opt.value}
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

function SecondaryChartStack({
  scenarios,
  draft,
  monthly,
}: {
  scenarios: GoalScenario[]
  draft: NewGoalScenario
  monthly: MonthlySaving[]
}) {
  return (
    <div className={styles.secondaryStack}>
      <CompositionChart draft={draft} height={STACK_CHART_HEIGHT} />
      <MilestoneMatrix scenarios={scenarios} draft={draft} />
      <FireChart draft={draft} height={STACK_CHART_HEIGHT} />
      <RentVsOwnChart draft={draft} height={STACK_CHART_HEIGHT} />
      <SavingsRateChart draft={draft} monthly={monthly} height={STACK_CHART_HEIGHT} />
    </div>
  )
}

export function SecondaryCharts({ scenarios, draft, monthly }: SecondaryChartsProps) {
  const narrow = useGoalsNarrow()
  const [view, setView] = useState<SecondaryView>('composition')
  const [desktopLayout, setDesktopLayout] = useState<DesktopLayout>('stack')

  if (narrow) {
    return (
      <TabbedChart view={view} onViewChange={setView}>
        <SecondaryViewChart
          view={view}
          scenarios={scenarios}
          draft={draft}
          monthly={monthly}
          embedded
        />
      </TabbedChart>
    )
  }

  return (
    <div className={styles.secondaryDesktop}>
      <div className={styles.secondaryHeader}>
        <h3 className={styles.secondaryHeading}>Detailed charts</h3>
        <SegmentedControl
          layout="compact"
          ariaLabel="Secondary charts layout"
          options={[...DESKTOP_LAYOUT]}
          value={desktopLayout}
          onChange={setDesktopLayout}
        />
      </div>
      {desktopLayout === 'stack' ? (
        <SecondaryChartStack scenarios={scenarios} draft={draft} monthly={monthly} />
      ) : (
        <TabbedChart view={view} onViewChange={setView}>
          <SecondaryViewChart
            view={view}
            scenarios={scenarios}
            draft={draft}
            monthly={monthly}
            chartHeight={STACK_CHART_HEIGHT}
            embedded
          />
        </TabbedChart>
      )}
    </div>
  )
}
