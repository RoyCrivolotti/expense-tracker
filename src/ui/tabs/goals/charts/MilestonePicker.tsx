import type { MoneyFormat } from '../../../../engine'
import { formatMoneyShort } from '../chartTheme'
import styles from '../goals.module.css'
import { milestoneNote, type PickRow } from './milestonePick'

/**
 * The milestones as chips under the chart, one of which can be picked to stand out: the chart draws its line bright and
 * dots where each path reaches it, and the list here says when. With none picked the chart has no labels at all.
 */
export function MilestonePicker({
  amounts,
  picked,
  onPick,
  rows,
  nominalMode,
  format,
}: {
  amounts: readonly number[]
  picked: number | null
  onPick: (cents: number | null) => void
  rows: readonly PickRow[]
  nominalMode: boolean
  format: MoneyFormat
}) {
  if (amounts.length === 0) return null
  return (
    <div className={styles.milestonePicker}>
      <p className={`${styles.chartHint} ${styles.chartCaption}`}>{milestoneNote(nominalMode, format)}</p>
      <div className={styles.milestoneChips} role="group" aria-label="Milestones">
        {amounts.map((cents) => {
          const on = cents === picked
          return (
            <button
              key={cents}
              type="button"
              aria-pressed={on}
              className={on ? `${styles.chip} ${styles.chipActive}` : styles.chip}
              onClick={() => onPick(on ? null : cents)}
            >
              {formatMoneyShort(cents, format)}
            </button>
          )
        })}
      </div>
      {picked !== null && rows.length > 0 ? (
        <ul className={styles.milestoneRows} aria-label={`When each path reaches ${formatMoneyShort(picked, format)}`}>
          {rows.map((row) => (
            <li key={row.id}>
              <span className={styles.milestoneSwatch} style={{ background: row.color }} aria-hidden />
              <span className={styles.milestoneRowName}>{row.name}</span>
              <span>{row.text}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
