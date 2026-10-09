import { INFLATION_MAX, INFLATION_MIN, formatPercent } from '../../../engine'
import { PercentStepper } from '../../components/PercentStepper'
import { useMoneyFormat } from '../../hooks/moneyFormatContext'
import { planMoneyLabel } from './planMoneyLabel'
import styles from './goals.module.css'
import progressStyles from './progress.module.css'

interface Props {
  /** The owner's saved assumed inflation, which everything but this chart keeps using. */
  saved: number
  /** The rate being tried on the chart, or null while it follows the saved one. */
  preview: number | null
  onPreview: (rate: number | null) => void
  /** Takes the reader to where the rate is set; absent when they cannot change it. */
  onOpenAssumptions: (() => void) | undefined
  /** The plan's start, which names the euros the net worth and the FI target stay in. */
  planStartDate: string | null | undefined
}

/**
 * A way to look at the Nominal view under another inflation without touching the setting.
 * The chart projects the plan and its band again at that rate and inflates them by it: the
 * monthly amount is euros as sent, so the plan itself depends on the rate, and the saved line
 * drawn higher would not be it. The status, Progress, the comparison table and the dashboard
 * read the saved rate, so trying a rate here can never make them disagree with each other;
 * the note says so and points to Assumptions.
 */
export function NominalPreview({ saved, preview, onPreview, onOpenAssumptions, planStartDate }: Props) {
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
        The net worth figure stays in {planMoneyLabel(planStartDate, format)}. Milestones are amounts on your account, so
        they stay put in this view, and the FI target is in {planMoneyLabel(planStartDate, format)}, so it rises with the
        inflation. The
        preview is not saved: the rest of Goals uses the saved {formatPercent(saved, format)}
        {onOpenAssumptions ? (
          <>
            , which you change in Assumptions.{' '}
            <button type="button" className={styles.btnText} onClick={onOpenAssumptions}>
              Open Assumptions
            </button>
          </>
        ) : (
          '.'
        )}
      </p>
    </>
  )
}
