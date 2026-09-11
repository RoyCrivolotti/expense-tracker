import { useRef } from 'react'
import { createPortal } from 'react-dom'
import type { Flag } from '../../types'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { useDismissOnOutsidePointer } from '../charts/useDismissOnOutsidePointer'
import { usePopoverPosition } from '../hooks/usePopoverPosition'
import { FlagIcon } from '../icons'
import { selectableFlags } from './flagPickerOptions'
import styles from './FlagPicker.module.css'

interface Props {
  /** Currently applied flag id, or null when the transaction is unflagged. */
  value: number | null
  flags: Flag[]
  triggerRef: React.RefObject<HTMLElement | null>
  onSelect: (flagId: number | null) => void
  onClose: () => void
  /** Opens the flag editor; omitted where creating a flag isn't reachable. */
  onCreate?: (() => void) | undefined
}

export function FlagPickerPopover({ value, flags, triggerRef, onSelect, onClose, onCreate }: Props) {
  const popoverRef = useRef<HTMLDivElement>(null)
  const pos = usePopoverPosition(triggerRef, popoverRef)
  const options = selectableFlags(flags, value)

  useFocusTrap(popoverRef, onClose)
  useDismissOnOutsidePointer(popoverRef, true, onClose, triggerRef)

  const choose = (flagId: number | null) => {
    onSelect(flagId)
    onClose()
  }

  return createPortal(
    <div
      ref={popoverRef}
      className={styles.popover}
      style={{
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        visibility: pos ? 'visible' : 'hidden',
      }}
      role="dialog"
      aria-label="Choose a flag"
    >
      <ul className={styles.list}>
        <li>
          <button
            type="button"
            className={styles.option}
            onClick={() => choose(null)}
            aria-pressed={value === null}
          >
            <span className={`${styles.swatch} ${styles.swatchNone}`} aria-hidden />
            <span className={styles.optionBody}>
              <span className={styles.optionName}>No flag</span>
            </span>
            {value === null ? <span className={styles.tick} aria-hidden>✓</span> : null}
          </button>
        </li>
        {options.map((flag) => (
          <li key={flag.id}>
            <button
              type="button"
              className={styles.option}
              onClick={() => choose(flag.id)}
              aria-pressed={value === flag.id}
            >
              <span className={styles.swatch} style={{ color: flag.color }} aria-hidden>
                <FlagIcon fill="currentColor" strokeWidth={1.5} />
              </span>
              <span className={styles.optionBody}>
                <span className={styles.optionName}>
                  {flag.name}
                  {!flag.active ? <span className={styles.archived}> · archived</span> : null}
                </span>
                {flag.description ? (
                  <span className={styles.optionDesc}>{flag.description}</span>
                ) : null}
              </span>
              {value === flag.id ? <span className={styles.tick} aria-hidden>✓</span> : null}
            </button>
          </li>
        ))}
      </ul>
      {options.length === 0 ? (
        <p className={styles.empty}>
          No flags to choose from. Add one under Settings &rarr; Flags.
        </p>
      ) : null}
      {onCreate ? (
        <button
          type="button"
          className={styles.createBtn}
          onClick={() => {
            onClose()
            onCreate()
          }}
        >
          + New flag…
        </button>
      ) : null}
    </div>,
    document.body,
  )
}
