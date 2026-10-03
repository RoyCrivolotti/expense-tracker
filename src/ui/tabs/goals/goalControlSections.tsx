import { useState } from 'react'
import type { NewGoalScenario } from '../../../data/dataSource'
import { formatCents, rebaseline, rebaselineSummary, type LeverKey, type MoneyFormat } from '../../../engine'
import { useMoneyFormat } from '../../hooks/moneyFormatContext'
import { formatCheckinDate, type InvestedSnapshot } from './checkinDate'
import { DateField, MoneyField, NumberField, PercentField, PurchaseYearField } from './goalControlFields'
import { LifeEventsList } from './LifeEvents'
import { LEVER_SPECS, NO_LEVERS } from './leverFields'
import styles from './goals.module.css'

/**
 * What each section of the controls holds, apart from the frame it sits in: the phone's
 * collapsible sections (GoalControls) and the wide screen's columns (desktop/AllInputsPanel)
 * both lay these out. `omit` is the inputs that live in the levers bar instead, so one input is
 * never on screen twice.
 */
export interface SectionProps {
  draft: NewGoalScenario
  onChange: (patch: Partial<NewGoalScenario>) => void
  omit?: ReadonlySet<LeverKey>
}

function purchaseSummary(draft: NewGoalScenario, format: MoneyFormat): string | null {
  const purchaseYear = draft.housePurchaseYear
  if (purchaseYear === null || purchaseYear === 0) return null
  const down = Math.round(draft.housePriceCents * draft.downPaymentFraction)
  const fees = draft.transactionCostsCents
  const total = down + fees
  return `Purchase cost from portfolio: ${formatCents(down, format)} down + ${formatCents(fees, format)} fees = ${formatCents(total, format)} (dip on the invested line in year ${purchaseYear}).`
}

const L = LEVER_SPECS

export function PortfolioFields({ draft, onChange, omit = NO_LEVERS }: SectionProps) {
  return (
    <>
      {omit.has('startInvestedCents') ? null : (
        <MoneyField
          label={L.startInvestedCents.label}
          value={draft.startInvestedCents}
          onChange={(v) => onChange({ startInvestedCents: v })}
        />
      )}
      {omit.has('monthlyContributionCents') ? null : (
        <MoneyField
          label={L.monthlyContributionCents.label}
          value={draft.monthlyContributionCents}
          onChange={(v) => onChange({ monthlyContributionCents: v })}
        />
      )}
      {omit.has('annualContributionGrowth') ? null : (
        <PercentField
          label={L.annualContributionGrowth.label}
          value={draft.annualContributionGrowth}
          max={L.annualContributionGrowth.max ?? 0.1}
          onChange={(v) => onChange({ annualContributionGrowth: v })}
        />
      )}
      {omit.has('expectedRealReturn') ? null : (
        <PercentField
          label={L.expectedRealReturn.label}
          value={draft.expectedRealReturn}
          max={L.expectedRealReturn.max ?? 0.15}
          onChange={(v) => onChange({ expectedRealReturn: v })}
        />
      )}
      {omit.has('horizonYears') ? null : (
        <NumberField
          label={L.horizonYears.label}
          value={draft.horizonYears}
          min={L.horizonYears.min ?? 1}
          max={L.horizonYears.max ?? 60}
          onChange={(v) => onChange({ horizonYears: v })}
        />
      )}
    </>
  )
}

function PurchaseCostFields({ draft, onChange, omit = NO_LEVERS }: SectionProps) {
  return (
    <>
      {omit.has('housePriceCents') ? null : (
        <MoneyField
          label={L.housePriceCents.label}
          value={draft.housePriceCents}
          onChange={(v) => onChange({ housePriceCents: v })}
        />
      )}
      {omit.has('downPaymentFraction') ? null : (
        <PercentField
          label={L.downPaymentFraction.label}
          value={draft.downPaymentFraction}
          max={L.downPaymentFraction.max ?? 0.5}
          onChange={(v) => onChange({ downPaymentFraction: v })}
        />
      )}
      {omit.has('transactionCostsCents') ? null : (
        <>
          <MoneyField
            label={L.transactionCostsCents.label}
            value={draft.transactionCostsCents}
            onChange={(v) => onChange({ transactionCostsCents: v })}
          />
          <p className={styles.fieldHint}>
            Notary, agency, and closing costs withdrawn with the down payment in the purchase
            year.
          </p>
        </>
      )}
    </>
  )
}

function MortgageFields({ draft, onChange, omit = NO_LEVERS }: SectionProps) {
  return (
    <>
      {omit.has('mortgageRateAnnual') ? null : (
        <PercentField
          label={L.mortgageRateAnnual.label}
          value={draft.mortgageRateAnnual}
          max={L.mortgageRateAnnual.max ?? 0.1}
          onChange={(v) => onChange({ mortgageRateAnnual: v })}
        />
      )}
      {omit.has('mortgageTermYears') ? null : (
        <NumberField
          label={L.mortgageTermYears.label}
          value={draft.mortgageTermYears}
          min={L.mortgageTermYears.min ?? 1}
          max={L.mortgageTermYears.max ?? 40}
          onChange={(v) => onChange({ mortgageTermYears: v })}
        />
      )}
      {omit.has('houseAppreciationRate') ? null : (
        <>
          <PercentField
            label={L.houseAppreciationRate.label}
            value={draft.houseAppreciationRate}
            max={L.houseAppreciationRate.max ?? 0.1}
            onChange={(v) => onChange({ houseAppreciationRate: v })}
          />
          <p className={styles.fieldHint}>
            The mortgage rate and house appreciation are nominal, as a bank and the price index
            quote them. The plan takes inflation off both, so the house and the debt are in
            today&apos;s money like everything else.
          </p>
        </>
      )}
    </>
  )
}

function PurchaseTimingFields({ draft, onChange, omit = NO_LEVERS }: SectionProps) {
  const format = useMoneyFormat()
  const purchaseHint = omit.has('housePurchaseYear') ? null : purchaseSummary(draft, format)
  return (
    <>
      {omit.has('housePurchaseYear') ? null : (
        <PurchaseYearField
          value={draft.housePurchaseYear}
          maxYear={draft.horizonYears}
          onChange={(v) => onChange({ housePurchaseYear: v })}
        />
      )}
      {purchaseHint ? <p className={styles.fieldHint}>{purchaseHint}</p> : null}
      {omit.has('rentMonthlyCents') ? null : (
        <MoneyField
          label={L.rentMonthlyCents.label}
          value={draft.rentMonthlyCents}
          onChange={(v) => onChange({ rentMonthlyCents: v })}
        />
      )}
    </>
  )
}

export function HousingFields(props: SectionProps) {
  return (
    <>
      <PurchaseCostFields {...props} />
      <MortgageFields {...props} />
      <PurchaseTimingFields {...props} />
    </>
  )
}

export function FireFields({ draft, onChange, omit = NO_LEVERS }: SectionProps) {
  return (
    <>
      <p className={styles.fieldHint}>
        Models life after financial independence, not withdrawals today. FI is searched within
        your Horizon (years); if never reached, drawdown charts show the target only.
      </p>
      {omit.has('annualSpendCents') ? null : (
        <>
          <MoneyField
            label={L.annualSpendCents.label}
            value={draft.annualSpendCents}
            onChange={(v) => onChange({ annualSpendCents: v })}
          />
          <p className={styles.fieldHint}>
            Yearly cost of living you would need the portfolio to cover after FI (within the horizon).
          </p>
        </>
      )}
      {omit.has('safeWithdrawalRate') ? null : (
        <>
          <PercentField
            label={L.safeWithdrawalRate.label}
            value={draft.safeWithdrawalRate}
            min={L.safeWithdrawalRate.min ?? 0.005}
            max={L.safeWithdrawalRate.max ?? 0.06}
            onChange={(v) => onChange({ safeWithdrawalRate: v })}
          />
          <p className={styles.fieldHint}>
            Share of the portfolio you would spend each year once FI (4% is the usual rule of thumb).
            Lower rate = spend less = higher FI target. FI target = annual spend ÷ this rate.
          </p>
        </>
      )}
    </>
  )
}

interface TrackingProps {
  draft: NewGoalScenario
  /** The latest check-in, for re-baselining; null before the first one. */
  latest: InvestedSnapshot | null
  onChange: (patch: Partial<NewGoalScenario>) => void
}

export function TrackingFields({ draft, latest, onChange }: TrackingProps) {
  const format = useMoneyFormat()
  // What the last re-baseline moved, so a dropped event is not found out at Save. Kept with
  // the values it left in the draft: once the draft no longer holds them (Discard, another
  // scenario loaded) the note describes something that is not there and goes away.
  const [rebaselined, setRebaselined] = useState<{ lines: string[]; planStartDate: string; lifeEvents: string } | null>(null)
  const note =
    rebaselined &&
    rebaselined.planStartDate === draft.planStartDate &&
    rebaselined.lifeEvents === JSON.stringify(draft.lifeEvents)
      ? rebaselined.lines
      : null
  const rebaselineHint = latest
    ? `Sets the starting balance to ${formatCents(latest.investedCents, format)} and the start date to ${formatCheckinDate(latest.date)}, your latest check-in. From then on ahead or behind measures only what you did after that date, which is the reset to reach for after a one-off inflow, or when the plan was made from a guess.`
    : 'Log a wealth check-in first; re-baselining sets the starting balance and start date from it.'
  return (
    <>
      <DateField
        label="Plan start date"
        value={draft.planStartDate ?? null}
        hint="Anchors the projection to a calendar date so wealth check-ins can show whether you are ahead or behind."
        onChange={(v) => onChange({ planStartDate: v })}
      />
      <div className={styles.field}>
        <button
          type="button"
          className={styles.btn}
          disabled={!latest}
          onClick={() => {
            if (!latest) return
            const next = rebaseline(draft, latest)
            onChange(next.patch)
            const lines = rebaselineSummary(next, format, formatCheckinDate)
            setRebaselined(
              lines.length > 0
                ? { lines, planStartDate: next.patch.planStartDate, lifeEvents: JSON.stringify(next.patch.lifeEvents) }
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

export function EventsFields({ draft, onChange }: Pick<SectionProps, 'draft' | 'onChange'>) {
  const format = useMoneyFormat()
  return (
    <>
      <p className={styles.fieldHint}>
        One-off cash events (bonuses, inheritances, large purchases) applied to the portfolio in a
        specific projection year. Shown as diamond markers on the chart.
      </p>
      <LifeEventsList
        events={draft.lifeEvents ?? []}
        horizonYears={draft.horizonYears}
        format={format}
        onChange={(events) => onChange({ lifeEvents: events })}
      />
    </>
  )
}
