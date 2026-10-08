import { useState, type ReactNode } from 'react'
import type { NewGoalScenario } from '../../../data/dataSource'
import { formatCents, housePriceAtPurchaseCents, rebaseline, rebaselineSummary, type LeverKey, type MoneyFormat } from '../../../engine'
import { useAssumedInflation } from '../../hooks/assumedInflationContext'
import { useMoneyFormat } from '../../hooks/moneyFormatContext'
import { formatCheckinDate, type InvestedSnapshot } from './checkinDate'
import { DateField, MoneyField, NumberField, PercentField, PurchaseYearField } from './goalControlFields'
import { ContributionStepsList } from './ContributionSteps'
import { firstChangeNote } from './contributionText'
import { housePriceHint } from './housePriceHint'
import { LifeEventsList } from './LifeEvents'
import { ADJUST_LABELS } from './adjustSections'
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
  /** Puts something around an input that can be in the bar (the star that sends it there); the phone has nothing around them. */
  wrap?: (key: LeverKey, field: ReactNode) => ReactNode
}

const plain = (_key: LeverKey, field: ReactNode): ReactNode => field

function purchaseSummary(draft: NewGoalScenario, inflationRate: number, format: MoneyFormat): string | null {
  const purchaseYear = draft.housePurchaseYear
  if (purchaseYear === null) return null
  const down = Math.round(housePriceAtPurchaseCents({ ...draft, inflationRate }) * draft.downPaymentFraction)
  const fees = draft.transactionCostsCents
  // Already owned, the house is yours from the start: nothing is taken out of the portfolio later, so
  // the starting balance is read as what is left after the down payment and fees. Without this, moving
  // the year from Never to Already own adds the whole house to the net worth and nothing says why.
  if (purchaseYear === 0) {
    return `Already own: the starting balance is counted as what is left after the ${formatCents(down, format)} down payment and ${formatCents(fees, format)} fees, so nothing comes out of the portfolio later.`
  }
  const total = down + fees
  return `Purchase cost from portfolio: ${formatCents(down, format)} down + ${formatCents(fees, format)} fees = ${formatCents(total, format)} (dip on the invested line in year ${purchaseYear}).`
}

const L = LEVER_SPECS

/**
 * The monthly amount the scenario starts with. The changes after it are set under Monthly
 * investing changes, so when there are some this says so rather than leave the amount looking like
 * all there is to it.
 */
function MonthlyInvestingField({
  draft,
  onChange,
  wrap,
}: Pick<SectionProps, 'draft' | 'onChange'> & { wrap: NonNullable<SectionProps['wrap']> }) {
  const format = useMoneyFormat()
  const note = firstChangeNote(draft, format)
  return (
    <>
      {wrap('monthlyContributionCents', <MoneyField
        label={L.monthlyContributionCents.label}
        value={draft.monthlyContributionCents}
        onChange={(v) => onChange({ monthlyContributionCents: v })}
      />)}
      {note ? <p className={styles.fieldHint}>{note}. Set under {ADJUST_LABELS.changes.title}.</p> : null}
    </>
  )
}

/**
 * What return is reasonable to type. It is said nowhere else, so it stays when the return itself is
 * in the bar, and it names the input so it still reads on its own there.
 */
export function ReturnNote() {
  return (
    <p className={styles.fieldHint}>
      Real return: about 5% a year after inflation is what world stocks have returned over the very long
      run, and many forecasts are lower. 6 to 7% is optimistic.
    </p>
  )
}

export function PortfolioFields({ draft, onChange, omit = NO_LEVERS, wrap = plain }: SectionProps) {
  return (
    <>
      {omit.has('startInvestedCents') ? null : (
        wrap('startInvestedCents', <MoneyField
          label={L.startInvestedCents.label}
          value={draft.startInvestedCents}
          onChange={(v) => onChange({ startInvestedCents: v })}
        />)
      )}
      {omit.has('monthlyContributionCents') ? null : (
        <MonthlyInvestingField draft={draft} onChange={onChange} wrap={wrap} />
      )}
      {omit.has('expectedRealReturn') ? null : (
        wrap('expectedRealReturn', <PercentField
          label={L.expectedRealReturn.label}
          value={draft.expectedRealReturn}
          max={L.expectedRealReturn.max ?? 0.15}
          onChange={(v) => onChange({ expectedRealReturn: v })}
        />)
      )}
      <ReturnNote />
      {omit.has('horizonYears') ? null : (
        wrap('horizonYears', <NumberField
          label={L.horizonYears.label}
          value={draft.horizonYears}
          min={L.horizonYears.min ?? 1}
          max={L.horizonYears.max ?? 60}
          onChange={(v) => onChange({ horizonYears: v })}
        />)
      )}
    </>
  )
}

function PurchaseCostFields({ draft, onChange, omit = NO_LEVERS, wrap = plain }: SectionProps) {
  // Worked out from the draft and said nowhere else, so it stays when the price is in the bar.
  const priceHint = housePriceHint(draft, useAssumedInflation(), useMoneyFormat())
  return (
    <>
      {omit.has('housePriceCents') ? null : (
        wrap('housePriceCents', <MoneyField
          label={L.housePriceCents.label}
          value={draft.housePriceCents}
          onChange={(v) => onChange({ housePriceCents: v })}
        />)
      )}
      {priceHint ? <p className={styles.fieldHint}>{priceHint}</p> : null}
      {omit.has('downPaymentFraction') ? null : (
        wrap('downPaymentFraction', <PercentField
          label={L.downPaymentFraction.label}
          value={draft.downPaymentFraction}
          max={L.downPaymentFraction.max ?? 0.5}
          onChange={(v) => onChange({ downPaymentFraction: v })}
        />)
      )}
      {omit.has('transactionCostsCents') ? null : (
        <>
          {wrap('transactionCostsCents', <MoneyField
            label={L.transactionCostsCents.label}
            value={draft.transactionCostsCents}
            onChange={(v) => onChange({ transactionCostsCents: v })}
          />)}
          <p className={styles.fieldHint}>
            Notary, agency, and closing costs withdrawn with the down payment in the purchase
            year.
          </p>
        </>
      )}
    </>
  )
}

function MortgageFields({ draft, onChange, omit = NO_LEVERS, wrap = plain }: SectionProps) {
  // The note is about both rates, so it stays while either is on the page. With only one starred
  // it would otherwise go with it and leave the other with no word on what it means.
  const explainsRates = !omit.has('mortgageRateAnnual') || !omit.has('houseAppreciationRate')
  return (
    <>
      {omit.has('mortgageRateAnnual') ? null : (
        wrap('mortgageRateAnnual', <PercentField
          label={L.mortgageRateAnnual.label}
          value={draft.mortgageRateAnnual}
          max={L.mortgageRateAnnual.max ?? 0.1}
          onChange={(v) => onChange({ mortgageRateAnnual: v })}
        />)
      )}
      {omit.has('mortgageTermYears') ? null : (
        wrap('mortgageTermYears', <NumberField
          label={L.mortgageTermYears.label}
          value={draft.mortgageTermYears}
          min={L.mortgageTermYears.min ?? 1}
          max={L.mortgageTermYears.max ?? 40}
          onChange={(v) => onChange({ mortgageTermYears: v })}
        />)
      )}
      {omit.has('houseAppreciationRate') ? null : (
        wrap('houseAppreciationRate', <PercentField
          label={L.houseAppreciationRate.label}
          value={draft.houseAppreciationRate}
          max={L.houseAppreciationRate.max ?? 0.1}
          onChange={(v) => onChange({ houseAppreciationRate: v })}
        />)
      )}
      {explainsRates ? (
        <p className={styles.fieldHint}>
          The mortgage rate and house appreciation are nominal, as a bank and the price index
          quote them. The plan takes inflation off both, so the house and the debt are in
          today&apos;s money, like the plan.
        </p>
      ) : null}
    </>
  )
}

function PurchaseTimingFields({ draft, onChange, omit = NO_LEVERS, wrap = plain }: SectionProps) {
  const format = useMoneyFormat()
  // What the purchase takes from the portfolio is worked out from the draft, not from the year's
  // field, so it is still said while the year is in the levers bar, where it is the one place
  // the figure is.
  const purchaseHint = purchaseSummary(draft, useAssumedInflation(), format)
  return (
    <>
      {omit.has('housePurchaseYear') ? null : (
        wrap(
          'housePurchaseYear',
          <PurchaseYearField
            value={draft.housePurchaseYear}
            maxYear={draft.horizonYears}
            onChange={(v) => onChange({ housePurchaseYear: v })}
          />,
        )
      )}
      {purchaseHint ? <p className={styles.fieldHint}>{purchaseHint}</p> : null}
      {omit.has('rentMonthlyCents') ? null : (
        wrap('rentMonthlyCents', <MoneyField
          label={L.rentMonthlyCents.label}
          value={draft.rentMonthlyCents}
          onChange={(v) => onChange({ rentMonthlyCents: v })}
        />)
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

export function FireFields({ draft, onChange, omit = NO_LEVERS, wrap = plain }: SectionProps) {
  // The formula is about both inputs, so it stays while either is on the page.
  const explainsTarget = !omit.has('annualSpendCents') || !omit.has('safeWithdrawalRate')
  return (
    <>
      <p className={styles.fieldHint}>
        Models life after financial independence, not withdrawals today. FI is searched within
        your Horizon (years); if never reached, drawdown charts show the target only.
      </p>
      {omit.has('annualSpendCents') ? null : (
        <>
          {wrap('annualSpendCents', <MoneyField
            label={L.annualSpendCents.label}
            value={draft.annualSpendCents}
            onChange={(v) => onChange({ annualSpendCents: v })}
          />)}
          <p className={styles.fieldHint}>
            Yearly cost of living you would need the portfolio to cover after FI (within the horizon).
          </p>
        </>
      )}
      {omit.has('safeWithdrawalRate') ? null : (
        wrap('safeWithdrawalRate', <PercentField
          label={L.safeWithdrawalRate.label}
          value={draft.safeWithdrawalRate}
          min={L.safeWithdrawalRate.min ?? 0.005}
          max={L.safeWithdrawalRate.max ?? 0.06}
          onChange={(v) => onChange({ safeWithdrawalRate: v })}
        />)
      )}
      {explainsTarget ? (
        <p className={styles.fieldHint}>
          Share of the portfolio you would spend each year once FI (4% is the usual rule of thumb).
          Lower rate = spend less = higher FI target. FI target = annual spend ÷ this rate.
        </p>
      ) : null}
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
        hint="Anchors the projection to a calendar date so wealth check-ins can show whether you are ahead or behind. Changes to the monthly amount count from it too."
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

export function ChangesFields({ draft, onChange, omit = NO_LEVERS }: Pick<SectionProps, 'draft' | 'onChange' | 'omit'>) {
  const format = useMoneyFormat()
  return (
    <>
      <p className={styles.fieldHint}>
        What you send to your investments each month: the amount you start with, then each change from a month
        on. It is counted in today's money at the assumed inflation, so an amount that stays the same counts for
        less each year. Enter 0 for a pause.
      </p>
      <ContributionStepsList
        steps={draft.contributionSchedule ?? []}
        planStartDate={draft.planStartDate}
        baseCents={draft.monthlyContributionCents}
        startSetIn={omit.has('monthlyContributionCents') ? 'the bar above' : 'Portfolio'}
        format={format}
        onChange={(steps) => onChange({ contributionSchedule: steps })}
      />
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
