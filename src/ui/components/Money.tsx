import { formatCents } from '../../engine/money'
import type { TxnType } from '../../types'
import styles from './Money.module.css'

const COLOR_BY_TYPE: Record<TxnType, string> = {
  income: 'var(--exp-income)',
  refund: 'var(--exp-refund)',
  investment: 'var(--exp-investment)',
  expense: 'var(--color-text)',
}

interface MoneyProps {
  cents: number
  /** Colour + sign convention by transaction type. */
  type?: TxnType | undefined
  /** Force a leading sign even for neutral values. */
  signed?: boolean | undefined
  className?: string | undefined
}

function signFor(cents: number, type?: TxnType, signed?: boolean): string {
  if (cents === 0) return ''
  if (type === 'income') return '+'
  if (type === 'expense' || type === 'investment') return '−'
  if (type === 'refund') return cents >= 0 ? '+' : '−'
  if (signed) return cents >= 0 ? '+' : '−'
  return ''
}

export function Money({ cents, type, signed, className }: MoneyProps) {
  const color = type ? COLOR_BY_TYPE[type] : undefined
  const magnitude = formatCents(Math.abs(cents))
  return (
    <span className={`${styles.money} ${className ?? ''}`} style={color ? { color } : undefined}>
      {signFor(cents, type, signed)}
      {magnitude}
    </span>
  )
}
