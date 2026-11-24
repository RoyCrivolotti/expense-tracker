import { useRef } from 'react'
import type { GoalScenario } from '../../../../types'
import { useRadioGroupKeys } from '../../../hooks/useRadioGroupKeys'
import { useHeroLegend, type HeroLegendStore } from '../charts/heroLegendStore'
import type { ScenarioLegendItem } from '../charts/ScenarioSeriesLegend'
import { Chip } from './ScenarioChip'
import styles from './planDesktop.module.css'

/**
 * What the chart published for a chip's scenario. The open scenario is the draft, which has no
 * scenario id on its line; the dotted plan-from-today line is a draft's neighbour, not the draft.
 */
function lineFor(
  items: ScenarioLegendItem[],
  scenario: GoalScenario | null,
  active: boolean,
): ScenarioLegendItem | undefined {
  if (scenario === null || active) return items.find((item) => item.scenarioId === undefined && !item.dotted)
  return items.find((item) => item.scenarioId === scenario.id)
}

/** The open scenario is named as it is typed; the draft has no name of its own yet. */
function chipLabel(
  scenario: GoalScenario | null,
  active: boolean,
  draftName: string,
): string {
  if (scenario === null) return 'Unsaved draft'
  return active && draftName.trim() ? draftName : scenario.name
}

interface ScenarioChipsProps {
  scenarios: GoalScenario[]
  /** The scenario loaded in the editor; null while the draft is detached from any. */
  activeId: number | null
  /** The loaded scenario has edits that are not saved. */
  dirty: boolean
  /** What the open scenario is being renamed to, so its chip follows as it is typed. */
  draftName: string
  /** Show the detached draft as a chip: it is what is being edited, or all there is to edit. */
  showDraft: boolean
  onSelect: (scenario: GoalScenario) => void
  onSelectDraft: () => void
  /** Where the chart publishes its lines: the colour, value and hidden state of each. */
  legend: HeroLegendStore
  onToggleVisible: ((scenarioId: number) => void) | undefined
}

/**
 * The scenarios as chips above the chart: all one width, the name on up to two lines, in as many
 * rows as the width needs. They are the tabs and the chart's legend in one, so each carries its
 * colour, the value at the year pointed at and an eye to hide its line.
 */
export function ScenarioChips({
  scenarios,
  activeId,
  dirty,
  draftName,
  showDraft,
  onSelect,
  onSelectDraft,
  legend,
  onToggleVisible,
}: ScenarioChipsProps) {
  const group = useRef<HTMLDivElement>(null)
  const items = useHeroLegend(legend)
  const entries: (GoalScenario | null)[] = [...(showDraft ? [null] : []), ...scenarios]
  const selected = entries.findIndex((e) => (e?.id ?? null) === activeId)
  // Arrows move focus between the chips and Enter or Space opens one. Opening can ask a question
  // (unsaved edits), which must not come up for every chip the arrow passes over.
  const keys = useRadioGroupKeys({
    groupRef: group,
    count: entries.length,
    selected,
    arrows: 'horizontal',
    onSelect: () => undefined,
  })

  return (
    // The eyes are buttons among the tabs, which a strict tab list does not allow; they are what
    // the chart's legend rows were, and there is no list of tabs without them.
    <div ref={group} className={styles.chips} role="tablist" aria-label="Scenarios" onKeyDown={keys.onKeyDown}>
      {entries.map((scenario, i) => {
        const active = (scenario?.id ?? null) === activeId
        return (
          <Chip
            key={scenario?.id ?? 'draft'}
            scenario={scenario}
            label={chipLabel(scenario, active, draftName)}
            line={lineFor(items, scenario, active)}
            active={active}
            edited={scenario !== null && active && dirty}
            tabIndex={i === keys.stop ? 0 : -1}
            onOpen={() => (scenario ? onSelect(scenario) : onSelectDraft())}
            onToggle={onToggleVisible}
          />
        )
      })}
    </div>
  )
}
