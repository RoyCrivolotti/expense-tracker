import type { SpendingGroupRow } from '../../../engine'
import { formatCentsCompact } from '../../../engine'
import { useMoneyFormat } from '../../hooks/moneyFormatContext'
import { ChangeChip } from '../shared/ChangeChip'
import { Sparkline } from '../shared/Sparkline'
import { BudgetBullet } from './BudgetBullet'
import { buildBulletModel } from './budgetBulletModel'
import styles from './spending.module.css'

interface Props {
  row: SpendingGroupRow
  selected: boolean
  onSelect: (key: string) => void
}

/** One ranked row: name, bullet or sparkline, amount, and the move vs the 3-month average. */
export function SpendingRow({ row, selected, onSelect }: Props) {
  const format = useMoneyFormat()
  const bullet = buildBulletModel(row)
  return (
    <button
      type="button"
      className={`${styles.row} tapActive`}
      aria-expanded={selected}
      onClick={() => onSelect(row.key)}
    >
      <span className={styles.rowName}>
        {row.color && <span className={styles.labelDot} style={{ background: row.color }} />}
        <span className={styles.rowTitle}>{row.name}</span>
        <small className={styles.rowCount}>
          {row.txnCount} item{row.txnCount === 1 ? '' : 's'}
        </small>
      </span>
      <span className={styles.rowMiddle}>
        {bullet ? (
          <BudgetBullet model={bullet} />
        ) : (
          <Sparkline
            values={row.spark.map((s) => s.cents)}
            label={`${row.name} over the last ${row.spark.length} months`}
          />
        )}
      </span>
      <span className={styles.rowAmount}>
        {formatCentsCompact(row.currentCents, format)}
        <span className={styles.rowChip}>
          <ChangeChip value={row.currentCents} baseline={row.avg3Cents} upGood={false} />
        </span>
      </span>
    </button>
  )
}
