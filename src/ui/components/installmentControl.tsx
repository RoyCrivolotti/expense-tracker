import type { ReactNode } from 'react'
import type { Transaction } from '../../types'
import type { ExpenseModel } from '../useExpenseData'
import type { InstallmentDraft } from './installmentIntent'
import { CardPaymentIcon } from '../icons'
import styles from './TransactionForm.module.css'

/**
 * Whether the installment link has anything to say ("New plan - payment 2/12",
 * "Kitchen renovation - payment 5/12") versus the default "Not part of a
 * plan" — which needs no row of its own and lives as a chip next to "Add
 * receipt" / "Add note" instead. A payment plan's own description can run
 * long, so once there's real content it gets a full-width row to wrap in
 * rather than clipping inside a chip.
 */
function hasInstallmentLink(
  draft: InstallmentDraft,
  editing: Transaction | null,
): boolean {
  return draft.mode !== 'none' || editing?.planId != null
}

/** Label for the installment toggle reflecting the pending draft, then current link. */
function linkLabel(
  draft: InstallmentDraft,
  editing: Transaction | null,
  model: ExpenseModel,
): string {
  if (draft.mode === 'new') {
    return `New plan - payment ${draft.installmentIndex || '?'}/${draft.totalCount || '?'}`
  }
  if (draft.mode === 'existing') {
    const plan = draft.planId != null ? model.lookup.installmentPlan(draft.planId) : undefined
    return plan ? `${plan.description} - payment ${draft.installmentIndex || '?'}/${plan.totalCount}` : 'Existing plan'
  }
  if (draft.mode === 'unlink') return 'Will be removed from plan'
  if (editing?.planId != null) {
    const plan = model.lookup.installmentPlan(editing.planId)
    return plan ? `Installment ${editing.installmentIndex}/${plan.totalCount} - ${plan.description}` : 'Part of a plan'
  }
  return 'Not part of a plan'
}

/**
 * Splits the installment toggle into its two mutually-exclusive renderings —
 * a compact chip for the chip row, or the full-width bar for when there's a
 * label worth wrapping — so the branch on `hasInstallmentLink` lives here
 * rather than adding another one to TransactionForm's own complexity.
 */
export function installmentControl({
  draft,
  editing,
  model,
  onOpen,
  withdrawal,
}: {
  draft: InstallmentDraft
  editing: Transaction | null
  model: ExpenseModel
  onOpen: () => void
  /** A withdrawal is money coming back; splitting it into payments makes no sense. */
  withdrawal: boolean
}): { chip: ReactNode; bar: ReactNode } {
  if (withdrawal && !hasInstallmentLink(draft, editing)) return { chip: undefined, bar: undefined }
  if (!hasInstallmentLink(draft, editing)) {
    return {
      chip: (
        <button type="button" className={styles.chip} onClick={onOpen}>
          <span className={styles.chipIcon} aria-hidden>
            <CardPaymentIcon />
          </span>
          No plan
        </button>
      ),
      bar: undefined,
    }
  }
  return {
    chip: undefined,
    bar: (
      <button type="button" className={styles.linkButton} onClick={onOpen}>
        Installment plan: {linkLabel(draft, editing, model)}
      </button>
    ),
  }
}
