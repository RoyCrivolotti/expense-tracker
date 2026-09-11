import type { Transaction } from '../../types'
import { fullMonthLabel, shortMonthYearLabel } from '../../engine'
import { STATUS_LABEL, shortDayLabel, type Lookup } from '../format'
import { Money } from './Money'
import { Pill } from './primitives'
import { CategoryIcon } from './CategoryIcon'
import { FlagGlyph } from './FlagGlyph'
import styles from './TransactionList.module.css'

function installmentMeta(txn: Transaction, lookup: Lookup): string | null {
  if (txn.planId == null || txn.installmentIndex == null) return null
  const plan = lookup.installmentPlan(txn.planId)
  return plan ? `Payment ${txn.installmentIndex}/${plan.totalCount}` : null
}

function StatusPill({ status }: { status: Transaction['status'] }) {
  if (status === 'forecast') return <Pill tone="warning">{STATUS_LABEL.forecast}</Pill>
  if (status === 'cancelled') return <Pill>{STATUS_LABEL.cancelled}</Pill>
  return null
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
  // Undefined when the flag was deleted in another tab, or when this row came
  // from a stale offline snapshot — render nothing rather than a broken chip.
  const flag = txn.flagId != null ? lookup.flag(txn.flagId) : undefined
  const installmentLabel = installmentMeta(txn, lookup)
  const metaParts = [
    ...(showDate ? [shortDayLabel(txn.date)] : []),
    ...(installmentLabel ? [installmentLabel] : []),
    lookup.categoryName(txn.categoryId),
    lookup.accountName(txn.accountId),
  ]
  return (
    <>
      <CategoryIcon icon={cat?.icon} name={cat?.name ?? '?'} className={styles.catIcon} />
      <span className={styles.body}>
        <span className={styles.desc}>
          {flag ? <FlagGlyph flag={flag} /> : null}
          {txn.description || lookup.categoryName(txn.categoryId)}
        </span>
        <span className={styles.meta}>{metaParts.join(' · ')}</span>
      </span>
      <span className={styles.amountRail}>
        <Money cents={txn.amountCents} type={txn.type} className={styles.amount} />
        <span className={styles.railMeta}>
          <StatusPill status={txn.status} />
          <Pill title={`Budget month: ${fullMonthLabel(txn.budgetMonth)}`}>
            {shortMonthYearLabel(txn.budgetMonth)}
          </Pill>
        </span>
      </span>
    </>
  )
}
