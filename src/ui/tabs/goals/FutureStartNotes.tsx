import { useMemo } from 'react'
import type { NewGoalScenario } from '../../../data/dataSource'
import {
  formatCentsCompact,
  planFromTodayAt,
  projectNetWorth,
  scenarioToParams,
  valueOnAxisAt,
  yearsBetween,
  type PlanFromToday,
} from '../../../engine'
import { todayIso } from '../../components/transactionFormState'
import { useAssumedInflation } from '../../hooks/assumedInflationContext'
import { useMoneyFormat } from '../../hooks/moneyFormatContext'
import { formatCheckinDate } from './checkinDate'
import { planMoneyLabel } from './planMoneyLabel'
import { ownsHouseBy } from './startLaterRules'
import styles from './goals.module.css'

/** Within this share of each other, the plan's figure and the typed one are the same for this purpose. */
const CLOSE_ENOUGH = 0.01

/**
 * The plan carried on from the latest check-in, read on `date` in that date's euros: what the person is
 * likely to have then if they follow it. Null past the plan's last year.
 */
function planOnDate(
  fromToday: PlanFromToday,
  date: string,
  inflationRate: number,
): number | null {
  const plan = planFromTodayAt(fromToday, inflationRate)
  const years = yearsBetween(plan.since, date)
  const value = valueOnAxisAt(projectNetWorth(scenarioToParams(plan.scenario, inflationRate)), 0, inflationRate, years)
  return value === null ? null : Math.round(value * Math.pow(1 + inflationRate, years))
}

interface Props {
  draft: NewGoalScenario
  /** The plan carried on from the latest check-in, when the plan is another scenario than this one. */
  otherPlan: PlanFromToday | null
  onChange: (patch: Partial<NewGoalScenario>) => void
}

/**
 * What a start after today means for the starting balance, which is then a figure the person expects rather
 * than one they have, and how far it is from where the plan would put them. Derived on each render, never
 * stored: the plan's figure moves with every check-in.
 */
export function FutureStartNotes({ draft, otherPlan, onChange }: Props) {
  const format = useMoneyFormat()
  const inflationRate = useAssumedInflation()
  const start = draft.planStartDate
  const future = start != null && start > todayIso()
  // A balance read off a plan that holds its house on the date is after buying it, and one off a plan that does not
  // is before: offered to a scenario on the other side of a purchase, it would be the year-0 house over again.
  const comparable =
    future && otherPlan !== null && ownsHouseBy(otherPlan.source.plan, start) === ownsHouseBy(draft, start)
  const planCents = useMemo(
    () => (comparable ? planOnDate(otherPlan, start, inflationRate) : null),
    [comparable, otherPlan, start, inflationRate],
  )
  if (!future) return null
  const typed = draft.startInvestedCents
  const gap = planCents === null ? 0 : planCents - typed
  const shown = planCents !== null && Math.abs(gap) > CLOSE_ENOUGH * Math.max(planCents, typed)
  const money = (cents: number) => formatCentsCompact(cents, format)
  return (
    <div className={styles.field}>
      <p className={styles.fieldHint}>
        The balance you expect to have invested on {formatCheckinDate(start)}, in {planMoneyLabel(start, format)}.
      </p>
      {shown ? (
        <>
          <p className={styles.fieldHint}>
            Your plan, carried on from your latest check-in, has about {money(planCents)} on that date; this starts from{' '}
            {money(typed)}, {money(Math.abs(gap))} {gap > 0 ? 'less' : 'more'}.
          </p>
          <button type="button" className={styles.btnText} onClick={() => onChange({ startInvestedCents: planCents })}>
            Use {money(planCents)}
          </button>
        </>
      ) : null}
    </div>
  )
}
