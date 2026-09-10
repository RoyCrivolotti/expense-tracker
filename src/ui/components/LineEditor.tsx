import { useMoneyFormat } from '../hooks/moneyFormatContext'
import type { ExpenseModel } from '../useExpenseData'
import type { GroupLineDraft } from './groupedTransactionIntent'
import { optionLabel, selectableOptions } from './pickerOptions'
import { Field, TypeSelector } from './TransactionFields'
import styles from './GroupedTransactionForm.module.css'

interface LineEditorProps {
  id: string
  line: GroupLineDraft
  model: ExpenseModel
  /** What the collapsed line reads as, used to name this editor for screen readers. */
  title: string
  onChange: (patch: Partial<GroupLineDraft>) => void
  onRemove: () => void
  onDone: () => void
}

/**
 * Inline editor for one already-committed line. Only ever one is open at a time
 * (the parent enforces the accordion), which is what lets Remove be a plainly
 * labelled full-size button rather than a tiny icon repeated down the list.
 *
 * Description is a plain input here, not the combobox: accepting a suggestion
 * rewrites type, category and account, and doing that silently to a line the
 * user has already reviewed is exactly the invisible-carry-forward problem this
 * whole design exists to avoid.
 */
export function LineEditor({ id, line, model, title, onChange, onRemove, onDone }: LineEditorProps) {
  const format = useMoneyFormat()

  return (
    <div
      id={id}
      role="group"
      aria-label={`Editing ${title}`}
      data-testid="line-editor"
      className={styles.editor}
    >
      <TypeSelector value={line.type} onChange={(t) => onChange({ type: t })} />

      <div className={styles.editorRow}>
        <Field label={`Amount (${format.symbol})`}>
          <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={line.amount}
            onChange={(e) => onChange({ amount: e.target.value })}
          />
        </Field>
        <Field label="Description">
          <input
            value={line.description}
            placeholder="e.g. Mercadona"
            onChange={(e) => onChange({ description: e.target.value })}
          />
        </Field>
      </div>

      <div className={styles.editorRow}>
        <Field label="Category">
          <select
            value={line.categoryId}
            onChange={(e) => onChange({ categoryId: Number(e.target.value) })}
          >
            {selectableOptions(model.dataset.categories, line.categoryId).map((c) => (
              <option key={c.id} value={c.id}>
                {optionLabel(c)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Account">
          <select
            value={line.accountId}
            onChange={(e) => onChange({ accountId: Number(e.target.value) })}
          >
            {selectableOptions(model.dataset.accounts, line.accountId).map((a) => (
              <option key={a.id} value={a.id}>
                {optionLabel(a)}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className={styles.editorActions}>
        <button type="button" className={styles.remove} onClick={onRemove}>
          Remove
        </button>
        <button type="button" className={styles.done} onClick={onDone}>
          Done
        </button>
      </div>
    </div>
  )
}
