import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Label } from '../../types'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { useDismissOnOutsidePointer } from '../charts/useDismissOnOutsidePointer'
import { usePopoverMotion } from '../hooks/usePopoverMotion'
import { usePopoverPosition } from '../hooks/usePopoverPosition'
import { selectableLabels } from './labelPickerOptions'
import { QuickCreateLabel } from './QuickCreateLabel'
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
          <QuickCreateLabel
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
