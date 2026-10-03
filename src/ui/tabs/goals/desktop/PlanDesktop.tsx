import { useState } from 'react'
import type { GoalScenario, Milestone, WealthAccount, WealthCheckin } from '../../../../types'
import type { MonthlyFlow, PlanFromToday } from '../../../../engine'
import type { ExpenseActions } from '../../../actions'
import type { InvestedSnapshot } from '../checkinDate'
import { GoalsIntro } from '../GoalsIntro'
import { PlanHero, type ValueDisplay } from '../PlanHero'
import type { ScenarioEditor } from '../useScenarioEditor'
import type { StarredLevers } from '../useStarredLevers'
import { AllInputsPanel } from './AllInputsPanel'
import { DetailGrid } from './DetailGrid'
import { LeversBar } from './LeversBar'
import { ScenarioBar } from './ScenarioBar'
import { useKeyboardStarToggle } from './useKeyboardStarToggle'
import styles from './planDesktop.module.css'

const PANEL_ID = 'goals-all-inputs'

export interface PlanDesktopProps {
  scenarios: GoalScenario[]
  editor: ScenarioEditor
  actions: ExpenseActions | undefined
  /** The latest check-in, which the inputs offer to start from. */
  latest: InvestedSnapshot | null
  milestones: Milestone[]
  reached: Map<number, string>
  monthly: MonthlyFlow[]
  checkins: WealthCheckin[]
  accounts: WealthAccount[]
  fromToday: PlanFromToday | null
  display: ValueDisplay
  /** The inputs in the bar, and the stars that change them. */
  levers: StarredLevers
}

/**
 * Plan on a wide screen, top to bottom in the order it is read and tabbed through: the
 * scenarios, the projection across the whole page, the bar of inputs that move it (stuck under
 * the header while the rest scrolls), the other inputs when asked for, and the detail charts.
 * The page is one column, so there is one scroll and the chart is never squeezed beside a
 * panel. Charts read the editor's deferred draft, so dragging a control never waits on them.
 */
export function PlanDesktop({ scenarios, editor, actions, latest, milestones, reached, monthly, checkins, accounts, fromToday, display, levers }: PlanDesktopProps) {
  const [inputsOpen, setInputsOpen] = useState(false)
  const { draft, deferredDraft } = editor
  const starred = useKeyboardStarToggle(levers, PANEL_ID)
  return (
    // The marker widens the page for this view only (AppShell.module.css).
    <div className={styles.page} data-goals-plan-wide>
      <ScenarioBar scenarios={scenarios} editor={editor} actions={actions} />
      <div className={styles.hero}>
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
      <LeversBar
        draft={draft}
        resultDraft={deferredDraft}
        keys={starred.keys}
        onChange={editor.patchDraft}
        onUnstar={starred.canEdit ? starred.toggle : undefined}
        expanded={inputsOpen}
        panelId={PANEL_ID}
        onToggle={() => setInputsOpen((open) => !open)}
      />
      <AllInputsPanel
        id={PANEL_ID}
        open={inputsOpen}
        draft={draft}
        latest={latest}
        onChange={editor.patchDraft}
        starred={starred}
      />
      <DetailGrid
        scenarios={scenarios}
        draft={deferredDraft}
        latest={latest}
        monthly={monthly}
        milestones={milestones}
        reached={reached}
        activeId={editor.activeId}
        dirty={editor.dirty}
        fromToday={fromToday}
      />
      <GoalsIntro />
    </div>
  )
}
