import type { KeyboardEvent } from 'react'
import { Money } from './Money'
import { Pill } from './primitives'
import type { BudgetStatus } from '../../engine/categoryBudget'
import { CategoryIcon } from '../components/CategoryIcon'
import styles from './BudgetBar.module.css'

const TONE: Record<BudgetStatus, 'success' | 'warning' | 'danger'> = {
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
  categoryId?: number | undefined
  onSelect?: ((categoryId: number) => void) | undefined
}

export function BudgetBar({
  name,
  icon,
  actualCents,
  budgetCents,
  ratio,
  status,
  categoryId,
  onSelect,
}: BudgetBarProps) {
  const pct = Math.min(100, Math.round(ratio * 100))
  const tappable = categoryId != null && onSelect != null
  const handleClick = tappable ? () => onSelect(categoryId) : undefined
  const handleKey = tappable
    ? (e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect(categoryId)
        }
      }
    : undefined
  return (
    <div
      className={`${styles.row}${tappable ? ` ${styles.tappable}` : ''}`}
      {...(tappable
        ? {
            role: 'button' as const,
            tabIndex: 0,
            onClick: handleClick,
            onKeyDown: handleKey,
          }
        : {})}
    >
      <div className={styles.head}>
        <span className={styles.name}>
          <CategoryIcon icon={icon} name={name} /> {name}
        </span>
        <span className={styles.values}>
          <Money cents={actualCents} />{' '}
          <span className={styles.muted}>
            / <Money cents={budgetCents} />
          </span>
        </span>
      </div>
      <div className={styles.track}>
        <div
          className={`${styles.fill} ${styles[status]}`}
          style={{ width: `${Math.max(2, pct)}%` }}
        />
      </div>
      {budgetCents > 0 && (
        <div className={styles.footer}>
          <Pill tone={TONE[status]}>{Math.round(ratio * 100)}%</Pill>
        </div>
      )}
    </div>
  )
}
