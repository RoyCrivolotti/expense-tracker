import { useState } from 'react'
import type { ExpenseModel } from '../../useExpenseData'
import type { ExpenseActions } from '../../actions'
import { GoalsViewSwitch } from './GoalsViewSwitch'
import { GoalsPanel } from './GoalsPanel'
import { GoalsViews } from './GoalsViews'
import { useBaselineToast } from './useBaselineToast'
import { GOALS_CONTENT_ANCHOR_ID } from './goalsAnchors'
import { useGoalsUnsavedWork } from './useGoalsUnsavedWork'
import { useStarredLevers } from './useStarredLevers'
import { GoalsTitleRow } from './GoalsTitleRow'
import { GoalsTips } from './GoalsTips'
import { useGoalsNavigation } from './useGoalsNavigation'
import { useGoalsReadings } from './useGoalsReadings'
import { useScenarioEditor } from './useScenarioEditor'
import { entryDraftPatch } from './goalsView'
import styles from './goals.module.css'

/**
 * How the tab was reached: 'checkin' opens Progress with the check-in form up;
 * a baseline entry opens Plan with the measured monthly spend prefilled into the
 * draft's annual spend: an unsaved edit that goes through the ordinary Save
 * path, never a silent write.
 */
export type GoalsEntry = 'checkin' | { kind: 'baseline'; monthlyCents: number } | null

interface GoalsTabProps {
  model: ExpenseModel
  actions?: ExpenseActions | undefined
  entry?: GoalsEntry
}

export function GoalsTab({ model, actions, entry }: GoalsTabProps) {
  const { dataset } = model
  const nav = useGoalsNavigation(entry)
  const { view, mobilePlanView, memory, narrow, changeView, changePlanHalf } = nav
  const readings = useGoalsReadings(model)
  const { avgSaving } = readings

  const editor = useScenarioEditor(dataset, actions, avgSaving)
  // The Analytics baseline lands as a draft edit, once per arrival (the tab remounts on
  // every navigation, so mount-time application is per-entry). Save remains the user's.
  const [baselineApplied, setBaselineApplied] = useState(false)
  const baselinePatch = entryDraftPatch(entry)
  if (baselinePatch && !baselineApplied) {
    setBaselineApplied(true)
    editor.patchDraft(baselinePatch)
  }
  useBaselineToast(baselinePatch?.annualSpendCents ?? null)
  useGoalsUnsavedWork(editor, actions != null)
  // Kept here, not in Plan, so a choice still being saved survives a visit to another view.
  const levers = useStarredLevers(dataset.settings.goalLevers, actions?.updateSettings)

  const viewSwitch = (
    <GoalsViewSwitch
      view={view}
      onViewChange={changeView}
      planHalf={mobilePlanView}
      onPlanHalfChange={changePlanHalf}
      memory={memory}
      inline={!narrow}
    />
  )

  return (
    <div className={styles.stack}>
      <GoalsTitleRow
        narrow={narrow}
        viewSwitch={viewSwitch}
        showActions={view === 'plan'}
        editor={editor}
        actions={actions}
      />

      <GoalsTips
        view={view}
        narrow={narrow}
        half={mobilePlanView}
        editor={editor}
        noScenarios={dataset.goalScenarios.length === 0}
      />

      <GoalsPanel view={view} planHalf={mobilePlanView}>
        {/* Where a tap on the switch scrolls to: the start of whichever view's content follows. */}
        <div id={GOALS_CONTENT_ANCHOR_ID} className={styles.contentAnchor} />
        <GoalsViews nav={nav} readings={readings} dataset={dataset} actions={actions} editor={editor} levers={levers} />
      </GoalsPanel>
    </div>
  )
}

export default GoalsTab
