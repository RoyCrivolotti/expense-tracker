import type { ReactNode } from 'react'
import type { GoalScenario, Milestone, WealthAccount, WealthCheckin } from '../../../types'
import type { ExpenseActions } from '../../actions'
import type { MonthlyFlow, PlanFromToday } from '../../../engine'
import { Card } from '../../components/primitives'
import { AdjustStack } from './AdjustStack'
import { DiscardSheet } from './DiscardSheet'
import type { InvestedSnapshot } from './checkinDate'
import { NetWorthNowCard } from './charts/NetWorthNowCard'
import { GoalControls } from './GoalControls'
import { GoalsIntro } from './GoalsIntro'
import type { MobilePlanView } from './goalsView'
import { PlanHero, type ValueDisplay } from './PlanHero'
import { ScenarioManager } from './ScenarioManager'
import { SecondaryCharts } from './SecondaryCharts'
import { useGoalsNarrow } from './useGoalsNarrow'
import type { ScenarioEditor } from './useScenarioEditor'
import styles from './goals.module.css'

interface PlanSidebarProps {
  half: MobilePlanView
  scenarios: GoalScenario[]
  editor: ScenarioEditor
  actions: ExpenseActions | undefined
  latest: InvestedSnapshot | null
}

/**
 * The scenarios, the controls and, on a phone's Scenarios half, the pinned chart over them. A wide
 * screen's intro and glossary end it, under the controls they explain.
 */
function PlanSidebar({ half, scenarios, editor, actions, latest }: PlanSidebarProps) {
  const { draft, dirty, saving, onSaveChanges, onDiscard } = editor
  return (
    <div className={styles.areaSidebar}>
      <div className={styles.areaScenarios}>
        <ScenarioManager
          scenarios={scenarios}
          activeId={editor.activeId}
          draft={draft}
          hiddenIds={editor.hiddenIds}
          canWrite={actions != null}
          actions={actions}
          dirty={dirty}
          saving={saving}
          onSelect={editor.onSelectScenario}
          onSelectEditing={editor.onSelectEditing}
          onToggleVisible={editor.onToggleVisible}
          onPatch={editor.patchDraft}
          onSaveDraft={editor.onSaveDraft}
          onSaveChanges={onSaveChanges}
          onDiscard={onDiscard}
          onActivate={editor.onActivate}
          onScenarioCreated={editor.selectScenario}
        />
        <DiscardSheet {...editor.discardPrompt} />
      </div>
      {half === 'adjust' ? (
        // Phone only: only the phone's row offers Scenarios.
        <AdjustStack
          draft={editor.deferredDraft}
          unsaved={
            actions != null && dirty
              ? { name: draft.name, saving, onSave: onSaveChanges, onDiscard }
              : undefined
          }
        />
      ) : null}
      <div className={styles.areaControls}>
        <Card>
          <GoalControls draft={draft} latest={latest} onChange={editor.patchDraft} />
        </Card>
      </div>
      <GoalsIntro placement="sidebar-end" />
    </div>
  )
}

type PlanBlock = 'sidebar' | 'hero' | 'now' | 'secondary'

/**
 * The order the blocks come in the page, which is the order Tab and a screen reader follow, so
 * it is the order each layout shows them in. A phone's Chart reads the chart, the snapshot, the
 * scenarios and then the detail charts, with the scenarios between two blocks of the right-hand
 * column, so neither column can come first as a whole. A wide screen reads the sidebar on the
 * left before the blocks beside it. Keyed siblings keep their state when the order changes at
 * 900px.
 */
const PLAN_ORDER: Record<'wide' | 'narrow', readonly PlanBlock[]> = {
  wide: ['sidebar', 'hero', 'now', 'secondary'],
  narrow: ['hero', 'now', 'sidebar', 'secondary'],
}

interface PlanViewProps {
  /** The half a phone is showing; a wide screen shows both. */
  half: MobilePlanView
  scenarios: GoalScenario[]
  editor: ScenarioEditor
  actions: ExpenseActions | undefined
  /** The latest check-in, which the controls offer to start from. */
  latest: InvestedSnapshot | null
  milestones: Milestone[]
  reached: Map<number, string>
  monthly: MonthlyFlow[]
  checkins: WealthCheckin[]
  accounts: WealthAccount[]
  fromToday: PlanFromToday | null
  display: ValueDisplay
}

/** Charts read the editor's deferred draft, so dragging a control never waits on them. */
function planBlocks(props: PlanViewProps): Record<PlanBlock, ReactNode> {
  const { half, scenarios, editor, actions, latest, milestones, reached } = props
  const { deferredDraft, activeId, dirty } = editor
  return {
    sidebar: (
      <PlanSidebar key="sidebar" half={half} scenarios={scenarios} editor={editor} actions={actions} latest={latest} />
    ),
    hero: (
      <div key="hero" className={`${styles.heroBlock} ${styles.areaHero}`}>
        <PlanHero
          scenarios={scenarios}
          editor={editor}
          milestones={milestones}
          checkins={props.checkins}
          accounts={props.accounts}
          fromToday={props.fromToday}
          display={props.display}
        />
      </div>
    ),
    now: (
      <div key="now" className={styles.areaNow}>
        <NetWorthNowCard draft={deferredDraft} latest={latest} milestones={milestones} reached={reached} />
      </div>
    ),
    secondary: (
      <div key="secondary" className={styles.areaSecondary}>
        <SecondaryCharts
          scenarios={scenarios}
          draft={deferredDraft}
          monthly={props.monthly}
          milestones={milestones}
          reached={reached}
          activeId={activeId}
          dirty={dirty}
          fromToday={props.fromToday}
        />
      </div>
    ),
  }
}

/**
 * Plan: the scenarios and controls beside the projection, with the snapshot and the charts
 * under it.
 */
export function PlanView(props: PlanViewProps) {
  const narrow = useGoalsNarrow()
  const blocks = planBlocks(props)
  return (
    <>
      <div className={styles.layout} data-mobile-view={props.half}>
        {PLAN_ORDER[narrow ? 'narrow' : 'wide'].map((block) => blocks[block])}
      </div>
      <GoalsIntro placement="page-end" />
    </>
  )
}
