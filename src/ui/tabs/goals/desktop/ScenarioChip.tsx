import type { GoalScenario } from '../../../../types'
import { useMoneyFormat } from '../../../hooks/moneyFormatContext'
import { formatCentsCompact } from '../../../../engine'
import { withEnded } from '../../../charts/withEnded'
import type { ScenarioLegendItem } from '../charts/ScenarioSeriesLegend'
import { scenarioInk } from '../scenarioInk'
import { CHIP_ATTRIBUTE } from './chipFocus'
import styles from './planDesktop.module.css'

function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
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

/** The whole name, on two lines at most (the tooltip has it for the rare one that is longer), and when a later scenario starts. */
function ChipName({ label, note }: { label: string; note: string | undefined }) {
  const name = (
    <span className={styles.chipName} title={label}>
      {label}
    </span>
  )
  if (!note) return name
  return (
    <span className={styles.chipNameStack}>
      {name}
      <span className={styles.chipNote}>{note}</span>
    </span>
  )
}

/**
 * The figure at the year read; for a scenario that has ended, its last figure and the year it ended in;
 * for one that has not started, when it does ("starts Jul 2027"). Nothing for a hidden line.
 */
function ChipValue({ line }: { line: ScenarioLegendItem | undefined }) {
  const format = useMoneyFormat()
  if (!line || line.hidden) return <span className={styles.chipValue}></span>
  if (line.valueCents == null && line.status)
    return <span className={`${styles.chipValue} ${styles.chipStatus}`}>{line.status}</span>
  if (line.valueCents == null) return <span className={styles.chipValue}></span>
  const figure = formatCentsCompact(line.valueCents, format)
  if (!line.endedIn) return <span className={styles.chipValue}>{figure}</span>
  return <span className={`${styles.chipValue} ${styles.chipStatus}`}>{withEnded(figure, line.endedIn)}</span>
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

function chipClass(
  active: boolean,
  hidden: boolean,
): string {
  return [styles.chip, active ? styles.chipOn : '', hidden ? styles.chipHidden : ''].filter(Boolean).join(' ')
}

/**
 * One scenario: the way to open it, and what the chart says about it. The colour, name and value
 * are the legend's, so the chart has no second list of the same names. The eye is a button of its
 * own beside the chip's, not inside it, since a button cannot hold one.
 */
export function Chip({ scenario, label, line, active, edited, tabIndex, onOpen, onToggle }: ChipProps) {
  const hidden = line?.hidden === true
  const plan = scenario?.isActive === true
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
        <span
          className={styles.tabDot}
          style={{ background: scenario ? scenarioInk(scenario.color) : 'var(--color-text-muted)' }}
          aria-hidden
        />
        <ChipName label={label} note={line?.note} />
        <ChipSpeech plan={plan} edited={edited} />
        <span className={styles.chipSide} aria-hidden>
          <ChipValue line={line} />
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
