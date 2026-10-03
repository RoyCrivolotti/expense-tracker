import { useEffect, useLayoutEffect, useRef } from 'react'
import styles from './goals.module.css'

/** What can be done with edits to a saved scenario that have not been saved. */
export interface UnsavedActions {
  /** The scenario the edits are to. The buttons are named after it, since the scenario card
   *  above the controls has a Save and a Discard of its own. */
  name: string
  /** A save is in flight: Discard would put the editor back while the write still carries the edits. */
  saving: boolean
  onSave: () => void
  onDiscard: () => void
}

/**
 * Save and Discard for the edits to a saved scenario. Both take the group away (Discard at
 * once, Save when the write lands), and a browser sends focus to the page when the button that
 * has it goes, so a keyboard viewer would start again from the top. `onGone` is called as the
 * group leaves with focus in it, or having just lost it to the buttons being disabled for the
 * write, so it can be put somewhere nearby. If the write fails the buttons come back, and
 * focus with them.
 */
export function UnsavedGroup({
  unsaved,
  onGone,
  className = styles.unsavedActions,
  saveLabel = 'Save',
}: {
  unsaved: UnsavedActions
  onGone: () => void
  /** The frame it sits in: the phone's section row has its own, the wide screen's scenario row another. */
  className?: string | undefined
  /** What the button says: the phone's row is narrow and keeps the short word, the wide row has room. */
  saveLabel?: string
}) {
  const group = useRef<HTMLDivElement>(null)
  const hadFocus = useRef(false)
  const lastFocused = useRef<EventTarget | null>(null)

  useEffect(() => {
    if (unsaved.saving || !hadFocus.current || document.activeElement !== document.body) return
    if (lastFocused.current instanceof HTMLElement) lastFocused.current.focus()
  }, [unsaved.saving])

  // A layout effect's cleanup runs before the group's nodes are removed, while the button
  // that has focus still does.
  useLayoutEffect(() => {
    const el = group.current
    return () => {
      const focused = document.activeElement
      if (el?.contains(focused) || (hadFocus.current && focused === document.body)) onGone()
    }
  }, [onGone])

  // A scenario with no name cannot be saved (the service refuses it too); it is the edits that
  // are the problem, so Discard stays.
  const unnamed = unsaved.name.trim().length === 0
  return (
    <div
      ref={group}
      role="group"
      aria-label="Unsaved changes"
      className={className}
      onFocus={(event) => {
        hadFocus.current = true
        lastFocused.current = event.target
      }}
      onBlur={(event) => {
        // Disabling the button that has focus blurs it too, which is not the viewer moving on.
        const disabled = event.target instanceof HTMLButtonElement && event.target.disabled
        if (!disabled) hadFocus.current = false
      }}
    >
      <button
        type="button"
        className={styles.btn}
        aria-label="Discard changes"
        disabled={unsaved.saving}
        onClick={unsaved.onDiscard}
      >
        Discard
      </button>
      <button
        type="button"
        className={`${styles.btn} ${styles.btnPrimary}`}
        aria-label={unnamed ? 'Save changes' : `Save changes to ${unsaved.name}`}
        {...(unnamed ? { title: 'Give the scenario a name to save it' } : {})}
        disabled={unsaved.saving || unnamed}
        onClick={unsaved.onSave}
      >
        {saveLabel}
      </button>
    </div>
  )
}
