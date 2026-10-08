import type { GoalScenario } from '../../../../types'
import type { ExpenseActions } from '../../../actions'
import { DiscardSheet } from '../DiscardSheet'
import type { HeroLegendStore } from '../charts/heroLegendStore'
import { readOnlyScenarioNote } from '../readOnlyCopy'
import type { ScenarioEditor } from '../useScenarioEditor'
import { ScenarioChips } from './ScenarioChips'
import styles from './planDesktop.module.css'

interface ScenarioBarProps {
  scenarios: GoalScenario[]
  editor: ScenarioEditor
  /** Absent in a read-only session, which can look at scenarios but not change one. */
  actions: ExpenseActions | undefined
  /** Where the chart publishes each line's value, for the chips to show. */
  legend: HeroLegendStore
}

/** What the edits are worth in a session that cannot save: warm when there are some to lose. */
function ReadOnlyNote({ unsaved }: { unsaved: boolean }) {
  return (
    <p role="status" className={unsaved ? `${styles.readOnly} ${styles.readOnlyEdited}` : styles.readOnly}>
      {readOnlyScenarioNote(unsaved)}
    </p>
  )
}

/**
 * The chips above the chart, one per scenario. What can be done with the open one is in the
 * title row (ScenarioActions). The editor underneath is the phone's own, so a scenario behaves
 * the same wherever it is opened.
 */
export function ScenarioBar({ scenarios, editor, actions, legend }: ScenarioBarProps) {
  const { activeId, draft, dirty, unsaved } = editor
  return (
    <div className={styles.scenarioBar}>
      <ScenarioChips
        scenarios={scenarios}
        activeId={activeId}
        // "Edited" is the word that goes with a Save button, and a read-only session has none; the
        // note under the chips says what the edits are worth there.
        dirty={dirty && actions != null}
        draftName={draft.name}
        showDraft={activeId === null || scenarios.length === 0}
        onSelect={editor.onSelectScenario}
        onSelectDraft={editor.onSelectEditing}
        legend={legend}
        onToggleVisible={editor.onToggleVisible}
      />
      {actions ? null : <ReadOnlyNote unsaved={unsaved} />}
      <DiscardSheet {...editor.discardPrompt} />
    </div>
  )
}
