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

const NARROW_MQ = '(max-width: 899px)'

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

export function SecondaryCharts({ scenarios, draft, monthly }: SecondaryChartsProps) {
  const narrow = useGoalsNarrow()
  const [view, setView] = useState<SecondaryView>('composition')

  if (!narrow) {
    return (
      <div className={styles.secondaryGrid}>
        <CompositionChart draft={draft} />
        <MilestoneMatrix scenarios={scenarios} draft={draft} />
        <FireChart draft={draft} />
        <RentVsOwnChart draft={draft} />
        <SavingsRateChart draft={draft} monthly={monthly} />
      </div>
    )
  }

  return (
    <div className={styles.secondaryMobile}>
      <SegmentedControl
        layout="bar"
        ariaLabel="Secondary chart view"
        options={[...VIEWS]}
        value={view}
        onChange={setView}
      />
      {view === 'composition' ? <CompositionChart draft={draft} /> : null}
      {view === 'milestones' ? <MilestoneMatrix scenarios={scenarios} draft={draft} /> : null}
      {view === 'fire' ? <FireChart draft={draft} /> : null}
      {view === 'rent' ? <RentVsOwnChart draft={draft} /> : null}
      {view === 'savings' ? <SavingsRateChart draft={draft} monthly={monthly} /> : null}
    </div>
  )
}
