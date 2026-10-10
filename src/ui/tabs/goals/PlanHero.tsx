import { useMemo } from 'react'
import type { GoalScenario, Milestone, WealthAccount, WealthCheckin } from '../../../types'
import { checkinInvestedCents, yearOffsetFromDate, type PlanFromToday } from '../../../engine'
import type { ChartSeries } from '../../charts/LinearChart'
import { SegmentedControl } from '../../components/SegmentedControl'
import { todayIso } from '../../components/transactionFormState'
import { NetWorthChart } from './charts/NetWorthChart'
import type { HeroLegendStore } from './charts/heroLegendStore'
import { GoalsNarrative } from './GoalsNarrative'
import { NominalPreview } from './NominalPreview'
import { PortfolioShortfallNote } from './PortfolioShortfallNote'
import { useGoalsNarrow } from './useGoalsNarrow'
import { PlanStrip } from './desktop/PlanStrip'
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
  /** A wide screen's scenario chips, above the chart, read the lines from here. */
  legendStore?: HeroLegendStore | undefined
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
  legendStore,
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
    // Neutral, not a scenario's colour: amber was Path C's, and nothing said what the dots were.
    return { id: 'actuals-overlay', color: 'var(--color-text)', values: [], kind: 'scatter', points }
  }, [activeScenario, checkins, accounts])

  // A new array or element on every render would make the memoised chart redraw each time the
  // editor's state changes (the discard question, a save in flight), none of which it draws.
  const extraSeries = useMemo(() => (checkinExtraSeries ? [checkinExtraSeries] : []), [checkinExtraSeries])
  const { mode, onModeChange, assumedInflation, preview, onPreview, onOpenSetting } = display
  const narrow = useGoalsNarrow()
  const displaySwitch = useMemo(
    () => (
      <SegmentedControl
        options={DISPLAY_MODE_OPTIONS}
        value={mode}
        onChange={onModeChange}
        ariaLabel="Value display mode"
        layout="compact"
      />
    ),
    [mode, onModeChange],
  )
  // A phone has the summary box with the display switch under it. A wide screen has the net worth
  // in the levers bar, so what is left to say (FI, the next milestone) is a line, and the switch
  // is in the card's header beside the window buttons.
  const footer = useMemo(() => {
    const nominalPreview =
      mode === 'nominal' ? (
        <NominalPreview
          saved={assumedInflation}
          preview={preview}
          onPreview={onPreview}
          onOpenAssumptions={onOpenSetting}
          planStartDate={deferredDraft.planStartDate}
        />
      ) : null
    return narrow ? (
      <div>
        <PortfolioShortfallNote draft={deferredDraft} />
        <div>
          <GoalsNarrative draft={deferredDraft} milestones={milestones} compact />
        </div>
        <div className={progressStyles.displayModeRow}>{displaySwitch}</div>
        {nominalPreview}
      </div>
    ) : (
      <>
        <PortfolioShortfallNote draft={deferredDraft} />
        <PlanStrip draft={deferredDraft} milestones={milestones} />
        {nominalPreview}
      </>
    )
  }, [narrow, deferredDraft, milestones, displaySwitch, mode, assumedInflation, preview, onPreview, onOpenSetting])

  const heroTodayIndex = useMemo(() => {
    if (!activeScenario?.planStartDate) return undefined
    const offset = yearOffsetFromDate(activeScenario.planStartDate, todayIso())
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
      footer={footer}
      footerBare={!narrow}
      {...(narrow ? {} : { headerAside: displaySwitch })}
      displaySwitch={displaySwitch}
      extraSeries={extraSeries}
      fromToday={fromToday}
      legendStore={legendStore}
      nominalMode={display.mode === 'nominal'}
      viewInflation={display.preview}
      {...(heroTodayIndex !== undefined ? { todayIndex: heroTodayIndex } : {})}
    />
  )
}
