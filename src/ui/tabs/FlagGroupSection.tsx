import type { Transaction } from '../../types'
import type { ExpenseModel } from '../useExpenseData'
import type { FlagGroup } from '../../domain/engine/flagGroups'
import { Money } from '../components/Money'
import { TransactionList } from '../components/TransactionList'
import { FlagGlyph } from '../components/FlagGlyph'
import styles from './FlaggedCard.module.css'

/** Enough to recognise the group; the full set lives one click away in the list. */
const PREVIEW_LIMIT = 5

function FlagGroupActions({
  group,
  onFilterByFlag,
  filterLocked,
  onLockedFilterPress,
  onOpenReport,
  onSettle,
  onClearGroup,
}: {
  group: FlagGroup
  onFilterByFlag: (flagId: number) => void
  filterLocked: boolean
  onLockedFilterPress?: (() => void) | undefined
  onOpenReport: (flagId: number) => void
  onSettle: (group: FlagGroup) => void
  onClearGroup?: ((group: FlagGroup) => void) | undefined
}) {
  return (
    <div className={styles.groupActions}>
      <div className={styles.actionsRow}>
        <button
          type="button"
          className={styles.filterBtn}
          onClick={filterLocked ? onLockedFilterPress : () => onFilterByFlag(group.flag.id)}
          {...(filterLocked ? { 'aria-disabled': true } : {})}
        >
          Filter by flag
        </button>
        {/* Only where somebody owes the money back. On a flag you keep just
                to find things later, an expense report is a document addressed to
                nobody for money that is not coming. */}
        {group.flag.reimbursable ? (
          <button type="button" className={styles.packBtn} onClick={() => onOpenReport(group.flag.id)}>
            Expense report
          </button>
        ) : null}
      </div>
      {/*
            Hidden once nothing is outstanding: the amount would prefill 0,00 €
            and the form rejects that, so the button would only ever fail. Its
            own row, half width and right-aligned under Expense report — the
            button it most often follows — rather than stretched or wrapped
            wherever flex happens to leave room for it.
          */}
      {group.flag.reimbursable && group.totalCents > 0 ? (
        <div className={styles.actionsRow}>
          <button type="button" className={styles.settleBtn} onClick={() => onSettle(group)}>
            Record reimbursement
          </button>
        </div>
      ) : null}
      {/* Every flag can be cleared this way, reimbursable or not — a flag is
              "needs attention", and this is how you say a group of them no
              longer does without reimbursing anything. Its own row: the two
              rows above already fill 375px between them. */}
      {onClearGroup ? (
        <div className={styles.actionsRow}>
          <button type="button" className={styles.clearAllBtn} onClick={() => onClearGroup(group)}>
            Clear all in this group
          </button>
        </div>
      ) : null}
    </div>
  )
}

export function FlagGroupSection({
  group,
  model,
  onFilterByFlag,
  filterLocked,
  onLockedFilterPress,
  onOpenReport,
  onSettle,
  onSelect,
  onClearFlag,
  onClearGroup,
}: {
  group: FlagGroup
  model: ExpenseModel
  onFilterByFlag: (flagId: number) => void
  filterLocked: boolean
  onLockedFilterPress?: (() => void) | undefined
  onOpenReport: (flagId: number) => void
  onSettle: (group: FlagGroup) => void
  onSelect?: ((txn: Transaction) => void) | undefined
  onClearFlag?: ((txn: Transaction) => void) | undefined
  onClearGroup?: ((group: FlagGroup) => void) | undefined
}) {
  return (
    <details className={styles.group}>
      <summary className={styles.summary}>
        <FlagGlyph flag={group.flag} className={styles.summaryGlyph} decorative />
        <span className={styles.summaryBody}>
          <span className={styles.summaryName}>{group.flag.name}</span>
          {group.flag.description ? <span className={styles.summaryDesc}>{group.flag.description}</span> : null}
        </span>
        <span className={styles.summaryStats}>
          <span className={styles.count}>
            {group.count} item{group.count === 1 ? '' : 's'}
          </span>
          <Money cents={group.totalCents} signed={group.totalCents < 0} className={styles.total} />
        </span>
      </summary>
      <div className={styles.body}>
        <TransactionList
          rows={group.transactions.slice(0, PREVIEW_LIMIT).map((txn) => ({ kind: 'transaction' as const, txn }))}
          lookup={model.lookup}
          flat
          showDate
          {...(onSelect ? { onSelect } : {})}
          {...(onClearFlag ? { onClearFlag } : {})}
        />
        <FlagGroupActions
          group={group}
          onFilterByFlag={onFilterByFlag}
          filterLocked={filterLocked}
          onLockedFilterPress={onLockedFilterPress}
          onOpenReport={onOpenReport}
          onSettle={onSettle}
          onClearGroup={onClearGroup}
        />
      </div>
    </details>
  )
}
