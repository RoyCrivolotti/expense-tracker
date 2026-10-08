import type { ReactNode } from 'react'
import type { ExpenseActions } from '../../actions'
import { SectionTitle } from '../../components/primitives'
import { ScenarioActions } from './desktop/ScenarioActions'
import type { ScenarioEditor } from './useScenarioEditor'
import styles from './goals.module.css'

interface GoalsTitleRowProps {
  narrow: boolean
  viewSwitch: ReactNode
  /** Plan puts its scenario actions in the row; the other views do not. */
  showActions: boolean
  editor: ScenarioEditor
  /** Absent in a read-only session, which has no actions to show. */
  actions: ExpenseActions | undefined
}

/**
 * "Goals" and the view switch. A phone has them on two lines; a wide screen has one row, since the
 * title and the switch took 60px each, a fifth of what a laptop screen has above the chart. Plan's
 * scenario actions join them there, so editing a scenario never adds a row above the chart.
 */
export function GoalsTitleRow({ narrow, viewSwitch, showActions, editor, actions }: GoalsTitleRowProps) {
  if (narrow) {
    return (
      <>
        <SectionTitle>Goals</SectionTitle>
        {viewSwitch}
      </>
    )
  }
  return (
    <SectionTitle
      action={
        showActions && actions ? (
          <div className={styles.titleActions}>
            <ScenarioActions editor={editor} actions={actions} />
            {viewSwitch}
          </div>
        ) : (
          viewSwitch
        )
      }
    >
      Goals
    </SectionTitle>
  )
}
