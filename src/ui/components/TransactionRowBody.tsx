import type { Transaction } from '../../types'
import { fullMonthLabel, shortMonthYearLabel } from '../../engine'
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

function StatusPill({ status }: { status: Transaction['status'] }) {
  if (status === 'forecast') return <Pill tone="warning">{STATUS_LABEL.forecast}</Pill>
  if (status === 'cancelled') return <Pill>{STATUS_LABEL.cancelled}</Pill>
  return null
}

/**
 * Budget month, shown when the list mixes months or when this row is charged to
 * a month other than the one its date falls in (a late-month rollover).
 */
function BudgetMonthPill({ txn, force }: { txn: Transaction; force: boolean }) {
  if (!force && txn.budgetMonth === txn.date.slice(0, 7)) return null
  return (
    <Pill title={`Budget month: ${fullMonthLabel(txn.budgetMonth)}`}>
      {shortMonthYearLabel(txn.budgetMonth)}
    </Pill>
  )
}

export function TransactionRowBody({
  txn,
  lookup,
  showDate = false,
  showBudgetMonth = false,
}: {
  txn: Transaction
  lookup: Lookup
  showDate?: boolean
  /** Set when the surrounding list spans several budget months, so the pill disambiguates. */
  showBudgetMonth?: boolean
}) {
  const cat = lookup.category(txn.categoryId)
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
          {txn.description || lookup.categoryName(txn.categoryId)}
        </span>
        <span className={styles.metaRow}>
          <span className={styles.meta}>{metaParts.join(' · ')}</span>
          <BudgetMonthPill txn={txn} force={showBudgetMonth} />
          <StatusPill status={txn.status} />
        </span>
      </span>
      <Money cents={txn.amountCents} type={txn.type} className={styles.amount} />
    </>
  )
}
