import { useId } from 'react'
import { parseMoneyToCents } from '../../engine/money'
import { useMoneyFormat } from '../hooks/moneyFormatContext'
import type { ExpenseModel } from '../useExpenseData'
import type { GroupLineDraft } from './groupedTransactionIntent'
import { LineEditor } from './LineEditor'
import { Money } from './Money'
import formStyles from './TransactionForm.module.css'
import styles from './GroupedTransactionForm.module.css'

const TYPE_LABEL: Record<GroupLineDraft['type'], string> = {
  expense: 'Expense',
  income: 'Income',
  investment: 'Invest',
  refund: 'Refund',
}

interface CommittedLineProps {
  line: GroupLineDraft
  model: ExpenseModel
  expanded: boolean
  error?: string | undefined
  onToggle: () => void
  onChange: (patch: Partial<GroupLineDraft>) => void
  onRemove: () => void
}

export function CommittedLine({
  line,
  model,
  expanded,
  error,
  onToggle,
  onChange,
  onRemove,
}: CommittedLineProps) {
  const format = useMoneyFormat()
  const editorId = useId()

  const categoryName = model.dataset.categories.find((c) => c.id === line.categoryId)?.name ?? '—'
  const accountName = model.dataset.accounts.find((a) => a.id === line.accountId)?.name ?? '—'
  // Falls back to the category the way a saved transaction row does, so a line
  // entered with an amount but no description still reads as something.
  const title = line.description.trim() || categoryName
  const cents = Math.abs(parseMoneyToCents(line.amount, format))

  return (
    <li className={styles.line}>
      {/* The button's accessible name is its own content — "Coffee Expense ·
          Groceries · Cash −3,50 €" — so every line is distinguishable without a
          single aria-label. The focused-card trial reached for aria-label here
          and ended up with N+1 identically-named destructive controls. */}
      <button
        type="button"
        className={styles.lineToggle}
        aria-expanded={expanded}
        aria-controls={editorId}
        onClick={onToggle}
      >
        <span className={styles.dot} data-type={line.type} aria-hidden="true" />
        <span className={styles.lineBody}>
          <span className={styles.lineDesc}>{title}</span>
          <span className={styles.lineMeta}>
            {TYPE_LABEL[line.type]} · {categoryName} · {accountName}
          </span>
        </span>
        <Money cents={cents} type={line.type} className={styles.lineAmount} />
      </button>

      {error && <p className={formStyles.error}>{error}</p>}

      {expanded && (
        <LineEditor
          id={editorId}
          line={line}
          model={model}
          title={title}
          onChange={onChange}
          onRemove={onRemove}
          onDone={onToggle}
        />
      )}
    </li>
  )
}
