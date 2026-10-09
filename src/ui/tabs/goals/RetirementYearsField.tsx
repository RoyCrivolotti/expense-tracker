import type { NewGoalScenario } from '../../../data/dataSource'
import {
  RETIREMENT_RATE_BANDS,
  RETIREMENT_YEARS_MAX,
  fiPatchForYears,
  recommendedWithdrawalRate,
  type MoneyFormat,
} from '../../../engine'
import { useMoneyFormat } from '../../hooks/moneyFormatContext'
import { NumberField } from './goalControlFields'
import styles from './goals.module.css'

/** A rate as a person writes it: 4%, 3,5%, 3,25%, with only the places it needs. */
function plainPercent(rate: number, format: MoneyFormat): string {
  return `${(rate * 100).toLocaleString(format.locale, { maximumFractionDigits: 2 })}%`
}

/** The guide in words, from the bands the engine uses: "4% up to 35 years, 3,5% up to 49 and 3,25% from 50". */
function guideText(format: MoneyFormat): string {
  const [short, middle, long] = RETIREMENT_RATE_BANDS
  return `${plainPercent(short.rate, format)} up to ${short.upTo} years, ${plainPercent(middle.rate, format)} up to ${middle.upTo} and ${plainPercent(long.rate, format)} from ${middle.upTo + 1}`
}

/**
 * How many years the invested money has to pay for the spending after FI. It has no star, since it is
 * not one of the inputs that can sit in the bar, so it is always shown. A change to it moves the
 * withdrawal rate to the guide for the new years, unless the rate was set by hand.
 */
export function RetirementYearsField({
  draft,
  onChange,
}: {
  draft: Pick<NewGoalScenario, 'retirementYears' | 'safeWithdrawalRate'>
  onChange: (patch: Partial<NewGoalScenario>) => void
}) {
  const format = useMoneyFormat()
  return (
    <>
      <NumberField
        label="Years the money must last"
        value={draft.retirementYears}
        min={1}
        max={RETIREMENT_YEARS_MAX}
        onChange={(v) => onChange(fiPatchForYears(draft, v))}
      />
      <p className={styles.fieldHint}>
        How long the invested money has to pay for your spending after FI. The longer, the lower the withdrawal rate
        has to be: the usual guide is {guideText(format)}, so {draft.retirementYears} years points to{' '}
        {plainPercent(recommendedWithdrawalRate(draft.retirementYears), format)}. It is a rule of thumb, not a
        promise: the FI chart shows how often the money lasts in simulated markets. Changing the years moves the rate
        to the guide unless you have set the rate yourself.
      </p>
    </>
  )
}
