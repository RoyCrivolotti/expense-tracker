import { useRef, useState } from 'react'
import type { Label } from '../../types'
import { EXIT_MS } from '../hooks/motion'
import { useToggleIds } from '../hooks/useToggleIds'
import { LabelPickerPopover } from './LabelPickerPopover'
import { Presence } from './Presence'
import styles from './FlagField.module.css'

interface Props {
  labels: Label[]
  value: number[]
  onChange: (labelIds: number[]) => void
  /** See FlagField — the popover portals out of the Modal and runs its own focus trap. */
  onTrapPausedChange?: ((paused: boolean) => void) | undefined
  /** Passed straight through; see LabelPickerPopover. */
  onCreate?: ((name: string) => Promise<number>) | undefined
}

function triggerText(value: number[]): string {
  if (value.length === 0) return 'No labels'
  if (value.length === 1) return '1 label'
  return `${value.length} labels`
}

/**
 * Multi-select sibling of FlagField — see LabelPickerPopover for why this is
 * a separate component rather than a shared one parameterized on arity.
 *
 * Compact-only: the one place this is used today is the edit sheet's chip
 * row, the same as FlagField's `compact` mode. A full-width variant can be
 * added if a future caller needs one, rather than carrying an unused branch
 * now.
 */
export function LabelField({ labels, value, onChange, onTrapPausedChange, onCreate }: Props) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)

  const setOpenState = (next: boolean) => {
    setOpen(next)
    onTrapPausedChange?.(next)
  }

  const toggle = useToggleIds(value, onChange)

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        className={styles.triggerCompact}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpenState(!open)}
      >
        <span className={styles.name}>{triggerText(value)}</span>
      </button>
      <Presence show={open} exitMs={EXIT_MS.popover}>
        <LabelPickerPopover
          value={value}
          labels={labels}
          triggerRef={triggerRef}
          onToggle={toggle}
          onClose={() => setOpenState(false)}
          {...(onCreate ? { onCreate } : {})}
        />
      </Presence>
    </>
  )
}
