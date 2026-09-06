import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { formatCents, parseMoneyToCents, type MoneyFormat } from '../../engine/money'
import { formatDayLabel } from '../format'
import { CloseIcon } from '../icons'
import { useMoneyFormat } from '../hooks/moneyFormatContext'
import { useToast } from '../hooks/useToast'
import type { ExpenseActions } from '../actions'
import type { ExpenseModel } from '../useExpenseData'
import { buildFocusedTransactions, isDraftEmpty, type FocusedDraft } from './focusedTransactionIntent'
import { Fields } from './TransactionFields'
import { acceptDescriptionSuggestion } from './transactionFormActions'
import { initialFields, type FormFields, type Setter } from './transactionFormState'
import { Money } from './Money'
import formStyles from './TransactionForm.module.css'
import styles from './FocusedTransactionForm.module.css'

interface FocusedTransactionFormProps {
  model: ExpenseModel
  actions: ExpenseActions
  onClose: () => void
  /** Kept mounted but visually hidden (e.g. while the single-transaction tab is
   * active), so its own state survives switching back rather than losing typed drafts. */
  hidden?: boolean
  /** Reports whether any draft has content, so a caller can warn before discarding
   * it (e.g. closing the modal without saving). */
  onDirtyChange?: (dirty: boolean) => void
}

/** Carries type/category/account/date forward (same convenience the shipped
 * batch form gives for a run of same-day, same-kind entries) but never the
 * previous transaction's own amount/description/notes. */
function nextDraftFrom(prev: FocusedDraft): FocusedDraft {
  return { ...prev, id: crypto.randomUUID(), amount: '', description: '', notes: '' }
}

function chipLabel(draft: FocusedDraft, format: MoneyFormat): string {
  const desc = draft.description.trim() || 'Untitled'
  const cents = parseMoneyToCents(draft.amount, format)
  return cents > 0 ? `${desc} · ${formatCents(cents, format)}` : desc
}

export function FocusedTransactionForm({
  model,
  actions,
  onClose,
  hidden,
  onDirtyChange,
}: FocusedTransactionFormProps) {
  const format = useMoneyFormat()
  const { showToast } = useToast()

  const [drafts, setDrafts] = useState<FocusedDraft[]>(() => [
    { ...initialFields(null, model, format, undefined), id: crypto.randomUUID() },
  ])
  const [activeIndex, setActiveIndex] = useState(0)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    onDirtyChange?.(drafts.some((d) => !isDraftEmpty(d)))
    // onDirtyChange intentionally omitted: callers pass a state setter inline, which
    // would otherwise re-run this on every parent render regardless of `drafts`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drafts])

  const active = drafts[activeIndex]!

  // Bridges the per-draft array state to the single-FormFields shape Fields,
  // Setter, and acceptDescriptionSuggestion already expect — those are shared
  // verbatim with the single-transaction form, not reimplemented here.
  const setActiveForm: Dispatch<SetStateAction<FormFields>> = (action) => {
    setDrafts((ds) =>
      ds.map((d, i) => {
        if (i !== activeIndex) return d
        const next = typeof action === 'function' ? action(d) : action
        return { ...next, id: d.id }
      }),
    )
  }
  const set: Setter = (key, value) => setActiveForm((f) => ({ ...f, [key]: value }))

  const removeDraft = (id: string) => {
    if (drafts.length <= 1) return
    const idx = drafts.findIndex((d) => d.id === id)
    if (idx === -1) return
    setDrafts((ds) => ds.filter((d) => d.id !== id))
    setActiveIndex((a) => (idx < a ? a - 1 : idx === a ? Math.max(0, a - 1) : a))
    setErrors((e) => {
      if (!(id in e)) return e
      const next = { ...e }
      delete next[id]
      return next
    })
  }

  const isLast = activeIndex === drafts.length - 1
  const nextDisabled = isLast && isDraftEmpty(active)

  const goNext = () => {
    if (!isLast) {
      setActiveIndex((a) => a + 1)
      return
    }
    setDrafts((ds) => [...ds, nextDraftFrom(active)])
    setActiveIndex((a) => a + 1)
  }

  // Same "counts toward saving" rule buildFocusedTransactions uses, so this
  // summary never promises more than save() will actually persist.
  const saveableDrafts = drafts.filter(
    (d) => !isDraftEmpty(d) && Math.abs(parseMoneyToCents(d.amount, format)) > 0,
  )
  const totalCents = saveableDrafts.reduce((sum, d) => sum + Math.abs(parseMoneyToCents(d.amount, format)), 0)
  const count = saveableDrafts.length

  const save = async () => {
    const result = buildFocusedTransactions(drafts, format)
    if (!result.ok) {
      setErrors(result.errors)
      const firstErrorId = Object.keys(result.errors)[0]
      const idx = firstErrorId ? drafts.findIndex((d) => d.id === firstErrorId) : -1
      if (idx !== -1) {
        setActiveIndex(idx)
      } else {
        showToast('Add at least one transaction', 'error')
      }
      return
    }
    setErrors({})
    setBusy(true)
    try {
      await actions.createTransactions(result.transactions)
      showToast(`Added ${result.transactions.length} transaction${result.transactions.length === 1 ? '' : 's'}`, 'success')
      onClose()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not save', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.root} hidden={hidden} data-testid="focused-transaction-form">
      {drafts.length > 1 && (
        <div className={styles.chips}>
          {drafts.map((d, i) =>
            i === activeIndex ? null : (
              // Two sibling buttons, not a nested one — a <button> can't
              // validly contain another interactive control.
              <div key={d.id} className={`${styles.chip}${errors[d.id] ? ` ${styles.chipError}` : ''}`}>
                <button type="button" className={styles.chipLabel} onClick={() => setActiveIndex(i)}>
                  {chipLabel(d, format)}
                </button>
                <button
                  type="button"
                  aria-label="Remove this transaction"
                  className={styles.chipRemove}
                  onClick={() => removeDraft(d.id)}
                >
                  <CloseIcon />
                </button>
              </div>
            ),
          )}
        </div>
      )}

      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <span className={styles.eyebrow}>
            Transaction {activeIndex + 1} · {formatDayLabel(active.date)}
          </span>
          {drafts.length > 1 && (
            <button
              type="button"
              className={styles.removeActive}
              aria-label="Remove this transaction"
              onClick={() => removeDraft(active.id)}
            >
              <CloseIcon />
            </button>
          )}
        </div>
        <Fields
          form={active}
          set={set}
          model={model}
          editing={null}
          onAcceptSuggestion={(s) => acceptDescriptionSuggestion(s, model, setActiveForm)}
        />
        {errors[active.id] && <p className={formStyles.error}>{errors[active.id]}</p>}
        <button type="button" className={styles.next} disabled={nextDisabled} onClick={goNext}>
          Next transaction →
        </button>
      </div>

      <p className={styles.summary} data-testid="focused-summary">
        {count} transaction{count === 1 ? '' : 's'} · <Money cents={totalCents} />
      </p>

      <div className={formStyles.actions}>
        <button type="button" className={`${formStyles.save} tapActive`} disabled={busy} onClick={() => void save()}>
          {busy ? 'Saving…' : `Add ${count} transaction${count === 1 ? '' : 's'}`}
        </button>
      </div>
    </div>
  )
}
