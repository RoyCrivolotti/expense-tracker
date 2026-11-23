import { useRef, useState } from 'react'
import type { Label } from '../../types'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { useDismissOnOutsidePointer } from '../charts/useDismissOnOutsidePointer'
import { usePopoverMotion } from '../hooks/usePopoverMotion'
import { usePopoverPosition } from '../hooks/usePopoverPosition'
import { selectableLabels } from './labelPickerOptions'
import { QuickCreateLabel } from './QuickCreateLabel'
import { LabelOptionList } from './LabelOptionList'
import { PopoverFrame } from './PopoverFrame'
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

  return (
    <PopoverFrame popoverRef={popoverRef} pos={pos} motion={motion} classes={styles} label="Choose labels">
      <LabelOptionList value={value} options={options} canCreate={Boolean(onCreate)} onToggle={onToggle} />
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
    </PopoverFrame>
  )
}
