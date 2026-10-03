import type { ReactNode } from 'react'
import type { NewGoalScenario } from '../../../data/dataSource'
import type { InvestedSnapshot } from './checkinDate'
import { ADJUST_LABELS, adjustSectionId, type AdjustSection } from './adjustSections'
import { EventsFields, FireFields, HousingFields, PortfolioFields, TrackingFields } from './goalControlSections'
import styles from './goals.module.css'

interface GoalControlsProps {
  draft: NewGoalScenario
  /** The latest check-in, for re-baselining; null before the first one. */
  latest?: InvestedSnapshot | null
  onChange: (patch: Partial<NewGoalScenario>) => void
}

function ControlSection({
  section,
  defaultOpen = true,
  children,
}: {
  section: AdjustSection
  defaultOpen?: boolean
  children: ReactNode
}) {
  return (
    <details id={adjustSectionId(section)} className={styles.controlSection} open={defaultOpen}>
      <summary className={styles.controlSummary}>{ADJUST_LABELS[section].title}</summary>
      <div className={styles.controlBody}>{children}</div>
    </details>
  )
}

/** The phone's controls: each section collapsible. A wide screen lays the same sections out itself. */
export function GoalControls({ draft, latest = null, onChange }: GoalControlsProps) {
  return (
    <div className={styles.controlsStack}>
      <ControlSection section="portfolio">
        <PortfolioFields draft={draft} onChange={onChange} />
      </ControlSection>
      <ControlSection section="housing">
        <HousingFields draft={draft} onChange={onChange} />
      </ControlSection>
      <ControlSection section="fire">
        <FireFields draft={draft} onChange={onChange} />
      </ControlSection>
      <ControlSection section="tracking" defaultOpen={false}>
        <TrackingFields draft={draft} latest={latest} onChange={onChange} />
      </ControlSection>
      <ControlSection section="events" defaultOpen={false}>
        <EventsFields draft={draft} onChange={onChange} />
      </ControlSection>
    </div>
  )
}
