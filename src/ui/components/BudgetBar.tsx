import { Money } from './Money'
import { Pill } from './primitives'
import type { BudgetStatus } from '../../engine/categoryBudget'
import { CategoryIcon } from '../components/CategoryIcon'
import styles from './BudgetBar.module.css'

const TONE: Record<BudgetStatus, 'neutral' | 'success' | 'warning' | 'danger'> = {
  credit: 'neutral',
  under: 'success',
  warning: 'warning',
  over: 'danger',
}

interface BudgetBarProps {
  name: string
  icon?: string | undefined
  actualCents: number
  budgetCents: number
  ratio: number
  status: BudgetStatus
  total?: boolean | undefined
}

export function BudgetBar({
  name,
  icon,
  actualCents,
  budgetCents,
  ratio,
  status,
  total,
}: BudgetBarProps) {
  // A credit has no meaningful bar length — nothing was spent on balance, so the
  // track stays empty rather than rendering Math.max(2, <negative>) as a stub.
  const pct = status === 'credit' ? 0 : Math.max(2, Math.min(100, Math.round(ratio * 100)))
  return (
    <div className={`${styles.row}${total ? ` ${styles.totalRow}` : ''}`}>
      <div className={styles.head}>
        <span className={styles.name}>
          {!total && <CategoryIcon icon={icon} name={name} />} {name}
        </span>
        <span className={styles.values}>
          {/* Money prints |cents| unless told otherwise, so a credited category
              read "200,00 € / 120,00 €" — indistinguishable from being 67% over
              — while the bar sat empty and the pill said the opposite. Only the
              negative case takes a sign; spending must not render as "+133,55 €". */}
          <Money cents={actualCents} signed={actualCents < 0} />{' '}
          <span className={styles.muted}>
            / <Money cents={budgetCents} />
          </span>
        </span>
      </div>
      <div className={styles.track}>
        <div
          className={`${styles.fill} ${styles[status]}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {budgetCents > 0 && (
        <div className={styles.footer}>
          <Pill
            tone={TONE[status]}
            title={
              status === 'credit'
                ? 'More came back into this category than went out this month'
                : undefined
            }
          >
            {status === 'credit' ? 'Money back' : `${Math.round(ratio * 100)}%`}
          </Pill>
        </div>
      )}
    </div>
  )
}
