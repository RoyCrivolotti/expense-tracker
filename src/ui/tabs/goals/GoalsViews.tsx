import type { ExpenseDataset } from '../../../types'
import type { ExpenseActions } from '../../actions'
import { ProgressPane } from './ProgressPane'
import { AssumptionsView } from './AssumptionsView'
import { PlanView } from './PlanView'
import type { ScenarioEditor } from './useScenarioEditor'
import type { StarredLevers } from './useStarredLevers'
import type { GoalsNavigation } from './useGoalsNavigation'
import type { GoalsReadings } from './useGoalsReadings'

interface ViewsProps {
  nav: GoalsNavigation
  readings: GoalsReadings
  dataset: ExpenseDataset
  actions: ExpenseActions | undefined
  editor: ScenarioEditor
  levers: StarredLevers
}

/** Plan: the chart and the controls, with the Nominal view's mode and tried rate. */
function PlanBranch({ nav, readings, dataset, actions, editor, levers }: ViewsProps) {
  const {
    mobilePlanView,
    displayMode,
    changeDisplayMode,
    previewInflation,
    setPreviewInflation,
    openInflationSetting,
  } = nav
  const { latestSnapshot, milestones, reachedMilestones, monthly, fromToday } = readings
  return (
    <PlanView
      half={mobilePlanView}
      scenarios={dataset.goalScenarios}
      editor={editor}
      actions={actions}
      latest={latestSnapshot}
      milestones={milestones}
      reached={reachedMilestones}
      monthly={monthly}
      checkins={dataset.wealthCheckins}
      accounts={dataset.wealthAccounts}
      fromToday={fromToday}
      levers={levers}
      display={{
        mode: displayMode,
        onModeChange: changeDisplayMode,
        assumedInflation: dataset.settings.assumedInflation,
        preview: previewInflation,
        onPreview: setPreviewInflation,
        onOpenSetting: actions ? openInflationSetting : undefined,
      }}
    />
  )
}

/** The view the tab is on: Assumptions, Progress or Plan. */
export function GoalsViews(props: ViewsProps) {
  const { nav, readings, dataset, actions, editor } = props
  const { view, assumptionsFocus, checkinEntry, openAccountsSetup } = nav
  const { sums, plan, latestSnapshot, fromToday, reachedMilestones } = readings
  return (
    <>
      {view === 'assumptions' ? (
        <AssumptionsView
          accounts={dataset.wealthAccounts}
          checkins={dataset.wealthCheckins}
          settings={dataset.settings}
          actions={actions}
          onSettingsChange={actions ? (patch) => actions.updateSettings(patch) : undefined}
          focus={assumptionsFocus}
        />
      ) : null}
      {view === 'progress' ? (
        <ProgressPane
          dataset={dataset}
          sums={sums}
          actions={actions}
          plan={plan}
          latestSnapshot={latestSnapshot}
          fromToday={fromToday}
          reached={reachedMilestones}
          openCheckinForm={checkinEntry}
          onOpenAccountsSetup={openAccountsSetup}
          editor={editor}
        />
      ) : null}
      {view === 'plan' ? <PlanBranch {...props} /> : null}
    </>
  )
}
