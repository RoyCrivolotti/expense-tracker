import { ExpandIcon } from '../../../../icons'
import goalsStyles from '../../goals.module.css'
import styles from './HeroChartSheet.module.css'

/** The hero card's title, with the button that opens the full-screen chart at its end. */
export function HeroTitleRow({ onOpen }: { onOpen: () => void }) {
  return (
    <div className={styles.titleRow}>
      <h3 className={goalsStyles.chartTitle}>Invested portfolio projection</h3>
      <button type="button" className={styles.open} aria-label="Open the chart full screen" aria-haspopup="dialog" onClick={onOpen}>
        <ExpandIcon aria-hidden="true" />
      </button>
    </div>
  )
}
