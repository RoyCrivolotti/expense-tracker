import { useMemo } from 'react'
import type { GoalScenario, Milestone, WealthAccount, WealthCheckin } from '../../../types'
import { checkinInvestedCents, yearOffsetFromDate, type PlanFromToday } from '../../../engine'
import type { ChartSeries } from '../../charts/LinearChart'
import { SegmentedControl } from '../../components/SegmentedControl'
import { NetWorthChart } from './charts/NetWorthChart'
import { GoalsNarrative } from './GoalsNarrative'
import { NominalPreview } from './NominalPreview'
import type { ScenarioEditor } from './useScenarioEditor'
import progressStyles from './progress.module.css'

export type DisplayMode = 'nominal' | 'purchasing-power'

const DISPLAY_MODE_OPTIONS: { value: DisplayMode; label: string }[] = [
  { value: 'nominal', label: 'Nominal' },
  { value: 'purchasing-power', label: 'Purchasing power' },
]

/** How the hero chart's values are shown, and the inflation the Nominal view is being tried at. */
export interface ValueDisplay {
  mode: DisplayMode
  onModeChange: (mode: DisplayMode) => void
  /** The saved rate from Assumptions. */
  assumedInflation: number
  /** The rate being tried if not the saved one; null while it follows the saved rate. */
  preview: number | null
  onPreview: (rate: number | null) => void
  /** Takes the reader to where the rate is set; absent when they cannot change it. */
  onOpenSetting: (() => void) | undefined
}

interface PlanHeroProps {
  scenarios: GoalScenario[]
  editor: ScenarioEditor
  milestones: Milestone[]
  checkins: WealthCheckin[]
  accounts: WealthAccount[]
  /** The plan restarted from the latest check-in, drawn beside the saved one. */
  fromToday: PlanFromToday | null
  display: ValueDisplay
}

/** The projection of every scenario, with the draft's narrative and the value display under it. */
export function PlanHero({
  scenarios,
  editor,
  milestones,
  checkins,
  accounts,
  fromToday,
  display,
}: PlanHeroProps) {
  const { activeScenario, deferredDraft } = editor

  // Scatter points: actual invested values from check-ins plotted on the hero chart.
  const checkinExtraSeries = useMemo<ChartSeries | null>(() => {
    if (!activeScenario?.planStartDate) return null
    const points = checkins
      .map((c) => {
        const offset = yearOffsetFromDate(activeScenario.planStartDate!, c.checkinDate)
        if (offset === null) return null
        const value = checkinInvestedCents(c, accounts)
        return { xIndex: offset, value }
      })
      .filter((p): p is NonNullable<typeof p> => p !== null)
    if (points.length === 0) return null
    return { id: 'actuals-overlay', color: '#f59e0b', values: [], kind: 'scatter', points }
  }, [activeScenario, checkins, accounts])

  const heroTodayIndex = useMemo(() => {
    if (!activeScenario?.planStartDate) return undefined
    const today = new Date().toISOString().slice(0, 10)
    const offset = yearOffsetFromDate(activeScenario.planStartDate, today)
    return offset !== null && offset >= 0 ? offset : undefined
  }, [activeScenario])

  return (
    <NetWorthChart
      scenarios={scenarios}
      hiddenIds={editor.hiddenIds}
      onToggleVisible={editor.onToggleVisible}
      draft={deferredDraft}
      milestones={milestones}
      activeId={editor.activeId}
      dirty={editor.dirty}
      variant="hero"
      footer={
        <>
          <GoalsNarrative draft={deferredDraft} milestones={milestones} compact />
          <div className={progressStyles.displayModeRow}>
            <SegmentedControl
              options={DISPLAY_MODE_OPTIONS}
              value={display.mode}
              onChange={display.onModeChange}
              ariaLabel="Value display mode"
              layout="compact"
            />
          </div>
          {display.mode === 'nominal' ? (
            <NominalPreview
              saved={display.assumedInflation}
              preview={display.preview}
              onPreview={display.onPreview}
              onOpenAssumptions={display.onOpenSetting}
            />
          ) : null}
        </>
      }
      extraSeries={checkinExtraSeries ? [checkinExtraSeries] : []}
      fromToday={fromToday}
      nominalMode={display.mode === 'nominal'}
      viewInflation={display.preview}
      {...(heroTodayIndex !== undefined ? { todayIndex: heroTodayIndex } : {})}
    />
  )
}
