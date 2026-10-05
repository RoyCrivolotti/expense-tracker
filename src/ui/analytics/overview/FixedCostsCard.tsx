import type { FixedCostItem } from '../../../engine'
import { formatCentsCompact, shortMonthYearLabel } from '../../../engine'
import { useMoneyFormat } from '../../hooks/moneyFormatContext'
import { Card } from '../../components/primitives'
import styles from './overview.module.css'

const RHYTHM = { monthly: 'monthly', quarterly: 'every 3 months', yearly: 'yearly' } as const

function detailOf(item: FixedCostItem): string {
  if (item.kind === 'instalment') {
    return item.payment ? `instalment ${item.payment.index} of ${item.payment.total}` : 'instalment plan'
  }
  return `${RHYTHM[item.frequency]}, last charged ${shortMonthYearLabel(item.lastMonth!)}`
}

/**
 * The charges counted as fixed, so the split between fixed and flexible never has to be taken
 * on faith. Closed by default: it is a reference, not a headline.
 */
export function FixedCostsCard({ items }: { items: FixedCostItem[] }) {
  const format = useMoneyFormat()
  if (items.length === 0) return null
  return (
    <Card>
      <details className={styles.fixedDetails}>
        <summary className={styles.fixedSummary}>Detected fixed costs ({items.length})</summary>
        <p className={styles.cardSub}>
          What the app counts as fixed. A charge missing here has not repeated 3 times at a regular
          rhythm yet. The ones marked as in the budget are taken out of this month&apos;s flexible
          pace budget.
        </p>
        <div className={styles.fixedList}>
          {items.map((item) => (
            <div key={item.key} className={styles.fixedRow}>
              <span className={styles.fixedName}>
                {item.name}
                <small className={styles.fixedDetail}>{detailOf(item)}</small>
              </span>
              {item.inPaceBudget && <span className={styles.fixedTag}>in the budget</span>}
              <span className={styles.kvValue}>{formatCentsCompact(item.amountCents, format)}</span>
            </div>
          ))}
        </div>
      </details>
    </Card>
  )
}
