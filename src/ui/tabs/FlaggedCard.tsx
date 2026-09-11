import type { Transaction } from '../../types'
import type { ExpenseModel } from '../useExpenseData'
import { groupTransactionsByFlag, type FlagGroup } from '../../domain/engine/flagGroups'
import { Card, SectionTitle } from '../components/primitives'
import { Money } from '../components/Money'
import { TransactionList } from '../components/TransactionList'
import { FlagGlyph } from '../components/FlagGlyph'
import styles from './FlaggedCard.module.css'

/** Enough to recognise the group; the full set lives one click away in the list. */
const PREVIEW_LIMIT = 5

interface Props {
  model: ExpenseModel
  onFilterByFlag: (flagId: number) => void
  onManage: () => void
  onSelect?: ((txn: Transaction) => void) | undefined
}

function FlagGroupSection({
  group,
  model,
  onFilterByFlag,
  onSelect,
}: {
  group: FlagGroup
  model: ExpenseModel
  onFilterByFlag: (flagId: number) => void
  onSelect?: ((txn: Transaction) => void) | undefined
}) {
  const preview = group.transactions.slice(0, PREVIEW_LIMIT)
  const hidden = group.count - preview.length
  return (
    <details className={styles.group}>
      <summary className={styles.summary}>
        <FlagGlyph flag={group.flag} className={styles.summaryGlyph} />
        <span className={styles.summaryBody}>
          <span className={styles.summaryName}>{group.flag.name}</span>
          {group.flag.description ? (
            <span className={styles.summaryDesc}>{group.flag.description}</span>
          ) : null}
        </span>
        <span className={styles.summaryStats}>
          <span className={styles.count}>
            {group.count} item{group.count === 1 ? '' : 's'}
          </span>
          <Money cents={group.totalCents} className={styles.total} />
        </span>
      </summary>
      <div className={styles.body}>
        <TransactionList
          rows={preview.map((txn) => ({ kind: 'transaction' as const, txn }))}
          lookup={model.lookup}
          flat
          showDate
          {...(onSelect ? { onSelect } : {})}
        />
        <button
          type="button"
          className={styles.filterBtn}
          onClick={() => onFilterByFlag(group.flag.id)}
        >
          {hidden > 0 ? `See all ${group.count} in the list` : 'Show these in the list'}
        </button>
      </div>
    </details>
  )
}

/**
 * Outstanding flagged work, pinned above the month's transactions.
 *
 * Scoped to the whole dataset rather than the selected month on purpose: a flag
 * tracks something that outlives a budget month ("what have I not claimed back
 * yet?"), so a month-scoped total would answer the wrong question. The list
 * below stays month-scoped as before, and flagged rows still appear there —
 * this is a summary, not a second home for them.
 */
export function FlaggedCard({ model, onFilterByFlag, onManage, onSelect }: Props) {
  const groups = groupTransactionsByFlag(model.dataset.transactions, model.dataset.flags)
  if (groups.length === 0) return null

  return (
    <>
      <SectionTitle
        action={
          <button type="button" className={styles.manageBtn} onClick={onManage}>
            Manage
          </button>
        }
      >
        Flagged
      </SectionTitle>
      <Card className={styles.card}>
        {groups.map((group) => (
          <FlagGroupSection
            key={group.flag.id}
            group={group}
            model={model}
            onFilterByFlag={onFilterByFlag}
            {...(onSelect ? { onSelect } : {})}
          />
        ))}
      </Card>
    </>
  )
}
