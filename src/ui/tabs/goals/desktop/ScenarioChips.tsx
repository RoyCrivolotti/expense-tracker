import { useRef } from 'react'
import type { GoalScenario } from '../../../../types'
import { useRadioGroupKeys } from '../../../hooks/useRadioGroupKeys'
import { useMoneyFormat } from '../../../hooks/moneyFormatContext'
import { formatMoneyShort } from '../chartTheme'
import { useHeroLegend, type HeroLegendStore } from '../charts/heroLegendStore'
import type { ScenarioLegendItem } from '../charts/ScenarioSeriesLegend'
import { scenarioInk } from '../scenarioInk'
import { CHIP_ATTRIBUTE } from './chipFocus'
import styles from './planDesktop.module.css'

function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {off ? (
        <path d="M3 3l18 18M10.6 5.2A10 10 0 0112 5c6.5 0 10 7 10 7a17 17 0 01-3.2 4M6.5 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7c1.6 0 3-.4 4.3-1M9.9 9.9a3 3 0 004.2 4.2" />
      ) : (
        <>
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
        </>
      )}
    </svg>
  )
}

/** The pills under a chip's value. A screen reader gets the same words from the chip's own text. */
function ChipTags({ plan, edited }: { plan: boolean; edited: boolean }) {
  if (!plan && !edited) return null
  return (
    <span className={styles.chipTags}>
      {plan ? <span className={styles.tabPlan}>Plan</span> : null}
      {edited ? <span className={styles.tabEdited}>Edited</span> : null}
    </span>
  )
}

/**
 * The words the pills say, for a screen reader. Spaces between the parts of the name: the flex
 * layout drops them from the page, but not from what a screen reader is told.
 */
function ChipSpeech({ plan, edited }: { plan: boolean; edited: boolean }) {
  return (
    <>
      {plan ? (
        <>
          {' '}
          <span className={styles.srOnly}>Current plan</span>
        </>
      ) : null}
      {edited ? (
        <>
          {' '}
          <span className={styles.srOnly}>Edited</span>
        </>
      ) : null}
    </>
  )
}

interface ChipProps {
  /** The saved scenario the chip opens; null for the unsaved draft. */
  scenario: GoalScenario | null
  label: string
  /** What the chart draws for it: the value at the year pointed at, and whether its line is hidden. */
  line: ScenarioLegendItem | undefined
  active: boolean
  /** Has edits that are not saved; only the chip of the open scenario says so. */
  edited: boolean
  tabIndex: number
  onOpen: () => void
  /** Hides or shows the line; the open scenario's cannot be hidden, since it is the one being edited. */
  onToggle: ((scenarioId: number) => void) | undefined
}

function chipClass(active: boolean, hidden: boolean): string {
  return [styles.chip, active ? styles.chipOn : '', hidden ? styles.chipHidden : ''].filter(Boolean).join(' ')
}

/**
 * One scenario: the way to open it, and what the chart says about it. The colour, name and value
 * are the legend's, so the chart has no second list of the same names. The eye is a button of its
 * own beside the chip's, not inside it, since a button cannot hold one.
 */
function Chip({ scenario, label, line, active, edited, tabIndex, onOpen, onToggle }: ChipProps) {
  const format = useMoneyFormat()
  const hidden = line?.hidden === true
  const plan = scenario?.isActive === true
  const value = !hidden && line?.valueCents != null ? formatMoneyShort(line.valueCents, format) : ''
  return (
    <div className={chipClass(active, hidden)}>
      <button
        {...{ [CHIP_ATTRIBUTE]: '' }}
        type="button"
        role="tab"
        aria-selected={active}
        tabIndex={tabIndex}
        className={styles.chipOpen}
        onClick={onOpen}
      >
        <span className={styles.tabDot} style={{ background: scenario ? scenarioInk(scenario.color) : 'var(--color-text-muted)' }} aria-hidden />
        {/* The whole name, on two lines at most; the tooltip has it for the rare one that is longer. */}
        <span className={styles.chipName} title={label}>
          {label}
        </span>
        <ChipSpeech plan={plan} edited={edited} />
        <span className={styles.chipSide} aria-hidden>
          <span className={styles.chipValue}>{value}</span>
          <ChipTags plan={plan} edited={edited} />
        </span>
      </button>
      {!active && scenario && onToggle ? (
        <button
          type="button"
          className={styles.chipEye}
          aria-pressed={!hidden}
          aria-label={`${hidden ? 'Show' : 'Hide'} ${label} on chart`}
          onClick={() => onToggle(scenario.id)}
        >
          <EyeIcon off={hidden} />
        </button>
      ) : null}
    </div>
  )
}

/**
 * What the chart published for a chip's scenario. The open scenario is the draft, which has no
 * scenario id on its line; the dotted plan-from-today line is a draft's neighbour, not the draft.
 */
function lineFor(items: ScenarioLegendItem[], scenario: GoalScenario | null, active: boolean): ScenarioLegendItem | undefined {
  if (scenario === null || active) return items.find((item) => item.scenarioId === undefined && !item.dotted)
  return items.find((item) => item.scenarioId === scenario.id)
}

/** The open scenario is named as it is typed; the draft has no name of its own yet. */
function chipLabel(scenario: GoalScenario | null, active: boolean, draftName: string): string {
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
export function ScenarioChips({ scenarios, activeId, dirty, draftName, showDraft, onSelect, onSelectDraft, legend, onToggleVisible }: ScenarioChipsProps) {
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
