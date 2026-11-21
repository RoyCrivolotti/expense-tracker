import { useState } from 'react'
import type { NewGoalScenario } from '../../../data/dataSource'
import { foldChangesAtOrBefore, formatCents, rebaseline, rebaselineSummary } from '../../../engine'
import { useAssumedInflation } from '../../hooks/assumedInflationContext'
import { useMoneyFormat } from '../../hooks/moneyFormatContext'
import { formatCheckinDate, type InvestedSnapshot } from './checkinDate'
import { DateField } from './goalControlFields'
import styles from './goals.module.css'

interface TrackingProps {
  draft: NewGoalScenario
  /** The latest check-in, for re-baselining; null before the first one. */
  latest: InvestedSnapshot | null
  onChange: (patch: Partial<NewGoalScenario>) => void
}

/**
 * What moving the plan start writes. Changes to the monthly amount that have begun by the new start are what the plan
 * starts with (the engine reads them so), so they fold into the starting amount and leave the history, and the box and
 * the first line say what the plan uses instead of an amount it no longer does.
 */
function planStartPatch(draft: NewGoalScenario, date: string | null): Partial<NewGoalScenario> {
  const schedule = draft.contributionSchedule ?? []
  if (!date || schedule.length === 0) return { planStartDate: date }
  const { monthlyContributionCents, contributionSchedule, folded } = foldChangesAtOrBefore(draft.monthlyContributionCents, schedule, date)
  return folded.length === 0 ? { planStartDate: date } : { planStartDate: date, monthlyContributionCents, contributionSchedule }
}

export function TrackingFields({ draft, latest, onChange }: TrackingProps) {
  const format = useMoneyFormat()
  const inflationRate = useAssumedInflation()
  // What the last re-baseline moved, so a dropped event is not found out at Save. Kept with
  // the values it left in the draft: once the draft no longer holds them (Discard, another
  // scenario loaded) the note describes something that is not there and goes away.
  const [rebaselined, setRebaselined] = useState<{
    lines: string[]
    planStartDate: string
    lifeEvents: string
    schedule: string
  } | null>(null)
  const note =
    rebaselined &&
    rebaselined.planStartDate === draft.planStartDate &&
    rebaselined.lifeEvents === JSON.stringify(draft.lifeEvents) &&
    rebaselined.schedule === JSON.stringify(draft.contributionSchedule ?? [])
      ? rebaselined.lines
      : null
  const rebaselineHint = latest
    ? `Sets the starting balance to ${formatCents(latest.investedCents, format)} and the start date to ${formatCheckinDate(latest.date)}, your latest check-in. From then on ahead or behind starts again from zero at that date, so it shows what you invest and how markets do from there. It is the reset to reach for after a one-off inflow, or when the plan was made from a guess.`
    : 'Log a wealth check-in first; re-baselining sets the starting balance and start date from it.'
  return (
    <>
      <DateField
        label="Plan start date"
        value={draft.planStartDate ?? null}
        hint="Anchors the projection to a calendar date so wealth check-ins can show whether you are ahead or behind. Changes to the monthly amount count from it too, and one that has begun by it becomes the amount you start with."
        onChange={(v) => onChange(planStartPatch(draft, v))}
      />
      <div className={styles.field}>
        <button
          type="button"
          className={styles.btn}
          disabled={!latest}
          onClick={() => {
            if (!latest) return
            const next = rebaseline(draft, latest, inflationRate)
            onChange(next.patch)
            const lines = rebaselineSummary(next, format, formatCheckinDate)
            setRebaselined(
              lines.length > 0
                ? {
                    lines,
                    planStartDate: next.patch.planStartDate,
                    lifeEvents: JSON.stringify(next.patch.lifeEvents),
                    schedule: JSON.stringify(next.patch.contributionSchedule),
                  }
                : null,
            )
          }}
        >
          Re-baseline from latest check-in
        </button>
        <p className={styles.fieldHint}>{rebaselineHint}</p>
        {note ? (
          <div role="status">
            {note.map((line) => (
              <p key={line} className={styles.fieldHint}>
                {line}
              </p>
            ))}
          </div>
        ) : null}
      </div>
    </>
  )
}
