import { INFLATION_MAX, INFLATION_MIN, formatPercent } from '../../../engine'
import { PercentStepper } from '../../components/PercentStepper'
import { useMoneyFormat } from '../../hooks/moneyFormatContext'
import styles from './goals.module.css'
import progressStyles from './progress.module.css'

interface Props {
  /** The owner's saved assumed inflation, which everything but this chart keeps using. */
  saved: number
  /** The rate being tried on the chart, or null while it follows the saved one. */
  preview: number | null
  onPreview: (rate: number | null) => void
  /** Takes the reader to where the rate is set; absent when they cannot change it. */
  onOpenSetup: (() => void) | undefined
}

/**
 * A way to look at the Nominal view under another inflation without touching the setting.
 * It only re-inflates the plan line and its band drawn on the chart. The status, Progress,
 * the comparison table and the dashboard read the saved rate, so trying a rate here can
 * never make them disagree with each other; the note says so and points to Setup.
 */
export function NominalPreview({ saved, preview, onPreview, onOpenSetup }: Props) {
  const format = useMoneyFormat()
  const rate = preview ?? saved
  return (
    <>
      <div className={progressStyles.inflationRow}>
        <span className={progressStyles.inflationLabel}>Preview inflation</span>
        <PercentStepper
          value={rate}
          onChange={onPreview}
          min={INFLATION_MIN}
          max={INFLATION_MAX}
          ariaLabel="Preview inflation"
        />
        {rate !== saved ? (
          <button
            type="button"
            className={`${styles.btnText} ${progressStyles.inflationReset}`}
            onClick={() => onPreview(null)}
          >
            Reset
          </button>
        ) : null}
      </div>
      <p className={styles.chartHint}>
        The summary, the FI target and the milestones stay in today&apos;s money, so the target lines
        are only drawn in Purchasing power. The preview is not saved: the rest of Goals uses the
        saved {formatPercent(saved, format)}
        {onOpenSetup ? (
          <>
            , which you change in Setup.{' '}
            <button type="button" className={styles.btnText} onClick={onOpenSetup}>
              Open Setup
            </button>
          </>
        ) : (
          '.'
        )}
      </p>
    </>
  )
}
