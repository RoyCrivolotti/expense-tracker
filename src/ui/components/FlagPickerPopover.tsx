import { useRef, useState } from 'react'
import type { Flag } from '../../types'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { useDismissOnOutsidePointer } from '../charts/useDismissOnOutsidePointer'
import { usePopoverMotion } from '../hooks/usePopoverMotion'
import { usePopoverPosition } from '../hooks/usePopoverPosition'
import { selectableFlags } from './flagPickerOptions'
import { QuickCreateFlag } from './QuickCreateFlag'
import { FlagOptionList } from './FlagOptionList'
import { PopoverFrame } from './PopoverFrame'
import styles from './FlagPicker.module.css'

interface Props {
  /** Currently applied flag id, or null when the transaction is unflagged. */
  value: number | null
  flags: Flag[]
  triggerRef: React.RefObject<HTMLElement | null>
  onSelect: (flagId: number | null) => void
  onClose: () => void
  /**
   * Create a flag from here. Optional: the bulk-edit sheet has no `actions` to
   * hand down, and a picker without it simply falls back to pointing at
   * Settings, exactly as before.
   */
  onCreate?:
    | ((
        name: string,
        reimbursable: boolean,
      ) => Promise<number>)
    | undefined
}

export function FlagPickerPopover({ value, flags, triggerRef, onSelect, onClose, onCreate }: Props) {
  const popoverRef = useRef<HTMLDivElement>(null)
  const pos = usePopoverPosition(triggerRef, popoverRef)
  const motion = usePopoverMotion(pos)
  const options = selectableFlags(flags, value)
  const [creating, setCreating] = useState(false)

  useFocusTrap(popoverRef, onClose, motion.leaving)
  useDismissOnOutsidePointer(popoverRef, !motion.leaving, onClose, triggerRef)

  const choose = (flagId: number | null) => {
    onSelect(flagId)
    onClose()
  }

  return (
    <PopoverFrame popoverRef={popoverRef} pos={pos} motion={motion} classes={styles} label="Choose a flag">
      <FlagOptionList value={value} options={options} choose={choose} />
      {onCreate ? (
        creating ? (
          <QuickCreateFlag flags={flags} onCreate={onCreate} onCreated={choose} onCancel={() => setCreating(false)} />
        ) : (
          <button type="button" className={styles.newFlag} onClick={() => setCreating(true)}>
            + New flag
          </button>
        )
      ) : options.length === 0 ? (
        <p className={styles.empty}>No flags to choose from. Add one under Settings &rarr; Flags.</p>
      ) : null}
    </PopoverFrame>
  )
}
