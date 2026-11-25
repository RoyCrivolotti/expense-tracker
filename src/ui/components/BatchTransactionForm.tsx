import { useEffect, useState } from 'react'
import { resolveInvestmentCategoryId } from '../../data/investmentCategory'
import { parseMoneyToCents, type MoneyFormat } from '../../engine/money'
import { PlusIcon } from '../icons'
import { useMoneyFormat } from '../hooks/moneyFormatContext'
import { useToast } from '../hooks/useToast'
import type { ExpenseActions } from '../actions'
import type { ExpenseModel } from '../useExpenseData'
import { isRowEmpty, type DateBatchDraft } from './batchTransactionIntent'
import { useBatchDrafts } from './batchDrafts'
import { saveBatch } from './batchSave'
import { BatchGroup } from './BatchGroup'
import { FlagField } from './FlagField'
import { createFlagInPlace } from './quickFlag'
import { Money } from './Money'
import formStyles from './TransactionForm.module.css'
import styles from './BatchTransactionForm.module.css'

interface BatchTransactionFormProps {
  model: ExpenseModel
  actions: ExpenseActions
  onClose: () => void
  hidden?: boolean
  onDirtyChange?: (dirty: boolean) => void
  /** Raised while the flag popover owns focus, so the Modal pauses its trap. */
  onTrapPausedChange?: ((paused: boolean) => void) | undefined
}

/** How many rows would be saved and what they add up to; empty rows and zero amounts do not count. */
function batchTotals(
  batches: DateBatchDraft[],
  format: MoneyFormat,
) {
  const saveableRows = batches.flatMap((b) =>
    b.rows.filter((r) => !isRowEmpty(r) && Math.abs(parseMoneyToCents(r.amount, format)) > 0),
  )
  const totalCents = saveableRows.reduce((sum, r) => sum + Math.abs(parseMoneyToCents(r.amount, format)), 0)
  return { count: saveableRows.length, totalCents }
}

function BatchFooter({
  count,
  totalCents,
  busy,
  onSave,
}: {
  count: number
  totalCents: number
  busy: boolean
  onSave: () => void
}) {
  return (
    <>
      <p className={styles.summary} data-testid="batch-summary">
        {count} transaction{count === 1 ? '' : 's'} · <Money cents={totalCents} />
      </p>

      <div className={formStyles.actions}>
        <button type="button" className={`${formStyles.save} tapActive`} disabled={busy} onClick={onSave}>
          {busy ? 'Saving…' : `Add ${count} transaction${count === 1 ? '' : 's'}`}
        </button>
      </div>
    </>
  )
}

export function BatchTransactionForm(props: BatchTransactionFormProps) {
  const { model, actions, onClose, hidden, onDirtyChange, onTrapPausedChange } = props
  const format = useMoneyFormat()
  const { showToast } = useToast()

  const drafts = useBatchDrafts(model)
  const { batches } = drafts
  const [busy, setBusy] = useState(false)
  // Form-level, not per-row: the case this exists for is "flag this whole trip".
  const [flagId, setFlagId] = useState<number | null>(null)

  useEffect(() => {
    onDirtyChange?.(batches.some((b) => b.rows.some((r) => !isRowEmpty(r))) || flagId != null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batches, flagId])

  const investmentCategoryId = resolveInvestmentCategoryId(model.dataset.categories, model.dataset.settings)
  const { count, totalCents } = batchTotals(batches, format)

  const save = () =>
    saveBatch({
      batches,
      format,
      model,
      flagId,
      investmentCategoryId,
      actions,
      setErrors: drafts.setErrors,
      setBusy,
      showToast,
      onClose,
    })

  return (
    <div className={styles.root} hidden={hidden}>
      {batches.map((batch) => (
        <BatchGroup
          key={batch.id}
          {...drafts}
          batch={batch}
          removable={batches.length > 1}
          model={model}
          format={format}
          investmentCategoryId={investmentCategoryId}
          onTrapPausedChange={onTrapPausedChange}
        />
      ))}

      <button type="button" className={styles.addBatch} onClick={drafts.addBatch}>
        <PlusIcon /> Add another date
      </button>

      <div className={styles.flagField}>
        <FlagField
          flags={model.dataset.flags}
          value={flagId}
          onChange={setFlagId}
          label="Flag all of these"
          onTrapPausedChange={onTrapPausedChange}
          onCreate={createFlagInPlace(actions, model.dataset.flags)}
        />
      </div>

      <BatchFooter count={count} totalCents={totalCents} busy={busy} onSave={() => void save()} />
    </div>
  )
}
