import type { Label, Transaction } from '../../types'
import { fullMonthLabel, shortMonthYearLabel } from '../../engine'
import { STATUS_LABEL, shortDayLabel, type Lookup } from '../format'
import { Money } from './Money'
import { Pill } from './primitives'
import { CategoryIcon } from './CategoryIcon'
import { FlagGlyph } from './FlagGlyph'
import { LabelChip, LabelChipOverflow } from './LabelChip'
import { PaperclipIcon } from '../icons'
import styles from './TransactionList.module.css'

/** Chips beyond this count collapse into a single "+N" pill, so a heavily
 *  labelled transaction cannot push a dense list's row height around. */
const VISIBLE_LABEL_LIMIT = 2

function LabelRow({ labelIds, lookup }: { labelIds: number[]; lookup: Lookup }) {
  if (labelIds.length === 0) return null
  // Undefined when a label was deleted in another tab, or the row came from a
  // stale offline snapshot — dropped rather than rendered as a broken chip,
  // the same tolerance FlagGlyph already has for a missing flag.
  const resolved = labelIds
    .map((id) => lookup.label(id))
    .filter((l): l is Label => l != null)
  if (resolved.length === 0) return null
  const visible = resolved.slice(0, VISIBLE_LABEL_LIMIT)
  const hidden = resolved.length - visible.length
  return (
    <span className={styles.labelRow}>
      {visible.map((label) => (
        <LabelChip key={label.id} label={label} />
      ))}
      {hidden > 0 ? <LabelChipOverflow count={hidden} /> : null}
    </span>
  )
}

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

function ReceiptMark({ count }: { count: number }) {
  if (count === 0) return null
  const label = `${count} receipt${count === 1 ? '' : 's'}`
  return (
    <span className={styles.receiptMark} role="img" aria-label={label} title={label}>
      <PaperclipIcon />
    </span>
  )
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
          <ReceiptMark count={lookup.attachments(txn.id).length} />
        </span>
        <span className={styles.meta}>{metaParts.join(' · ')}</span>
        <LabelRow labelIds={txn.labelIds ?? []} lookup={lookup} />
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
