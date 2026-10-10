import { MARKET_VOLATILITY_MAX, MARKET_VOLATILITY_MIN, MARKET_VOLATILITY_PRESETS, formatPercent } from '../../engine'
import type { ExpenseSettings } from '../../types'
import { Card } from '../components/primitives'
import { PercentStepper } from '../components/PercentStepper'
import { useMoneyFormat } from '../hooks/moneyFormatContext'
import { useSavedSetting } from '../hooks/useSavedSetting'
import styles from '../tabs/tabs.module.css'
import goalStyles from '../tabs/goals/goals.module.css'

interface Props {
  settings: ExpenseSettings
  onChange: (patch: Partial<ExpenseSettings>) => void | Promise<void>
}

/** Two bounces this close are the same one: a preset is a constant, and a stepper value is a fraction typed in. */
const SAME = 1e-9

/**
 * How far a year's return strays from the typical one, for the card that replays the plan with random
 * returns. It is the owner's setting, volatility only: a plan's return stays the typical growth. Three
 * usual choices sit beside the stepper, and the one that is saved is marked. It saves the way the assumed
 * inflation does: the value shown is the one just clicked, quick steps send only the newest, and a save that
 * fails puts the saved value back and says so.
 */
export function MarketBounceSetting({ settings, onChange }: Props) {
  const format = useMoneyFormat()
  const { draft, error, step } = useSavedSetting('marketVolatility', settings.marketVolatility, onChange)

  return (
    <Card>
      <h3 className={goalStyles.sectionTitle}>Market bounce</h3>
      <div className={styles.settingGroup}>
        <div className={styles.defaultAccountField}>
          <span className={styles.defaultAccountLabel}>Yearly bounce of the market</span>
          <PercentStepper
            value={draft}
            onChange={step}
            min={MARKET_VOLATILITY_MIN}
            max={MARKET_VOLATILITY_MAX}
            ariaLabel="Market bounce"
          />
        </div>
        <div className={styles.presetRow} role="group" aria-label="Usual bounce">
          {MARKET_VOLATILITY_PRESETS.map((preset) => {
            const chosen = Math.abs(draft - preset.value) < SAME
            return (
              <button
                key={preset.value}
                type="button"
                className={`${styles.presetChip} ${chosen ? styles.presetChipOn : ''}`}
                aria-pressed={chosen}
                onClick={() => step(preset.value)}
              >
                {preset.label} {formatPercent(preset.value, format, 0)}
              </button>
            )
          })}
        </div>
        {error ? (
          <p className={styles.settingError} role="alert">
            {error}
          </p>
        ) : null}
        <p className={styles.settingHint}>
          How far a single year&apos;s return strays from the typical one. About two years in three land within this many
          points either side of it, and one in three further out. The return you enter on a plan stays the typical
          growth: this only sets how much luck can move it. A portfolio with more bonds bounces less but also grows
          less, so lower the return on your plan too.
        </p>
      </div>
    </Card>
  )
}
