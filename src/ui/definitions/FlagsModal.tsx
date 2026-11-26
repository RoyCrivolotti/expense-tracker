import { useState } from 'react'
import type { Flag } from '../../types'
import { buildFlagGroup } from '../../domain/engine/flagGroups'
import type { ExpenseModel } from '../useExpenseData'
import type { ExpenseActions } from '../actions'
import { EmptyState } from '../components/primitives'
import { Modal } from '../components/Modal'
import { FlagGlyph } from '../components/FlagGlyph'
import { ChevronIcon } from '../icons'
import { FlagForm } from './FlagForm'
import { FlagAutoLabelEditor } from './FlagAutoLabelEditor'
import { transactionCountLabel } from '../components/flagPickerOptions'
import { settledCount, useRecordUsage, type UsageView } from './recordUsage'
import defStyles from './definitions.module.css'
import styles from './FlagsModal.module.css'

type Editing = { flag: Flag } | { flag: null } | null

/**
 * Whether a report would actually build. A raw usage count is not the same
 * question: it counts cancelled rows and mis-typed income that `buildFlagGroup`
 * drops, so a flag carrying only those offered a button that opened nothing.
 */
function hasReport(
  model: ExpenseModel,
  flag: Flag,
): boolean {
  if (!flag.reimbursable) return false
  return buildFlagGroup(flag.id, model.dataset.transactions, model.dataset.flags) != null
}

function modalTitle(
  editing: Editing,
  configuringLabel: Flag | null,
): string {
  if (editing) return editing.flag ? `Edit ${editing.flag.name}` : 'New flag'
  return configuringLabel ? `Auto-label: ${configuringLabel.name}` : 'Flags'
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
  const [configuringLabel, setConfiguringLabel] = useState<Flag | null>(null)
  const flags = model.dataset.flags
  const usage = useRecordUsage(model)

  const title = modalTitle(editing, configuringLabel)

  return (
    <Modal
      title={title}
      {...(editing || configuringLabel ? {} : { subtitle: 'Reusable markers for transactions you need to track.' })}
      onClose={confirming ? () => setConfirming(false) : onClose}
      trapPaused={confirming}
    >
      {editing ? (
        <FlagForm
          flag={editing.flag}
          existing={flags}
          usageCount={editing.flag ? settledCount(usage, 'flag', editing.flag.id) : 0}
          usage={usage}
          actions={actions}
          onDone={() => setEditing(null)}
          onConfirmingChange={setConfirming}
        />
      ) : configuringLabel ? (
        <FlagAutoLabelEditor
          flag={configuringLabel}
          labels={model.dataset.labels}
          actions={actions}
          onDone={() => setConfiguringLabel(null)}
        />
      ) : (
        <FlagList
          model={model}
          usage={usage}
          onConfigure={setConfiguringLabel}
          onEdit={setEditing}
          onOpenReport={
            onOpenReport
              ? (flagId) => {
                  onClose()
                  onOpenReport(flagId)
                }
              : undefined
          }
        />
      )}
    </Modal>
  )
}

function FlagRow({
  flag,
  model,
  usage,
  onConfigure,
  onEdit,
  onOpenReport,
}: {
  flag: Flag
  model: ExpenseModel
  usage: UsageView
  onConfigure: () => void
  onEdit: () => void
  onOpenReport: (() => void) | undefined
}) {
  return (
    <div className={flag.active ? styles.row : `${styles.row} ${styles.inactive}`}>
      <button type="button" className={styles.rowMain} onClick={onConfigure}>
        <FlagGlyph flag={flag} className={styles.rowGlyph} />
        <div className={styles.rowBody}>
          <span className={styles.rowName}>
            {flag.name}
            {flag.active ? null : <span className={styles.archived}> · archived</span>}
          </span>
          <span className={styles.rowMeta}>
            {flag.description ? `${flag.description} · ` : ''}
            {usage.count('flag', flag.id) === null ? '—' : transactionCountLabel(usage.count('flag', flag.id))}
          </span>
        </div>
        <ChevronIcon className={styles.rowChevron} aria-hidden="true" />
      </button>
      {onOpenReport && hasReport(model, flag) ? (
        <button type="button" className={defStyles.editBtn} onClick={onOpenReport}>
          Expense report
        </button>
      ) : null}
      <button type="button" className={defStyles.editBtn} onClick={onEdit}>
        Edit
      </button>
    </div>
  )
}

function FlagList({
  model,
  usage,
  onConfigure,
  onEdit,
  onOpenReport,
}: {
  model: ExpenseModel
  usage: UsageView
  onConfigure: (flag: Flag) => void
  onEdit: (editing: Editing) => void
  onOpenReport: ((flagId: number) => void) | undefined
}) {
  const flags = model.dataset.flags
  return (
    <>
      {flags.length === 0 ? (
        <EmptyState>
          No flags yet. Create one to group transactions you need to follow up on — expenses to claim back, say.
        </EmptyState>
      ) : (
        flags.map((flag) => (
          <FlagRow
            key={flag.id}
            flag={flag}
            model={model}
            usage={usage}
            onConfigure={() => onConfigure(flag)}
            onEdit={() => onEdit({ flag })}
            onOpenReport={onOpenReport ? () => onOpenReport(flag.id) : undefined}
          />
        ))
      )}
      {flags.length === 0 ? null : usage.notice}
      <button type="button" className={defStyles.addBtn} onClick={() => onEdit({ flag: null })}>
        + Add flag
      </button>
    </>
  )
}
