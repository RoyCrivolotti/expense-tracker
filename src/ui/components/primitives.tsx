import type { ReactNode } from 'react'
import { Money } from './Money'
import type { TxnType } from '../../types'
import styles from './primitives.module.css'

export function Card({
  children,
  className,
}: {
  children: ReactNode
  className?: string | undefined
}) {
  return <section className={`${styles.card} ${className ?? ''}`}>{children}</section>
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className={styles.sectionTitle}>
      <h2>{children}</h2>
      {action}
    </div>
  )
}

interface KpiProps {
  label: string
  cents: number
  type?: TxnType | undefined
  signed?: boolean | undefined
  hint?: string | undefined
}

export function Kpi({ label, cents, type, signed, hint }: KpiProps) {
  return (
    <div className={styles.kpi}>
      <span className={styles.kpiLabel}>{label}</span>
      <Money cents={cents} type={type} signed={signed} className={styles.kpiValue} />
      {hint && <span className={styles.kpiHint}>{hint}</span>}
    </div>
  )
}

export function Pill({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: 'neutral' | 'success' | 'warning' | 'danger'
}) {
  return <span className={`${styles.pill} ${styles[tone]}`}>{children}</span>
}

export function EmptyState({
  children,
  actionLabel,
  onAction,
}: {
  children: ReactNode
  actionLabel?: string | undefined
  onAction?: (() => void) | undefined
}) {
  return (
    <div className={styles.emptyWrap}>
      <span className={styles.emptyIcon} aria-hidden>
        ◇
      </span>
      <p className={styles.emptyMessage}>{children}</p>
      {actionLabel && onAction ? (
        <button type="button" className={styles.emptyAction} onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  )
}
