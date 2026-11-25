import type { ExpenseModel } from '../useExpenseData'
import type { InstallmentDraft } from './installmentIntent'
import { finalBudgetMonth } from '../../engine'
import { shortMonthFullYearLabel } from '../../engine/dates'
import { splitInstallmentCents } from '../../domain/engine/installments'
import { formatCents } from '../../engine/money'
import { useMoneyFormat } from '../hooks/moneyFormatContext'
import formStyles from './TransactionForm.module.css'
import styles from './InstallmentStep.module.css'

export type SetDraft = <K extends keyof InstallmentDraft>(
  key: K,
  value: InstallmentDraft[K],
) => void

function NumberField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className={formStyles.field}>
      <span className={formStyles.label}>{label}</span>
      <input
        type="number"
        inputMode="numeric"
        step="1"
        min="1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  )
}

export function NewFields({
  draft,
  set,
  promote,
  amountCents,
}: {
  draft: InstallmentDraft
  set: SetDraft
  /** Turns the highlighted-but-uncommitted 'new' selection into a real draft. */
  promote: () => void
  amountCents: number
}) {
  const format = useMoneyFormat()
  const totalCount = Number(draft.totalCount)
  const canSplit = Number.isInteger(totalCount) && totalCount >= 1
  /** What will actually be charged — same helper as the save path, deliberately. */
  const splitSummary = () => {
    const { perInstallmentCents, remainderCents } = splitInstallmentCents(amountCents, totalCount)
    if (remainderCents === 0) return `${formatCents(perInstallmentCents, format)} × ${totalCount}`
    const rest = formatCents(perInstallmentCents, format)
    const first = formatCents(perInstallmentCents + remainderCents, format)
    // Splitting over two is the common case, and "× 1" reads as a quantity the
    // reader has to check rather than the single remaining charge it describes.
    const remaining = totalCount - 1
    return `${first} now, then ${rest}${remaining > 1 ? ` × ${remaining}` : ''}`
  }

  return (
    <>
      <div className={formStyles.row}>
        <NumberField
          label="Total installments"
          value={draft.totalCount}
          onChange={(v) => {
            promote()
            set('totalCount', v)
          }}
        />
        <NumberField
          label="This installment #"
          value={draft.installmentIndex}
          onChange={(v) => {
            promote()
            set('installmentIndex', v)
          }}
        />
      </div>
      <label className={styles.splitToggle}>
        <input
          type="checkbox"
          checked={draft.splitTotal ?? false}
          onChange={(e) => {
            promote()
            set('splitTotal', e.target.checked)
          }}
        />
        <span>This is the total price — split evenly across installments</span>
      </label>
      {draft.splitTotal && canSplit ? <p className={styles.summary}>{splitSummary()}</p> : null}
      <p className={styles.summary}>The plan is anchored to this transaction&apos;s budget month.</p>
    </>
  )
}

export function ExistingFields({
  model,
  draft,
  set,
  onSelectPlan,
}: {
  model: ExpenseModel
  draft: InstallmentDraft
  set: SetDraft
  onSelectPlan: (planId: number) => void
}) {
  const plan = draft.planId != null ? model.lookup.installmentPlan(draft.planId) : undefined
  return (
    <>
      <label className={formStyles.field}>
        <span className={formStyles.label}>Plan</span>
        <select value={draft.planId ?? ''} onChange={(e) => onSelectPlan(Number(e.target.value))}>
          {model.dataset.installmentPlans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.description}
            </option>
          ))}
        </select>
      </label>
      <NumberField
        label="This installment #"
        value={draft.installmentIndex}
        onChange={(v) => set('installmentIndex', v)}
      />
      {plan ? <p className={styles.summary}>Last payment {shortMonthFullYearLabel(finalBudgetMonth(plan))}</p> : null}
    </>
  )
}
