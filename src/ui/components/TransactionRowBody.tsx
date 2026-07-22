import type { Transaction } from '../../types'
import { STATUS_LABEL, shortDayLabel, type Lookup } from '../format'
import { Money } from './Money'
import { Pill } from './primitives'
import { CategoryIcon } from './CategoryIcon'
import styles from './TransactionList.module.css'

function installmentMeta(txn: Transaction, lookup: Lookup): string | null {
  if (txn.planId == null || txn.installmentIndex == null) return null
  const plan = lookup.installmentPlan(txn.planId)
  return plan ? `Payment ${txn.installmentIndex}/${plan.totalCount}` : null
}

export function TransactionRowBody({
  txn,
  lookup,
  showDate = false,
}: {
  txn: Transaction
  lookup: Lookup
  showDate?: boolean
}) {
  const cat = lookup.category(txn.categoryId)
  const installmentLabel = installmentMeta(txn, lookup)
  const metaParts = [
    ...(showDate ? [shortDayLabel(txn.date)] : []),
    ...(installmentLabel ? [installmentLabel] : []),
    lookup.categoryName(txn.categoryId),
    lookup.accountName(txn.accountId),
  ]
  const statusPill =
    txn.status === 'forecast' ? (
      <Pill tone="warning">{STATUS_LABEL.forecast}</Pill>
    ) : txn.status === 'cancelled' ? (
      <Pill>{STATUS_LABEL.cancelled}</Pill>
    ) : null
  return (
    <>
      <CategoryIcon icon={cat?.icon} name={cat?.name ?? '?'} className={styles.catIcon} />
      <span className={styles.body}>
        <span className={styles.desc}>
          {txn.description || lookup.categoryName(txn.categoryId)}
        </span>
        <span className={styles.metaRow}>
          <span className={styles.meta}>{metaParts.join(' · ')}</span>
          {statusPill}
        </span>
      </span>
      <Money cents={txn.amountCents} type={txn.type} className={styles.amount} />
    </>
  )
}
