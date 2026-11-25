import type { NewGoalScenario } from '../../../data/dataSource'
import { useAssumedInflation } from '../../hooks/assumedInflationContext'
import { useMoneyFormat } from '../../hooks/moneyFormatContext'
import { MoneyField, NumberField } from './goalControlFields'
import { PercentField, PurchaseYearField } from './goalSliderFields'
import { housePriceDetail, housePriceHint } from './housePriceHint'
import { Disclosure } from './Disclosure'
import { feesMoneyHint, rentMoneyHint } from './moneyHints'
import { planMoneyLabel } from './planMoneyLabel'
import { LEVER_SPECS, NO_LEVERS } from './leverFields'
import { purchaseSummary } from './purchaseSummary'
import { plain, type SectionProps } from './sectionProps'
import styles from './goals.module.css'

const L = LEVER_SPECS

/**
 * How high the down payment goes. A house owned from the first day holds, as its down payment, the share
 * that is no longer owed, which a re-baseline can work out above half, so the field has room for it.
 */
function downPaymentMax(draft: Pick<NewGoalScenario, 'housePurchaseYear'>): number {
  return draft.housePurchaseYear === 0 ? 1 : (L.downPaymentFraction.max ?? 0.5)
}

function PurchaseCostFields({ draft, onChange, omit = NO_LEVERS, wrap = plain }: SectionProps) {
  // Worked out from the draft and said nowhere else, so it stays when the price is in the bar.
  const inflationRate = useAssumedInflation()
  const format = useMoneyFormat()
  const priceHint = housePriceHint(draft, inflationRate, format)
  return (
    <>
      {omit.has('housePriceCents')
        ? null
        : wrap(
            'housePriceCents',
            <MoneyField
              label={L.housePriceCents.label}
              value={draft.housePriceCents}
              onChange={(v) => onChange({ housePriceCents: v })}
            />,
          )}
      {priceHint ? <p className={styles.fieldHint}>{priceHint}</p> : null}
      {omit.has('downPaymentFraction')
        ? null
        : wrap(
            'downPaymentFraction',
            <PercentField
              label={L.downPaymentFraction.label}
              value={draft.downPaymentFraction}
              max={downPaymentMax(draft)}
              onChange={(v) => onChange({ downPaymentFraction: v })}
            />,
          )}
      {omit.has('transactionCostsCents') ? null : (
        <>
          {wrap(
            'transactionCostsCents',
            <MoneyField
              label={L.transactionCostsCents.label}
              value={draft.transactionCostsCents}
              onChange={(v) => onChange({ transactionCostsCents: v })}
            />,
          )}
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
      {omit.has('mortgageRateAnnual')
        ? null
        : wrap(
            'mortgageRateAnnual',
            <PercentField
              label={L.mortgageRateAnnual.label}
              value={draft.mortgageRateAnnual}
              max={L.mortgageRateAnnual.max ?? 0.1}
              onChange={(v) => onChange({ mortgageRateAnnual: v })}
            />,
          )}
      {omit.has('mortgageTermYears')
        ? null
        : wrap(
            'mortgageTermYears',
            <NumberField
              label={L.mortgageTermYears.label}
              value={draft.mortgageTermYears}
              decimals={2}
              min={L.mortgageTermYears.min ?? 1}
              max={L.mortgageTermYears.max ?? 40}
              onChange={(v) => onChange({ mortgageTermYears: v })}
            />,
          )}
      {omit.has('houseAppreciationRate')
        ? null
        : wrap(
            'houseAppreciationRate',
            <PercentField
              label={L.houseAppreciationRate.label}
              value={draft.houseAppreciationRate}
              max={L.houseAppreciationRate.max ?? 0.1}
              onChange={(v) => onChange({ houseAppreciationRate: v })}
            />,
          )}
      {explainsRates ? (
        <p className={styles.fieldHint}>Enter both as quoted, before inflation. The plan takes inflation off.</p>
      ) : null}
    </>
  )
}

/**
 * What owning the house costs a year beyond the mortgage. Not an input of the plan's own line: Rent vs
 * buy counts it against the buyer, so it is always shown, with or without a purchase planned, and it
 * has no star since it is not one of the inputs that can sit in the bar.
 */
function HomeCarryField({ draft, onChange }: Pick<SectionProps, 'draft' | 'onChange'>) {
  return (
    <>
      <PercentField
        label="Upkeep, tax and insurance (%/yr)"
        value={draft.homeCarryRate}
        max={0.1}
        onChange={(v) => onChange({ homeCarryRate: v })}
      />
      <p className={styles.fieldHint}>1 to 2% is usual.</p>
    </>
  )
}

function PurchaseTimingFields({ draft, onChange, omit = NO_LEVERS, wrap = plain }: SectionProps) {
  const format = useMoneyFormat()
  // What the purchase takes from the portfolio is worked out from the draft, not from the year's
  // field, so it is still said while the year is in the levers bar, where it is the one place
  // the figure is.
  const inflationRate = useAssumedInflation()
  const purchaseHint = purchaseSummary(draft, inflationRate, format)
  return (
    <>
      {omit.has('housePurchaseYear')
        ? null
        : wrap(
            'housePurchaseYear',
            <PurchaseYearField
              value={draft.housePurchaseYear}
              maxYear={draft.horizonYears}
              onChange={(v) => onChange({ housePurchaseYear: v })}
            />,
          )}
      {purchaseHint ? <p className={styles.fieldHint}>{purchaseHint}</p> : null}
      {omit.has('rentMonthlyCents')
        ? null
        : wrap(
            'rentMonthlyCents',
            <MoneyField
              label={L.rentMonthlyCents.label}
              value={draft.rentMonthlyCents}
              onChange={(v) => onChange({ rentMonthlyCents: v })}
            />,
          )}
      <HomeCarryField draft={draft} onChange={onChange} />
    </>
  )
}

/**
 * How the housing figures are counted: what the plan did to what was typed. Behind one closed note, since they are for
 * checking the numbers and not for entering them, and said once for the section whichever inputs are in the bar.
 */
function HousingNotes({ draft, omit = NO_LEVERS }: Pick<SectionProps, 'draft' | 'omit'>) {
  const inflationRate = useAssumedInflation()
  const format = useMoneyFormat()
  // What explains one input leaves with it when it is in the bar; what is worked out from the draft stays.
  const feesShown = !omit.has('transactionCostsCents')
  const ratesShown = !omit.has('mortgageRateAnnual') || !omit.has('houseAppreciationRate')
  const notes = [
    housePriceDetail(draft, inflationRate, format),
    feesShown
      ? 'Fees are notary, agency and closing costs, withdrawn with the down payment in the year you buy.'
      : null,
    feesShown ? feesMoneyHint(draft, inflationRate, format) : null,
    rentMoneyHint(draft, inflationRate, format),
    ratesShown
      ? `The mortgage rate and house appreciation are nominal, as a bank and the price index quote them. The plan takes inflation off both, so the house and the debt are in ${planMoneyLabel(draft.planStartDate, format)}, like the plan.`
      : null,
    "Upkeep is what owning costs a year beyond the mortgage, as a share of the house's value: repairs, property tax and insurance. Rent vs buy counts it against buying.",
  ].filter((note): note is string => note !== null)
  return (
    <Disclosure title="How these are counted">
      {notes.map((note) => (
        <p key={note}>{note}</p>
      ))}
    </Disclosure>
  )
}

export function HousingFields(props: SectionProps) {
  return (
    <>
      <PurchaseCostFields {...props} />
      <MortgageFields {...props} />
      <PurchaseTimingFields {...props} />
      <HousingNotes draft={props.draft} omit={props.omit ?? NO_LEVERS} />
    </>
  )
}
