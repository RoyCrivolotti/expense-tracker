import { useMemo, type ReactNode } from 'react'
import type { NewGoalScenario } from '../../../../data/dataSource'
import type { LeverKey } from '../../../../engine'
import { Card } from '../../../components/primitives'
import goalStyles from '../goals.module.css'
import { Presence } from '../../../components/Presence'
import { EXIT_MS, exitVars } from '../../../hooks/motion'
import { useExit } from '../../../hooks/usePresence'
import type { InvestedSnapshot } from '../checkinDate'
import { ADJUST_LABELS } from '../adjustSections'
import {
  ChangesFields,
  EventsFields,
  FireFields,
  HousingFields,
  PortfolioFields,
  TrackingFields,
} from '../goalControlSections'
import { SECTION_KEYS } from '../leverFields'
import type { StarredLevers } from '../useStarredLevers'
import { STAR_HOME_ATTR } from './starFocus'
import { Starrable } from './Starrable'
import styles from './planDesktop.module.css'

interface PanelProps {
  id: string
  draft: NewGoalScenario
  /** The latest check-in, for re-baselining; null before the first one. */
  latest: InvestedSnapshot | null
  onChange: (patch: Partial<NewGoalScenario>) => void
  /** The inputs in the levers bar, so they are not here a second time, and the stars that move them. */
  starred: StarredLevers
}

function Column({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className={styles.column}>
      <h3 className={styles.columnTitle}>{title}</h3>
      {children}
    </div>
  )
}

/** Whether any input of the section is left to show; an empty one would be a heading over nothing. */
function hasInputs(keys: readonly LeverKey[], omit: ReadonlySet<LeverKey>): boolean {
  return keys.some((key) => !omit.has(key))
}

/**
 * The portfolio's column: what is left of its inputs, and the start date and the re-baseline under
 * them, since they set where the starting balance is from. With every input in the bar it is the
 * plan start's column alone.
 */
function PortfolioColumn({ draft, latest, onChange, omit, wrap }: ColumnProps) {
  const labels = ADJUST_LABELS
  const inputs = hasInputs(SECTION_KEYS.portfolio, omit)
  return (
    <Column title={inputs ? labels.portfolio.title : labels.tracking.title}>
      {inputs ? <PortfolioFields draft={draft} onChange={onChange} omit={omit} wrap={wrap} /> : null}
      {inputs ? <h3 className={styles.columnTitle}>{labels.tracking.title}</h3> : null}
      <TrackingFields draft={draft} latest={latest} onChange={onChange} />
    </Column>
  )
}

/**
 * What changes as the plan runs, in the one column: the monthly amount from a month on, and the
 * one-off events. Two columns for them made five, which the panel has no room for at laptop widths
 * (it would wrap to two rows), and both are short.
 */
function OverTimeColumn({ draft, onChange }: Pick<ColumnProps, 'draft' | 'onChange'>) {
  const labels = ADJUST_LABELS
  return (
    <Column title={labels.changes.title}>
      <ChangesFields draft={draft} onChange={onChange} />
      <h3 className={styles.columnTitle}>{labels.events.title}</h3>
      <EventsFields draft={draft} onChange={onChange} />
    </Column>
  )
}

interface ColumnProps {
  draft: NewGoalScenario
  latest: InvestedSnapshot | null
  onChange: (patch: Partial<NewGoalScenario>) => void
  omit: ReadonlySet<LeverKey>
  wrap: (key: LeverKey, field: ReactNode) => ReactNode
}

/** What the panel says about the stars above its columns, and the way back to the five it starts with. */
function StarNote({ starred }: { starred: StarredLevers }) {
  if (!starred.canEdit) return null
  return (
    <div className={styles.starNote}>
      <p className={styles.starText}>
        {starred.canAdd ? 'Star an input to keep it in the bar above.' : 'The bar holds five. Take one out of it to star another.'}
      </p>
      {starred.isDefault ? null : (
        <button type="button" className={goalStyles.btn} onClick={starred.reset}>
          Reset to defaults
        </button>
      )}
    </div>
  )
}

function PanelBody({ id, draft, latest, onChange, starred }: PanelProps) {
  const { leaving, exitMs } = useExit()
  const labels = ADJUST_LABELS
  const omit = useMemo<ReadonlySet<LeverKey>>(() => new Set(starred.keys), [starred.keys])
  const wrap = (key: LeverKey, field: ReactNode) => (
    <Starrable leverKey={key} starred={starred}>
      {field}
    </Starrable>
  )
  return (
    <div
      id={id}
      role="region"
      aria-label="All inputs"
      {...{ [STAR_HOME_ATTR]: '' }}
      className={leaving ? `${styles.fold} ${styles.folding}` : styles.fold}
      style={exitVars(leaving, exitMs)}
      inert={leaving}
    >
      <div className={styles.foldInner}>
        <Card>
          <StarNote starred={starred} />
          <div className={styles.columns}>
            <PortfolioColumn draft={draft} latest={latest} onChange={onChange} omit={omit} wrap={wrap} />
            {hasInputs(SECTION_KEYS.housing, omit) ? (
              <Column title={labels.housing.title}>
                <HousingFields draft={draft} onChange={onChange} omit={omit} wrap={wrap} />
              </Column>
            ) : null}
            <Column title={labels.fire.title}>
              <FireFields draft={draft} onChange={onChange} omit={omit} wrap={wrap} />
            </Column>
            <OverTimeColumn draft={draft} onChange={onChange} />
          </div>
        </Card>
      </div>
    </div>
  )
}

/**
 * The inputs that are not in the levers bar, in columns under it. It takes its height in and
 * out of the page the way the offline banner does, so what is under it eases down and back up,
 * and while it leaves it takes no input.
 */
export function AllInputsPanel({ open, ...panel }: PanelProps & { open: boolean }) {
  return (
    <Presence show={open} exitMs={EXIT_MS.fold}>
      <PanelBody {...panel} />
    </Presence>
  )
}
