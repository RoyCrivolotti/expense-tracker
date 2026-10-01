import { useState } from 'react'
import type { Label } from '../../types'
import type { ExpenseModel } from '../useExpenseData'
import type { ExpenseActions } from '../actions'
import { EmptyState } from '../components/primitives'
import { Modal } from '../components/Modal'
import { LabelGlyph } from '../components/LabelGlyph'
import { LabelForm } from './LabelForm'
import defStyles from './definitions.module.css'
// Reused wholesale: a label row (glyph, name, meta, archived tag, Edit button)
// is laid out identically to a flag row, so this borrows that stylesheet
// rather than cloning it — see LabelPickerPopover for the same call on its CSS.
import styles from './FlagsModal.module.css'

type Editing = { label: Label } | { label: null } | null

function usageCount(model: ExpenseModel, labelId: number): number {
  return model.dataset.transactions.filter((t) => t.labelIds?.includes(labelId)).length
}

/** Mirrors FlagsModal exactly, minus the "Expense report" button — labels have no reports. */
export function LabelsModal({
  model,
  actions,
  onClose,
}: {
  model: ExpenseModel
  actions: ExpenseActions
  onClose: () => void
}) {
  const [editing, setEditing] = useState<Editing>(null)
  const [confirming, setConfirming] = useState(false)
  const labels = model.dataset.labels

  const title = editing ? (editing.label ? `Edit ${editing.label.name}` : 'New label') : 'Labels'

  return (
    <Modal
      title={title}
      {...(editing
        ? {}
        : { subtitle: 'Permanent tags for what a transaction belongs to.' })}
      onClose={confirming ? () => setConfirming(false) : onClose}
      trapPaused={confirming}
    >
      {editing ? (
        <LabelForm
          label={editing.label}
          existing={labels}
          usageCount={editing.label ? usageCount(model, editing.label.id) : 0}
          actions={actions}
          onDone={() => setEditing(null)}
          onConfirmingChange={setConfirming}
        />
      ) : (
        <>
          {labels.length === 0 ? (
            <EmptyState>
              No labels yet. Create one to mark what a transaction permanently belongs to — a
              trip, a project — regardless of any flag on it.
            </EmptyState>
          ) : (
            labels.map((label) => (
              <div
                key={label.id}
                className={label.active ? styles.row : `${styles.row} ${styles.inactive}`}
              >
                <LabelGlyph label={label} className={styles.rowGlyph} />
                <div className={styles.rowBody}>
                  <span className={styles.rowName}>
                    {label.name}
                    {label.active ? null : <span className={styles.archived}> · archived</span>}
                  </span>
                  <span className={styles.rowMeta}>
                    {label.description ? `${label.description} · ` : ''}
                    {usageCount(model, label.id)} transaction
                    {usageCount(model, label.id) === 1 ? '' : 's'}
                  </span>
                </div>
                <button
                  type="button"
                  className={defStyles.editBtn}
                  onClick={() => setEditing({ label })}
                >
                  Edit
                </button>
              </div>
            ))
          )}
          <button
            type="button"
            className={defStyles.addBtn}
            onClick={() => setEditing({ label: null })}
          >
            + Add label
          </button>
        </>
      )}
    </Modal>
  )
}
