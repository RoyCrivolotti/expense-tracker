import type { ReactNode } from 'react'
import type { NewGoalScenario } from '../../../../data/dataSource'
import type { LeverKey } from '../../../../engine'
import { Card } from '../../../components/primitives'
import { Presence } from '../../../components/Presence'
import { EXIT_MS, exitVars } from '../../../hooks/motion'
import { useExit } from '../../../hooks/usePresence'
import type { InvestedSnapshot } from '../checkinDate'
import { ADJUST_LABELS } from '../adjustSections'
import {
  EventsFields,
  FireFields,
  HousingFields,
  PortfolioFields,
  TrackingFields,
} from '../goalControlSections'
import { SECTION_KEYS } from '../leverFields'
import styles from './planDesktop.module.css'

interface PanelProps {
  id: string
  draft: NewGoalScenario
  /** The latest check-in, for re-baselining; null before the first one. */
  latest: InvestedSnapshot | null
  onChange: (patch: Partial<NewGoalScenario>) => void
  /** The inputs that are in the levers bar, so they are not here a second time. */
  omit: ReadonlySet<LeverKey>
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
function PortfolioColumn({ draft, latest, onChange, omit }: Omit<PanelProps, 'id'>) {
  const labels = ADJUST_LABELS
  const inputs = hasInputs(SECTION_KEYS.portfolio, omit)
  return (
    <Column title={inputs ? labels.portfolio.title : labels.tracking.title}>
      {inputs ? <PortfolioFields draft={draft} onChange={onChange} omit={omit} /> : null}
      {inputs ? <h3 className={styles.columnTitle}>{labels.tracking.title}</h3> : null}
      <TrackingFields draft={draft} latest={latest} onChange={onChange} />
    </Column>
  )
}

function PanelBody({ id, draft, latest, onChange, omit }: PanelProps) {
  const { leaving, exitMs } = useExit()
  const labels = ADJUST_LABELS
  return (
    <div
      id={id}
      role="region"
      aria-label="All inputs"
      className={leaving ? `${styles.fold} ${styles.folding}` : styles.fold}
      style={exitVars(leaving, exitMs)}
      inert={leaving}
    >
      <div className={styles.foldInner}>
        <Card>
          <div className={styles.columns}>
            <PortfolioColumn draft={draft} latest={latest} onChange={onChange} omit={omit} />
            {hasInputs(SECTION_KEYS.housing, omit) ? (
              <Column title={labels.housing.title}>
                <HousingFields draft={draft} onChange={onChange} omit={omit} />
              </Column>
            ) : null}
            <Column title={labels.fire.title}>
              <FireFields draft={draft} onChange={onChange} omit={omit} />
            </Column>
            <Column title={labels.events.title}>
              <EventsFields draft={draft} onChange={onChange} />
            </Column>
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
