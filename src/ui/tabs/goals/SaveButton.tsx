import { useId, type ReactNode } from 'react'
import { useToast } from '../../hooks/useToast'
import styles from './goals.module.css'

/** Why a scenario with no name cannot be saved. */
export const NAME_HINT = 'Give the scenario a name to save it'

interface SaveButtonProps {
  /** The scenario has no name to save under. */
  unnamed: boolean
  /** Off for another reason (a save in flight, nothing to save), which has nothing to explain. */
  disabled?: boolean
  className: string | undefined
  onSave: () => void
  'aria-label'?: string
  children: ReactNode
}

/**
 * A Save that cannot be pressed for want of a name, and says so when it is. A disabled button
 * swallows a tap, a click and the pointer, so it would be silent to a finger and to a mouse; this
 * one stays enabled to them, is marked `aria-disabled`, looks off, and answers with the reason:
 * a toast for a tap, a click or a key, and a tooltip for a pointer that hovers. A screen reader
 * gets the same words as the button's description, from a span nobody sees. Nothing is written
 * into the layout, so nothing moves when the name is cleared.
 */
export function SaveButton({ unnamed, disabled = false, className, onSave, children, ...rest }: SaveButtonProps) {
  const { showToast } = useToast()
  const reasonId = useId()
  // Off for another reason, `disabled` says it all and the name is not what is in the way.
  const explaining = unnamed && !disabled
  return (
    <>
      {explaining ? (
        <span id={reasonId} className={styles.srOnly}>
          {NAME_HINT}
        </span>
      ) : null}
      <button
        type="button"
        className={className}
        {...rest}
        disabled={disabled}
        {...(explaining ? { 'aria-disabled': true, 'aria-describedby': reasonId, title: NAME_HINT } : {})}
        onClick={explaining ? () => showToast(NAME_HINT) : onSave}
      >
        {children}
      </button>
    </>
  )
}
