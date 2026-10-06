import { forwardRef, useRef } from 'react'
import type { GoalScenario } from '../../../../types'
import { useRadioGroupKeys } from '../../../hooks/useRadioGroupKeys'
import { scenarioInk } from '../scenarioInk'
import styles from './planDesktop.module.css'

interface TabProps {
  /** The saved scenario the tab loads; null for the unsaved draft. */
  scenario: GoalScenario | null
  label: string
  active: boolean
  /** Has edits that are not saved; only the tab of the open scenario says so. */
  edited: boolean
  /** Starts from its own balance while the scenarios are looked at from the latest check-in. */
  ownStart: boolean
  tabIndex: number
  onClick: () => void
}

/** Forwards its button so focus can be put back on the open scenario's tab. */
const Tab = forwardRef<HTMLButtonElement, TabProps>(function Tab({ scenario, label, active, edited, ownStart, tabIndex, onClick }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      role="tab"
      aria-selected={active}
      tabIndex={tabIndex}
      className={active ? `${styles.tab} ${styles.tabOn}` : styles.tab}
      onClick={onClick}
    >
      <span className={styles.tabDot} style={{ background: scenario ? scenarioInk(scenario.color) : 'var(--color-text-muted)' }} aria-hidden />
      {/* A long name is cut short with an ellipsis rather than making one tab as wide as the row;
          the whole of it is in the tooltip. */}
      <span className={styles.tabName} title={label}>
        {label}
      </span>
      {/* Spaces between the parts of the name: the flex layout drops them from the page, but not
          from what a screen reader is told. */}
      {scenario?.isActive ? (
        <>
          {' '}
          <span className={styles.tabPlan}>
            <span className={styles.srOnly}>Current</span> plan
          </span>
        </>
      ) : null}
      {ownStart ? (
        <>
          {' '}
          <span className={styles.tabOwnStart} title="Keeps its own starting balance while the others start from your balance today">
            own start
          </span>
        </>
      ) : null}
      {edited ? (
        <>
          {' '}
          <span className={styles.tabEdited}>Edited</span>
        </>
      ) : null}
    </button>
  )
})

interface ScenarioTabsProps {
  scenarios: GoalScenario[]
  /** The scenario loaded in the editor; null while the draft is detached from any. */
  activeId: number | null
  /** The loaded scenario has edits that are not saved. */
  dirty: boolean
  /** What the open scenario is being renamed to, so its tab follows as it is typed. */
  draftName: string
  /** Show the detached draft as a tab: it is what is being edited, or all there is to edit. */
  showDraft: boolean
  /** The scenarios that keep their own start while the others are looked at from the latest check-in. */
  ownStartIds?: ReadonlySet<number>
  onSelect: (scenario: GoalScenario) => void
  onSelectDraft: () => void
}

const NO_IDS: ReadonlySet<number> = new Set()

/** The scenario's name, or what it is being renamed to while it is open and the box has one. */
function tabLabel(scenario: GoalScenario | null, active: boolean, draftName: string): string {
  if (!scenario) return 'Unsaved draft'
  return active && draftName.trim() ? draftName : scenario.name
}

/** One tab per scenario. The ref is the open scenario's tab. */
export const ScenarioTabs = forwardRef<HTMLButtonElement, ScenarioTabsProps>(function ScenarioTabs(
  { scenarios, activeId, dirty, draftName, showDraft, ownStartIds = NO_IDS, onSelect, onSelectDraft },
  activeTab,
) {
  const group = useRef<HTMLDivElement>(null)
  const entries: (GoalScenario | null)[] = [...(showDraft ? [null] : []), ...scenarios]
  const selected = entries.findIndex((e) => (e?.id ?? null) === activeId)
  // Arrows move focus between the tabs and Enter or Space loads one. Loading can ask a question
  // (unsaved edits), which must not come up for every tab the arrow passes over.
  const keys = useRadioGroupKeys({
    groupRef: group,
    count: entries.length,
    selected,
    arrows: 'horizontal',
    onSelect: () => undefined,
  })

  return (
    <div ref={group} className={styles.tabs} role="tablist" aria-label="Scenarios" onKeyDown={keys.onKeyDown}>
      {entries.map((scenario, i) => {
        const active = (scenario?.id ?? null) === activeId
        return (
          <Tab
            key={scenario?.id ?? 'draft'}
            ref={active ? activeTab : null}
            scenario={scenario}
            label={tabLabel(scenario, active, draftName)}
            active={active}
            edited={scenario !== null && active && dirty}
            ownStart={scenario !== null && ownStartIds.has(scenario.id)}
            tabIndex={i === keys.stop ? 0 : -1}
            onClick={() => (scenario ? onSelect(scenario) : onSelectDraft())}
          />
        )
      })}
    </div>
  )
})
