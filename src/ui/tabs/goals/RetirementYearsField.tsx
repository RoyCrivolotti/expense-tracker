import type { NewGoalScenario } from '../../../data/dataSource'
import { RETIREMENT_YEARS_MAX, fiPatchForYears, recommendedWithdrawalRate } from '../../../engine'
import { useMoneyFormat } from '../../hooks/moneyFormatContext'
import { NumberField } from './goalControlFields'
import { plainPercent } from './retirementGuide'
import styles from './goals.module.css'

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
        How long the money must last. {draft.retirementYears} years points to{' '}
        {plainPercent(recommendedWithdrawalRate(draft.retirementYears), format)}, a rule of thumb, not a promise.
      </p>
    </>
  )
}
