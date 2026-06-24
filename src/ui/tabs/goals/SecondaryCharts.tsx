import { useEffect, useState } from 'react'
import type { GoalScenario } from '../../../types'
import type { NewGoalScenario } from '../../../data/dataSource'
import { SegmentedControl } from '../../components/SegmentedControl'
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
}: {
  view: SecondaryView
  scenarios: GoalScenario[]
  draft: NewGoalScenario
  monthly: MonthlySaving[]
  chartHeight?: number | undefined
}) {
  switch (view) {
    case 'composition':
      return chartHeight != null ? (
        <CompositionChart draft={draft} height={chartHeight} />
      ) : (
        <CompositionChart draft={draft} />
      )
    case 'milestones':
      return <MilestoneMatrix scenarios={scenarios} draft={draft} />
    case 'fire':
      return chartHeight != null ? (
        <FireChart draft={draft} height={chartHeight} />
      ) : (
        <FireChart draft={draft} />
      )
    case 'rent':
      return chartHeight != null ? (
        <RentVsOwnChart draft={draft} height={chartHeight} />
      ) : (
        <RentVsOwnChart draft={draft} />
      )
    case 'savings':
      return chartHeight != null ? (
        <SavingsRateChart draft={draft} monthly={monthly} height={chartHeight} />
      ) : (
        <SavingsRateChart draft={draft} monthly={monthly} />
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
  return (
    <div className={styles.chipRow} role="radiogroup" aria-label="Secondary chart view">
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
      <div className={styles.secondaryMobile}>
        <SecondaryTabPicker view={view} onViewChange={setView} />
        <SecondaryViewChart
          view={view}
          scenarios={scenarios}
          draft={draft}
          monthly={monthly}
        />
      </div>
    )
  }

  return (
    <div className={styles.secondaryDesktop}>
      <div className={styles.secondaryToolbar}>
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
        <div className={styles.secondaryMobile}>
          <SecondaryTabPicker view={view} onViewChange={setView} />
          <SecondaryViewChart
            view={view}
            scenarios={scenarios}
            draft={draft}
            monthly={monthly}
            chartHeight={STACK_CHART_HEIGHT}
          />
        </div>
      )}
    </div>
  )
}
