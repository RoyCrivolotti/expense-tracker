import type { FlagGroup } from '../../domain/engine/flagGroups'
import { buildReimbursementDraft, paymentForSelection, settleIdsFor } from '../../domain/engine/reimbursementDraft'
import { formatMoneyInput, parseMoneyToCents } from '../../engine/money'
import { resolveDefaultAccountId } from '../../data/defaultAccount'
import { defaultBudgetMonth } from '../../engine/dates'
import type { ExpenseModel } from '../useExpenseData'
import { useMoneyFormat } from '../hooks/moneyFormatContext'
import { Modal } from '../components/Modal'
import { ReimbursementFields } from './ReimbursementForm'
import { useReimbursementState } from './useReimbursementState'
import { ReimbursementLines } from './ReimbursementParts'
import styles from './RecordReimbursementSheet.module.css'

interface Props {
  group: FlagGroup
  model: ExpenseModel
  busy: boolean
  /** Set when the last attempt failed; the payment was rolled back. */
  error?: string | null
  onCancel: () => void
  onRecord: (
    input: RecordInput,
    transactionIds: number[],
  ) => void
}

export interface RecordInput {
  date: string
  budgetMonth: string
  description: string
  accountId: number
  categoryId: number
  amountCents: number
}

/**
 * Record what an employer actually paid, against the lines it actually covered.
 *
 * Its own sheet rather than the prefilled transaction editor: the thing being
 * chosen here is *which* claimed rows this payment clears, and the generic
 * editor has nowhere to put that. Everything else — amount, date, account,
 * category — stays editable, because a payment is rarely exactly the claim.
 */
/**
 * Blank falls back rather than blocking the save: an unnamed report still needs
 * a description on the transaction it creates, and a generated one beats an
 * empty row in the ledger. Lifted out of the component to keep it under the
 * complexity ceiling.
 */
function reportName(
  typed: string,
  fallback: string,
): string {
  return typed.trim() || fallback
}

export function RecordReimbursementSheet({ group, model, busy, error, onCancel, onRecord }: Props) {
  const format = useMoneyFormat()
  const draft = buildReimbursementDraft(
    group,
    model.dataset.accounts,
    resolveDefaultAccountId(model.dataset.accounts, model.dataset.settings),
  )

  const state = useReimbursementState(draft, format)
  const { selected, setSelected, amount, setAmount, amountEdited, name, date, accountId, categoryId, datePopoverOpen } =
    state

  if (!draft) return null

  const toggle = (id: number) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
    if (!amountEdited) setAmount(formatMoneyInput(paymentForSelection(draft, next), format))
  }

  const cents = Math.abs(parseMoneyToCents(amount, format))

  const record = () => {
    onRecord(
      {
        date,
        budgetMonth: defaultBudgetMonth(date, model.dataset.settings.budgetRolloverDay),
        description: reportName(name, draft.description),
        accountId,
        categoryId,
        amountCents: cents,
      },
      settleIdsFor(draft, selected),
    )
  }

  return (
    <Modal title="Record reimbursement" subtitle={group.flag.name} onClose={onCancel} trapPaused={datePopoverOpen}>
      <p className={styles.lead}>Tick what this payment covers. Anything left unticked stays owed.</p>

      <ReimbursementLines draft={draft} selected={selected} onToggle={toggle} lookup={model.lookup} format={format} />

      <ReimbursementFields
        draft={draft}
        model={model}
        format={format}
        state={state}
        cents={cents}
        error={error}
        busy={busy}
        onRecord={record}
      />
    </Modal>
  )
}
