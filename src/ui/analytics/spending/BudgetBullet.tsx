import type { BulletModel } from './budgetBulletModel'
import styles from './spending.module.css'

const STATE_CLASS = { ok: 'bulletOk', warn: 'bulletWarn', over: 'bulletOver' } as const

/** A bullet bar: spend against budget, hatched where the statement is unpaid. */
export function BudgetBullet({ model }: { model: BulletModel }) {
  return (
    <div className={styles.bullet} aria-hidden>
      <div
        className={`${styles.bulletFill} ${styles[STATE_CLASS[model.state]]}`}
        style={{ width: `${model.paidPct}%` }}
      />
      {model.unpaidPct > 0 && (
        <div
          className={`${styles.bulletUnpaid} ${styles[STATE_CLASS[model.state]]}`}
          style={{ left: `${model.paidPct}%`, width: `${model.unpaidPct}%` }}
        />
      )}
      {model.budgetTickPct !== null && (
        <div className={styles.bulletBudgetTick} style={{ left: `${model.budgetTickPct}%` }} />
      )}
      {model.paceTickPct !== null && (
        <div className={styles.bulletPaceTick} style={{ left: `${model.paceTickPct}%` }} />
      )}
    </div>
  )
}
