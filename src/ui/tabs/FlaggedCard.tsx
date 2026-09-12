import type { Transaction } from '../../types'
import type { ExpenseModel } from '../useExpenseData'
import {
  groupTransactionsByFlag,
  summarizeFlagGroups,
  type FlagGroup,
} from '../../domain/engine/flagGroups'
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
  onOpenReport: (flagId: number) => void
  onSettle: (group: FlagGroup) => void
  onManage: () => void
  onSelect?: ((txn: Transaction) => void) | undefined
}

function FlagGroupSection({
  group,
  model,
  onFilterByFlag,
  onOpenReport,
  onSettle,
  onSelect,
}: {
  group: FlagGroup
  model: ExpenseModel
  onFilterByFlag: (flagId: number) => void
  onOpenReport: (flagId: number) => void
  onSettle: (group: FlagGroup) => void
  onSelect?: ((txn: Transaction) => void) | undefined
}) {
  const preview = group.transactions.slice(0, PREVIEW_LIMIT)
  const hidden = group.count - preview.length
  return (
    <details className={styles.group}>
      <summary className={styles.summary}>
        <FlagGlyph flag={group.flag} className={styles.summaryGlyph} decorative />
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
        <div className={styles.groupActions}>
          <button
            type="button"
            className={styles.filterBtn}
            onClick={() => onFilterByFlag(group.flag.id)}
          >
            {hidden > 0 ? `See all ${group.count} in the list` : 'Show these in the list'}
          </button>
          <button
            type="button"
            className={styles.packBtn}
            onClick={() => onOpenReport(group.flag.id)}
          >
            Expense report
          </button>
          {/*
            Hidden once nothing is outstanding: the amount would prefill 0,00 €
            and the form rejects that, so the button would only ever fail.
          */}
          {group.totalCents > 0 ? (
            <button
              type="button"
              className={styles.settleBtn}
              onClick={() => onSettle(group)}
            >
              Record reimbursement
            </button>
          ) : null}
        </div>
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
export function FlaggedCard({
  model,
  onFilterByFlag,
  onOpenReport,
  onSettle,
  onManage,
  onSelect,
}: Props) {
  const groups = groupTransactionsByFlag(model.dataset.transactions, model.dataset.flags)
  if (groups.length === 0) return null
  const total = summarizeFlagGroups(groups)

  return (
    <>
      <SectionTitle>Flagged</SectionTitle>
      <Card className={styles.card}>
        {/*
          Collapsed by default: this card sits above the month's transactions on
          a tab that already carries Installments and Upcoming, and expanded it
          pushed the first transaction off a 375px screen entirely. Collapsed it
          costs one row and still answers the question the feature exists for.
        */}
        <details className={styles.card__root}>
          <summary className={styles.rollup}>
            <span className={styles.rollupBody}>
              <span className={styles.rollupCount}>
                {total.count} item{total.count === 1 ? '' : 's'} across {groups.length} flag
                {groups.length === 1 ? '' : 's'}
              </span>
              {/* Every sibling card on this screen is month-scoped; this one is
                  not, and nothing else on it would say so. */}
              <span className={styles.rollupScope}>All months, not just this one</span>
            </span>
            <Money cents={total.totalCents} className={styles.rollupTotal} />
          </summary>
          <div className={styles.groups}>
            {groups.map((group) => (
              <FlagGroupSection
                key={group.flag.id}
                group={group}
                model={model}
                onFilterByFlag={onFilterByFlag}
                onOpenReport={onOpenReport}
                onSettle={onSettle}
                {...(onSelect ? { onSelect } : {})}
              />
            ))}
            <button type="button" className={styles.manageBtn} onClick={onManage}>
              Manage flags
            </button>
          </div>
        </details>
      </Card>
    </>
  )
}
