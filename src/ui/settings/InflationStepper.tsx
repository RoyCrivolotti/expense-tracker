import { INFLATION_MAX, INFLATION_MIN } from '../../engine'
import type { ExpenseSettings } from '../../types'
import { PercentStepper } from '../components/PercentStepper'
import { useSavedInflation } from '../hooks/useSavedInflation'
import tabStyles from '../tabs/tabs.module.css'
import styles from './InflationStepper.module.css'

interface Props {
  settings: ExpenseSettings
  onChange: (patch: Partial<ExpenseSettings>) => void | Promise<void>
}

/**
 * The control for the owner's assumed inflation, wherever it is offered: Setup, and the
 * Goals chart beside the view it changes. Both edit the one saved setting, so the rate on
 * the chart and the rate every status figure uses cannot differ.
 */
export function InflationStepper({ settings, onChange }: Props) {
  const { draft, error, step } = useSavedInflation(settings.assumedInflation, onChange)
  return (
    <div className={styles.field}>
      <PercentStepper
        value={draft}
        onChange={step}
        min={INFLATION_MIN}
        max={INFLATION_MAX}
        ariaLabel="Assumed inflation"
      />
      {error ? (
        <p className={tabStyles.settingError} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
