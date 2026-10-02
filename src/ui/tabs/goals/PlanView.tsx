import type { GoalScenario, Milestone, WealthAccount, WealthCheckin } from '../../../types'
import type { ExpenseActions } from '../../actions'
import type { MonthlyFlow, PlanFromToday } from '../../../engine'
import { Card } from '../../components/primitives'
import { ConfirmSheet } from '../../components/ConfirmSheet'
import { Presence } from '../../components/Presence'
import { EXIT_MS } from '../../hooks/motion'
import { AdjustStack } from './AdjustStack'
import type { InvestedSnapshot } from './checkinDate'
import { NetWorthNowCard } from './charts/NetWorthNowCard'
import { GoalControls } from './GoalControls'
import type { MobilePlanView } from './goalsView'
import { PlanHero, type ValueDisplay } from './PlanHero'
import { ScenarioManager } from './ScenarioManager'
import { SecondaryCharts } from './SecondaryCharts'
import type { DiscardPrompt, ScenarioEditor } from './useScenarioEditor'
import styles from './goals.module.css'

/**
 * Asked before loading another scenario over unsaved edits. Held inside Presence so the
 * sheet keeps its text while it animates out. A detached draft has no saved scenario to
 * "save changes" to, so it is told to save the draft as a new one.
 */
function DiscardSheet({ pending, open, detached, name, onConfirm, onCancel }: DiscardPrompt) {
  const keep = detached ? 'Save the draft as a new scenario first to keep them.' : 'Save changes first to keep them.'
  return (
    <Presence show={open} exitMs={EXIT_MS.sheet}>
      {pending ? (
        <ConfirmSheet
          title={detached ? 'Discard the unsaved draft?' : `Discard unsaved changes to ${name}?`}
          message={`Loading ${pending.name} drops the edits made here. ${keep}`}
          confirmLabel="Discard"
          destructive
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      ) : null}
    </Presence>
  )
}

interface PlanSidebarProps {
  half: MobilePlanView
  scenarios: GoalScenario[]
  editor: ScenarioEditor
  actions: ExpenseActions | undefined
  latest: InvestedSnapshot | null
}

/** The scenarios, the controls and, on a phone's Adjust half, the pinned chart over them. */
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
        // Phone only: only the phone's row offers Adjust.
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

/**
 * Plan: the scenarios and controls beside the projection, with the snapshot and the charts
 * under it. Charts read the editor's deferred draft, so dragging a control never waits on them.
 */
export function PlanView({
  half,
  scenarios,
  editor,
  actions,
  latest,
  milestones,
  reached,
  monthly,
  checkins,
  accounts,
  fromToday,
  display,
}: PlanViewProps) {
  const { deferredDraft, activeId, dirty } = editor
  return (
    <div className={styles.layout} data-mobile-view={half}>
      <PlanSidebar half={half} scenarios={scenarios} editor={editor} actions={actions} latest={latest} />
      <div className={styles.areaOutputs}>
        <div className={`${styles.heroBlock} ${styles.areaHero}`}>
          <PlanHero
            scenarios={scenarios}
            editor={editor}
            milestones={milestones}
            checkins={checkins}
            accounts={accounts}
            fromToday={fromToday}
            display={display}
          />
        </div>
        <div className={styles.areaNow}>
          <NetWorthNowCard
            draft={deferredDraft}
            latest={latest}
            milestones={milestones}
            reached={reached}
          />
        </div>
        <div className={styles.areaSecondary}>
          <SecondaryCharts
            scenarios={scenarios}
            draft={deferredDraft}
            monthly={monthly}
            milestones={milestones}
            reached={reached}
            activeId={activeId}
            dirty={dirty}
            fromToday={fromToday}
          />
        </div>
      </div>
    </div>
  )
}
