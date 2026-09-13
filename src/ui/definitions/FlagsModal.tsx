import { useState } from 'react'
import type { Flag } from '../../types'
import { buildFlagGroup } from '../../domain/engine/flagGroups'
import type { ExpenseModel } from '../useExpenseData'
import type { ExpenseActions } from '../actions'
import { EmptyState } from '../components/primitives'
import { Modal } from '../components/Modal'
import { FlagGlyph } from '../components/FlagGlyph'
import { FlagForm } from './FlagForm'
import defStyles from './definitions.module.css'
import styles from './FlagsModal.module.css'

type Editing = { flag: Flag } | { flag: null } | null

function usageCount(model: ExpenseModel, flagId: number): number {
  return model.dataset.transactions.filter((t) => t.flagId === flagId).length
}

/**
 * Whether a report would actually build. A raw usage count is not the same
 * question: it counts cancelled rows and mis-typed income that `buildFlagGroup`
 * drops, so a flag carrying only those offered a button that opened nothing.
 */
function hasClaim(model: ExpenseModel, flagId: number): boolean {
  return buildFlagGroup(flagId, model.dataset.transactions, model.dataset.flags) != null
}

export function FlagsModal({
  model,
  actions,
  onClose,
  onOpenReport,
}: {
  model: ExpenseModel
  actions: ExpenseActions
  onClose: () => void
  /**
   * Opens a flag's expense report. The only route to an archived flag's:
   * archiving is how a claim is marked done, it drops out of the Flagged card
   * by design, and a done claim is exactly the one an employer asks to see
   * again. Closes this modal first — the two render as siblings, so leaving
   * both mounted would leave this one's focus trap live under the sheet.
   */
  onOpenReport?: ((flagId: number) => void) | undefined
}) {
  const [editing, setEditing] = useState<Editing>(null)
  const [confirming, setConfirming] = useState(false)
  const flags = model.dataset.flags

  const title = editing ? (editing.flag ? `Edit ${editing.flag.name}` : 'New flag') : 'Flags'

  return (
    <Modal
      title={title}
      {...(editing
        ? {}
        : { subtitle: 'Reusable markers for transactions you need to track.' })}
      onClose={confirming ? () => setConfirming(false) : onClose}
      trapPaused={confirming}
    >
      {editing ? (
        <FlagForm
          flag={editing.flag}
          existing={flags}
          usageCount={editing.flag ? usageCount(model, editing.flag.id) : 0}
          actions={actions}
          onDone={() => setEditing(null)}
          onConfirmingChange={setConfirming}
        />
      ) : (
        <>
          {flags.length === 0 ? (
            <EmptyState>
              No flags yet. Create one to group transactions you need to follow up on — expenses to
              claim back, say.
            </EmptyState>
          ) : (
            flags.map((flag) => (
              <div
                key={flag.id}
                className={flag.active ? styles.row : `${styles.row} ${styles.inactive}`}
              >
                <FlagGlyph flag={flag} className={styles.rowGlyph} />
                <div className={styles.rowBody}>
                  <span className={styles.rowName}>
                    {flag.name}
                    {flag.active ? null : <span className={styles.archived}> · archived</span>}
                  </span>
                  <span className={styles.rowMeta}>
                    {flag.description ? `${flag.description} · ` : ''}
                    {usageCount(model, flag.id)} transaction
                    {usageCount(model, flag.id) === 1 ? '' : 's'}
                  </span>
                </div>
                {onOpenReport && hasClaim(model, flag.id) ? (
                  <button
                    type="button"
                    className={defStyles.editBtn}
                    onClick={() => {
                      onClose()
                      onOpenReport(flag.id)
                    }}
                  >
                    Expense report
                  </button>
                ) : null}
                <button
                  type="button"
                  className={defStyles.editBtn}
                  onClick={() => setEditing({ flag })}
                >
                  Edit
                </button>
              </div>
            ))
          )}
          <button
            type="button"
            className={defStyles.addBtn}
            onClick={() => setEditing({ flag: null })}
          >
            + Add flag
          </button>
        </>
      )}
    </Modal>
  )
}
