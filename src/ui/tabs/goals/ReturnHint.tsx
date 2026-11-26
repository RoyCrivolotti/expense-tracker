import type { GoalScenario } from '../../../types'
import type { PortfolioReturn, ReturnReading } from '../../../engine'
import { formatCents, formatPercent, plannedMonthlyAt } from '../../../engine'
import type { MoneyFormat } from '../../../engine/money'
import { formatCheckinDate } from './checkinDate'
import { hintStyle } from './hintStyle'

/** A yearly return is judged against the plan's only from this many years of history. */
const SETTLED_RETURN_YEARS = 10

/**
 * Whether being behind is a saving problem or a market one. Under a full year the figure
 * is the period's return and reads "so far"; from a year on it is compounded to a yearly
 * rate, has the assumed inflation taken off, and is set against the plan's real return,
 * the same way on/off track above it deflates the balance before comparing.
 */
export function ReturnHint({
  reading,
  plan,
  format,
  inflationRate,
}: {
  reading: ReturnReading
  plan: GoalScenario | null
  format: MoneyFormat
  inflationRate: number
}) {
  const since = formatCheckinDate(reading.ret.startDate)
  if (reading.kind !== 'figure') {
    return <UnrecordedHint kind={reading.kind} plan={plan} ret={reading.ret} since={since} format={format} />
  }
  return <FigureHint ret={reading.ret} plan={plan} since={since} format={format} inflationRate={inflationRate} />
}

function FigureHint({
  ret,
  plan,
  since,
  format,
  inflationRate,
}: {
  ret: PortfolioReturn
  plan: GoalScenario | null
  since: string
  format: MoneyFormat
  inflationRate: number
}) {
  const planRate = plan ? `${formatPercent(plan.expectedRealReturn, format)} a year` : ''
  if (ret.annualised === null) {
    // What is measured is a total over under a year, in the money of the day, and the plan's rate is
    // a yearly one after inflation: set side by side they read as ahead whatever the plan expects, so
    // the plan is stated for the same stretch.
    const expected = plan ? Math.pow((1 + plan.expectedRealReturn) * (1 + inflationRate), ret.years) - 1 : null
    return (
      <p style={hintStyle}>
        Your portfolio has returned <strong>{formatPercent(ret.periodReturn, format)} so far</strong> since {since}
        {plan && expected !== null
          ? `, where ${plan.name} assumes about ${formatPercent(expected, format)} over the same days (${planRate} after inflation, with ${formatPercent(inflationRate, format)} inflation)`
          : ''}
        .
      </p>
    )
  }
  const real = (1 + ret.annualised) / (1 + inflationRate) - 1
  // Under ten years a yearly return is mostly the market's luck: at 17% volatility its standard
  // error is about 12 points after two years and still 5 after ten, so a colour would say ahead or
  // behind where the figure cannot tell. It is shown plain, with that said.
  const settled = ret.years >= SETTLED_RETURN_YEARS
  const onPar = !plan || real >= plan.expectedRealReturn
  return (
    <p style={hintStyle}>
      Your portfolio returned{' '}
      <strong style={settled ? { color: onPar ? 'var(--exp-success)' : 'var(--exp-danger)' } : undefined}>
        {formatPercent(ret.annualised, format)} a year
      </strong>{' '}
      since {since}, about {formatPercent(real, format)} once {formatPercent(inflationRate, format)} inflation is taken
      off
      {plan ? ` against the ${planRate}, after inflation, that ${plan.name} assumes` : ''}.
      {plan && !settled ? ` A few years of returns say little about a long-run ${planRate}.` : ''}
    </p>
  )
}

/**
 * What is said in place of a return that cannot be believed: the balance grew by money that no
 * investment transaction records, which a return would count as growth. Two ways to see it, and the
 * same fix: record the transfers.
 */
function UnrecordedHint({
  kind,
  plan,
  ret,
  since,
  format,
}: {
  kind: 'no-investments' | 'too-high'
  plan: GoalScenario | null
  ret: PortfolioReturn
  since: string
  format: MoneyFormat
}) {
  const fix = 'Add what you moved in as Investment transactions to see the return.'
  if (kind === 'no-investments') {
    const monthly = plan ? formatCents(plannedMonthlyAt(plan, ret.endDate), format) : ''
    return (
      <p style={hintStyle}>
        {plan ? `${plan.name} expects ${monthly} a month, but ` : ''}no investments are recorded since {since}, so the
        balance may include money you moved in, which a return would count as growth. {fix}
      </p>
    )
  }
  return (
    <p style={hintStyle}>
      Your balance has grown by more than 30%{ret.annualised === null ? '' : ' a year'} since {since}. That is more than
      markets usually give, and usually money you moved in that is not recorded as an investment. {fix}
    </p>
  )
}
