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
import { PlanDesktop } from './desktop/PlanDesktop'
import { GoalsIntro } from './GoalsIntro'
import type { MobilePlanView } from './goalsView'
import { PlanHero, type ValueDisplay } from './PlanHero'
import { ScenarioManager } from './ScenarioManager'
import { SecondaryCharts } from './SecondaryCharts'
import { useGoalsNarrow } from './useGoalsNarrow'
import type { ScenarioEditor } from './useScenarioEditor'
import type { StarredLevers } from './useStarredLevers'
import styles from './goals.module.css'

interface PlanSidebarProps {
  half: MobilePlanView
  scenarios: GoalScenario[]
  editor: ScenarioEditor
  actions: ExpenseActions | undefined
  latest: InvestedSnapshot | null
}

/** The phone's scenarios, the controls and, on its Scenarios half, the pinned chart over them. */
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
          hasEdits={editor.unsaved}
          saving={saving}
          creating={editor.creating}
          onSelect={editor.onSelectScenario}
          onSelectEditing={editor.onSelectEditing}
          onToggleVisible={editor.onToggleVisible}
          onPatch={editor.patchDraft}
          onSaveDraft={editor.onSaveDraft}
          onSaveChanges={onSaveChanges}
          onDiscard={onDiscard}
          onActivate={editor.onActivate}
          onDuplicate={editor.onDuplicate}
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
    </div>
  )
}

type PlanBlock = 'sidebar' | 'hero' | 'now' | 'secondary'

/**
 * The order the blocks come in a phone's page, which is the order Tab and a screen reader
 * follow, so it is the order the phone shows them in. Chart reads the chart, the snapshot, the
 * scenarios and then the detail charts, with the scenarios between two blocks of what is
 * otherwise one column. (A wide screen has its own page, desktop/PlanDesktop, in reading order.)
 */
const PLAN_ORDER: readonly PlanBlock[] = ['hero', 'now', 'sidebar', 'secondary']

interface PlanViewProps {
  /** The half a phone is showing; a wide screen shows the whole page. */
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
  /** The inputs in a wide screen's bar; a phone has no bar. */
  levers: StarredLevers
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
          nominal={props.display.mode === 'nominal'}
        />
      </div>
    ),
  }
}

/**
 * Plan. A wide screen has its own page, one column from the scenarios to the detail charts. A
 * phone keeps the scenarios and controls as a half of their own beside the chart.
 */
export function PlanView({ half, levers, ...rest }: PlanViewProps) {
  const narrow = useGoalsNarrow()
  if (!narrow) return <PlanDesktop {...rest} levers={levers} />
  const blocks = planBlocks({ half, levers, ...rest })
  return (
    <>
      <div className={styles.layout} data-mobile-view={half}>
        {PLAN_ORDER.map((block) => blocks[block])}
      </div>
      <GoalsIntro />
    </>
  )
}
