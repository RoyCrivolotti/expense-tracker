import type { Transaction } from '../../types'
import type { ExpenseModel } from '../useExpenseData'
import { groupTransactionsByFlag, summarizeFlagGroups, type FlagGroup } from '../../domain/engine/flagGroups'
import { Card, SectionTitle } from '../components/primitives'
import { FlaggedTip } from '../tips/TransactionsTips'
import { Money } from '../components/Money'
import { FlagGroupSection } from './FlagGroupSection'
import styles from './FlaggedCard.module.css'

interface Props {
  model: ExpenseModel
  onFilterByFlag: (flagId: number) => void
  /**
   * True while rows are being selected. Jumping to a flag rewrites the list's filters,
   * which selection otherwise locks, and leaves the user unable to put them back.
   */
  filterLocked?: boolean
  /** Pressing the locked jump: say why nothing happens. */
  onLockedFilterPress?: (() => void) | undefined
  onOpenReport: (flagId: number) => void
  onSettle: (group: FlagGroup) => void
  onManage: () => void
  /** Absent until at least one reimbursement has been recorded. */
  onViewPast?: (() => void) | undefined
  onSelect?: ((txn: Transaction) => void) | undefined
  /** Clears one transaction's flag without opening the editor. */
  onClearFlag?: ((txn: Transaction) => void) | undefined
  /** Clears every transaction in a group's flag at once, behind a confirmation. */
  onClearGroup?: ((group: FlagGroup) => void) | undefined
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
  filterLocked = false,
  onLockedFilterPress,
  onOpenReport,
  onSettle,
  onManage,
  onViewPast,
  onSelect,
  onClearFlag,
  onClearGroup,
}: Props) {
  const groups = groupTransactionsByFlag(model.dataset.transactions, model.dataset.flags)
  // The line is mounted before there is anything flagged, in the same place, so it folds open when the first flag is used.
  if (groups.length === 0)
    return (
      <>
        {null}
        <FlaggedTip present={false} />
      </>
    )
  const total = summarizeFlagGroups(groups)

  return (
    <>
      <SectionTitle>Flagged</SectionTitle>
      <FlaggedTip present />
      <Card className={styles.card}>
        {/*
          Collapsed by default: this card sits above the month's transactions on
          a tab that already carries Installments and Upcoming, and expanded it
          pushed the first transaction off a 375px screen entirely. Collapsed it
          costs one row and still answers the question the feature exists for.
        */}
        <details className={styles.card__root}>
          <FlaggedRollup total={total} flagCount={groups.length} />
          <div className={styles.groups}>
            {groups.map((group) => (
              <FlagGroupSection
                key={group.flag.id}
                group={group}
                model={model}
                onFilterByFlag={onFilterByFlag}
                filterLocked={filterLocked}
                onLockedFilterPress={onLockedFilterPress}
                onOpenReport={onOpenReport}
                onSettle={onSettle}
                {...(onSelect ? { onSelect } : {})}
                {...(onClearFlag ? { onClearFlag } : {})}
                {...(onClearGroup ? { onClearGroup } : {})}
              />
            ))}
            <FlaggedCardActions onManage={onManage} onViewPast={onViewPast} />
          </div>
        </details>
      </Card>
    </>
  )
}

function FlaggedRollup({ total, flagCount }: { total: ReturnType<typeof summarizeFlagGroups>; flagCount: number }) {
  return (
    <summary className={styles.rollup}>
      <span className={styles.rollupBody}>
        <span className={styles.rollupCount}>
          {total.count} item{total.count === 1 ? '' : 's'} across {flagCount} flag
          {flagCount === 1 ? '' : 's'}
        </span>
        {/* Every sibling card on this screen is month-scoped; this one is
                  not, and nothing else on it would say so. */}
        <span className={styles.rollupScope}>All months, not just this one</span>
      </span>
      <Money cents={total.totalCents} signed={total.totalCents < 0} className={styles.rollupTotal} />
    </summary>
  )
}

function FlaggedCardActions({ onManage, onViewPast }: { onManage: () => void; onViewPast?: (() => void) | undefined }) {
  return (
    <div className={styles.cardActions}>
      <button type="button" className={styles.manageBtn} onClick={onManage}>
        Manage flags
      </button>
      {onViewPast ? (
        <button type="button" className={styles.manageBtn} onClick={onViewPast}>
          Past reports
        </button>
      ) : null}
    </div>
  )
}
