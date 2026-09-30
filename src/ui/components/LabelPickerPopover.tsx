import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Label } from '../../types'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { useDismissOnOutsidePointer } from '../charts/useDismissOnOutsidePointer'
import { usePopoverMotion } from '../hooks/usePopoverMotion'
import { usePopoverPosition } from '../hooks/usePopoverPosition'
import { selectableLabels } from './labelPickerOptions'
import { duplicateLabelName, quickLabelDraft } from './quickLabel'
// Reused wholesale: this picker's list/option/swatch/create styling is
// identical to the flag picker's — only the selection behaviour differs
// (toggle-and-stay-open here, versus pick-and-close there), which lives in
// this file's own logic, not in a copy of the same CSS.
import styles from './FlagPicker.module.css'

interface Props {
  /** Currently applied label ids. */
  value: number[]
  labels: Label[]
  triggerRef: React.RefObject<HTMLElement | null>
  onToggle: (labelId: number) => void
  onClose: () => void
  /** Create a label from here. Optional, same reason as FlagPickerPopover's onCreate. */
  onCreate?: ((name: string) => Promise<number>) | undefined
}

/** Name-only label creation, inline in the picker. Mirrors QuickCreate in FlagPickerPopover. */
function QuickCreate({
  labels,
  onCreate,
  onCreated,
  onCancel,
}: {
  labels: Label[]
  onCreate: (name: string) => Promise<number>
  onCreated: (labelId: number) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const submit = async () => {
    if (busy) return
    if (!quickLabelDraft(name, labels)) {
      setErr('Enter a name')
      return
    }
    if (duplicateLabelName(name, labels)) {
      setErr('There is already a label with that name')
      return
    }
    setBusy(true)
    setErr(null)
    try {
      onCreated(await onCreate(name))
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not create the label')
      setBusy(false)
    }
  }

  return (
    <div className={styles.create}>
      <input
        className={styles.createInput}
        type="text"
        autoFocus
        aria-label="New label name"
        placeholder="e.g. Japan trip"
        value={name}
        disabled={busy}
        onChange={(e) => {
          setName(e.target.value)
          setErr(null)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            void submit()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation()
            onCancel()
          }
        }}
      />
      <button type="button" className={styles.createAdd} disabled={busy} onClick={() => void submit()}>
        {busy ? 'Adding…' : 'Add'}
      </button>
      {err ? (
        <p className={styles.createError} role="alert">
          {err}
        </p>
      ) : null}
    </div>
  )
}

export function LabelPickerPopover({ value, labels, triggerRef, onToggle, onClose, onCreate }: Props) {
  const popoverRef = useRef<HTMLDivElement>(null)
  const pos = usePopoverPosition(triggerRef, popoverRef)
  const motion = usePopoverMotion(pos)
  const options = selectableLabels(labels, value)
  const [creating, setCreating] = useState(false)

  useFocusTrap(popoverRef, onClose, motion.leaving)
  useDismissOnOutsidePointer(popoverRef, !motion.leaving, onClose, triggerRef)

  return createPortal(
    <div
      ref={popoverRef}
      className={motion.leaving ? `${styles.popover} ${styles.popoverLeaving}` : styles.popover}
      {...motion.attrs}
      style={{
        ...motion.exit,
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        maxHeight: pos?.maxHeight,
        overflowY: 'auto',
        visibility: pos ? 'visible' : 'hidden',
      }}
      role="dialog"
      aria-label="Choose labels"
    >
      {options.length > 0 ? (
        <ul className={styles.list}>
          {options.map((label) => {
            const selected = value.includes(label.id)
            return (
              <li key={label.id}>
                <button
                  type="button"
                  className={styles.option}
                  onClick={() => onToggle(label.id)}
                  aria-pressed={selected}
                >
                  <span
                    className={styles.swatch}
                    style={{ background: label.color, borderRadius: '999px' }}
                    aria-hidden
                  />
                  <span className={styles.optionBody}>
                    <span className={styles.optionName}>
                      {label.name}
                      {!label.active ? <span className={styles.archived}> · archived</span> : null}
                    </span>
                    {label.description ? (
                      <span className={styles.optionDesc}>{label.description}</span>
                    ) : null}
                  </span>
                  {selected ? <span className={styles.tick} aria-hidden>✓</span> : null}
                </button>
              </li>
            )
          })}
        </ul>
      ) : !onCreate ? (
        <p className={styles.empty}>No labels to choose from. Add one under Settings &rarr; Labels.</p>
      ) : null}
      {onCreate ? (
        creating ? (
          <QuickCreate
            labels={labels}
            onCreate={onCreate}
            onCreated={(id) => {
              setCreating(false)
              onToggle(id)
            }}
            onCancel={() => setCreating(false)}
          />
        ) : (
          <button type="button" className={styles.newFlag} onClick={() => setCreating(true)}>
            + New label
          </button>
        )
      ) : null}
      <button type="button" className={styles.createBtn} onClick={onClose}>
        Done
      </button>
    </div>,
    document.body,
  )
}
