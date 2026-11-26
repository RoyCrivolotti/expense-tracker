import { useRef, useState, type ReactNode } from 'react'
import styles from './ExpenseReportView.module.css'

/**
 * A piece of text that is edited in place and lives only for this visit.
 *
 * Nothing about a report is stored: it rebuilds itself fresh every time it is
 * opened, so there is nowhere to keep an edit between visits without inventing
 * storage for a document that has none. Enter or blur commits, Escape cancels.
 * `display` draws the resting state and is handed the function that starts an edit.
 */
function InlineEdit({
  value,
  ariaLabel,
  inputClassName,
  allowEmpty = false,
  placeholder,
  onCommit,
  display,
}: {
  value: string
  ariaLabel: string
  inputClassName: string | undefined
  /** Whether clearing the field is a real edit. A title cannot be blank; a purpose can. */
  allowEmpty?: boolean
  placeholder?: string
  onCommit: (value: string) => void
  display: (startEditing: () => void) => ReactNode
}) {
  const [editing, setEditing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const commit = () => {
    const next = inputRef.current?.value.trim() ?? ''
    if (next || allowEmpty) onCommit(next)
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        className={inputClassName}
        defaultValue={value}
        placeholder={placeholder}
        autoFocus
        aria-label={ariaLabel}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit()
          } else if (e.key === 'Escape') {
            setEditing(false)
          }
        }}
      />
    )
  }

  return <>{display(() => setEditing(true))}</>
}

/**
 * The claim's name. An employer reading the document needs to know what it is
 * *for*, which is why this defaults to the flag's name and can be renamed.
 */
export function EditableTitle({ title, onTitleChange }: { title: string; onTitleChange: (title: string) => void }) {
  return (
    <InlineEdit
      value={title}
      ariaLabel="Report title"
      inputClassName={styles.titleInput}
      onCommit={onTitleChange}
      display={(startEditing) => (
        <div className={styles.titleRow}>
          <h1 className={styles.title}>{title}</h1>
          <button type="button" className={styles.titleEditBtn} onClick={startEditing}>
            Rename
          </button>
        </div>
      )}
    />
  )
}

/**
 * One line saying what the claim covers, in the claimant's own words.
 *
 * Blank by default and then absent from the page, so nothing prints that the
 * claimant did not write. The flag's description used to fill this slot, but
 * that is a note the claimant keeps for themselves ("submit monthly"), not
 * something to put in front of an approver.
 */
export function EditablePurpose({
  purpose,
  onPurposeChange,
}: {
  purpose: string
  onPurposeChange: (purpose: string) => void
}) {
  return (
    <InlineEdit
      value={purpose}
      ariaLabel="Report purpose"
      inputClassName={styles.purposeInput}
      placeholder="e.g. Client visit, Madrid"
      allowEmpty
      onCommit={onPurposeChange}
      display={(startEditing) =>
        purpose ? (
          <div className={styles.titleRow}>
            <p className={styles.subtitle}>{purpose}</p>
            <button type="button" className={styles.titleEditBtn} onClick={startEditing}>
              Edit
            </button>
          </div>
        ) : (
          <button type="button" className={styles.titleEditBtn} onClick={startEditing}>
            Add a purpose
          </button>
        )
      }
    />
  )
}
