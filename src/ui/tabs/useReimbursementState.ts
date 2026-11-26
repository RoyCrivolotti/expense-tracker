import { useState } from 'react'
import type { ReimbursementDraft } from '../../domain/engine/reimbursementDraft'
import { formatMoneyInput, type MoneyFormat } from '../../engine/money'
import { todayIso } from '../components/transactionFormState'
import { usePopoverTrapPause } from '../hooks/usePopoverTrapPause'

/** Seeded from the draft; '' only while there is no draft to seed from. */
function initialName(draft: ReimbursementDraft | null): string {
  return draft?.description ?? ''
}

/** What the sheet holds while it is open: the ticks, the figure typed, the name, the date and where it goes. */
export function useReimbursementState(
  draft: ReimbursementDraft | null,
  format: MoneyFormat,
) {
  const [selected, setSelected] = useState<Set<number>>(() => new Set(draft?.selectedIds ?? []))
  const [amount, setAmount] = useState(() => formatMoneyInput(draft?.amountCents ?? 0, format))
  // Whether the figure still tracks the ticks. Once it has been typed over it
  // stops moving on its own — an employer's payment is often not the claim total,
  // and silently rewriting what was typed would be worse than a stale default.
  const [amountEdited, setAmountEdited] = useState(false)
  // The payment's description *is* the report's name — PastReport reads it back
  // off the transaction, so there is nothing extra to store. Seeded from the
  // draft and editable, because "Reimbursement — Work travel" tells you nothing
  // once there are four of them.
  const [name, setName] = useState(() => initialName(draft))
  const [date, setDate] = useState(todayIso())
  const [accountId, setAccountId] = useState(draft?.accountId ?? 0)
  const [categoryId, setCategoryId] = useState(draft?.categoryId ?? 0)
  // Pauses this Modal's own trap while the date popover is open, the same way
  // TransactionModal does for its fields — otherwise Escape closes both at once.
  const [datePopoverOpen, setDatePopoverOpen] = usePopoverTrapPause()
  return {
    selected,
    setSelected,
    amount,
    setAmount,
    amountEdited,
    setAmountEdited,
    name,
    setName,
    date,
    setDate,
    accountId,
    setAccountId,
    categoryId,
    setCategoryId,
    datePopoverOpen,
    setDatePopoverOpen,
  }
}

export type ReimbursementState = ReturnType<typeof useReimbursementState>
