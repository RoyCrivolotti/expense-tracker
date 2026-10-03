import { useEffect, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import type { GoalScenario } from '../../../../types'
import type { NewGoalScenario } from '../../../../data/dataSource'
import { ColorSwatchPicker } from '../../../components/ColorSwatchPicker'
import { Presence } from '../../../components/Presence'
import { EXIT_MS } from '../../../hooks/motion'
import { useFocusTrap } from '../../../hooks/useFocusTrap'
import { useMediaQuery } from '../../../hooks/useMediaQuery'
import { usePopoverMotion } from '../../../hooks/usePopoverMotion'
import { usePopoverPosition } from '../../../hooks/usePopoverPosition'
import { useDismissOnOutsidePointer } from '../../../charts/useDismissOnOutsidePointer'
import goalStyles from '../goals.module.css'
import styles from './planDesktop.module.css'

export interface ScenarioMenuActions {
  onPatch: (patch: Partial<NewGoalScenario>) => void
  onActivate: () => void
  onDuplicate: () => void
  onDelete: () => void
  /** Saves the draft as a new scenario with this name. */
  onSaveAsNew: (name: string) => void
  /** Cuts the edits loose from the loaded scenario, keeping them as the unsaved draft. */
  onKeepAsDraft: () => void
}

interface PopoverProps extends ScenarioMenuActions {
  triggerRef: RefObject<HTMLButtonElement | null>
  draft: NewGoalScenario
  /** The saved scenario in the editor; null while the draft is detached. */
  activeScenario: GoalScenario | null
  dirty: boolean
  onClose: () => void
}

function SaveAsNew({ name, onSave, onCancel }: { name: string; onSave: (name: string) => void; onCancel: () => void }) {
  const [copyName, setCopyName] = useState(`${name} copy`)
  return (
    <div className={styles.menuRow}>
      <input
        className={`${goalStyles.renameInput} ${styles.menuInput}`}
        value={copyName}
        aria-label="Name for new scenario"
        autoFocus
        onChange={(e) => setCopyName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Escape') return
          // Cancels this input only, not the whole menu.
          e.stopPropagation()
          onCancel()
        }}
      />
      <button
        type="button"
        className={`${goalStyles.btn} ${styles.menuBtn}`}
        disabled={copyName.trim().length === 0}
        onClick={() => onSave(copyName.trim())}
      >
        Save as new
      </button>
    </div>
  )
}

function MenuPopover(props: PopoverProps) {
  const { triggerRef, draft, activeScenario, dirty, onClose } = props
  const popoverRef = useRef<HTMLDivElement>(null)
  const pos = usePopoverPosition(triggerRef, popoverRef)
  const motion = usePopoverMotion(pos)
  const [saveAsNew, setSaveAsNew] = useState(false)
  // Escape hands focus back to the button the menu came from. Safari does not focus a button when
  // it is clicked, so the trap's own restore (to whatever had focus when the menu opened) would
  // leave focus on the page.
  const escape = () => {
    onClose()
    triggerRef.current?.focus()
  }
  useFocusTrap(popoverRef, escape, motion.leaving)
  useDismissOnOutsidePointer(popoverRef, !motion.leaving, onClose, triggerRef)
  // The menu is hidden until it has been placed, and a hidden element cannot take focus, so the
  // trap's focus on mount does not land. It goes to the name once the menu is on screen, which
  // is what most people open it to change.
  const placed = pos !== null
  const nameField = useRef<HTMLInputElement>(null)
  // On a touch screen focus in the name raises the keyboard over half of the page every time the
  // menu opens, whatever it was opened for. There the menu itself takes focus, and the name is a tap away.
  const touch = useMediaQuery('(pointer: coarse)')
  useEffect(() => {
    if (placed) (touch ? popoverRef : nameField).current?.focus()
  }, [placed, touch])

  // Each action that leaves the menu has done its work by then.
  const then = (action: () => void) => () => {
    action()
    onClose()
  }

  return createPortal(
    <div
      ref={popoverRef}
      className={motion.leaving ? `${styles.menu} ${styles.menuLeaving}` : styles.menu}
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
      aria-label="Scenario options"
      tabIndex={-1}
    >
      <div className={styles.menuRow}>
        <ColorSwatchPicker color={draft.color} onChange={(color) => props.onPatch({ color })} label="Scenario color" />
      </div>
      <input
        ref={nameField}
        className={`${goalStyles.renameInput} ${styles.menuInput}`}
        value={draft.name}
        aria-label="Scenario name"
        placeholder="Scenario name"
        onChange={(e) => props.onPatch({ name: e.target.value })}
      />
      {activeScenario ? (
        <ul className={styles.menuList}>
          <li>
            {activeScenario.isActive ? (
              <span className={styles.menuNote}>This is your current plan</span>
            ) : (
              <button type="button" className={styles.menuItem} onClick={then(props.onActivate)}>
                Use as my plan
              </button>
            )}
          </li>
          <li>
            <button type="button" className={styles.menuItem} onClick={then(props.onDuplicate)}>
              Duplicate
            </button>
          </li>
          {dirty ? (
            <li>
              <button type="button" className={styles.menuItem} onClick={then(props.onKeepAsDraft)}>
                Keep these edits as a draft
              </button>
            </li>
          ) : null}
          <li>
            {saveAsNew ? (
              <SaveAsNew
                name={draft.name}
                onSave={(name) => {
                  props.onSaveAsNew(name)
                  onClose()
                }}
                onCancel={() => setSaveAsNew(false)}
              />
            ) : (
              <button type="button" className={styles.menuItem} onClick={() => setSaveAsNew(true)}>
                Save as new scenario…
              </button>
            )}
          </li>
          <li>
            <button type="button" className={`${styles.menuItem} ${styles.menuDanger}`} onClick={then(props.onDelete)}>
              Delete
            </button>
          </li>
        </ul>
      ) : null}
    </div>,
    document.body,
  )
}

/** The scenario's own settings and what can be done with it, from one button at the end of the row. */
export function ScenarioMenu(props: Omit<PopoverProps, 'triggerRef' | 'onClose'>) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        className={styles.menuTrigger}
        aria-label="Scenario options"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span aria-hidden>⋯</span>
      </button>
      <Presence show={open} exitMs={EXIT_MS.popover}>
        <MenuPopover {...props} triggerRef={triggerRef} onClose={() => setOpen(false)} />
      </Presence>
    </>
  )
}
