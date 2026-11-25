import { useRef, useState, type MouseEvent } from 'react'
import { useMediaQuery } from '../../../hooks/useMediaQuery'
import styles from './planDesktop.module.css'

interface TypedProps {
  label: string
  /** The value as the field writes it. The field shows this whenever it is not being typed in. */
  text: string
  unit: string
  /** The unit comes before the digits, as a dollar sign does, instead of after them. */
  unitFirst?: boolean
  /** Called on blur and on Enter, with what was typed, and only if something was. */
  onCommit: (raw: string) => void
  inputMode: 'decimal' | 'numeric'
}

/**
 * The lever's big number: a field that reads as text until it is hovered or focused.
 *
 * What is typed is kept apart from the value. A field that was only tabbed through has typed
 * nothing, so it commits nothing: committing its text would write the value back as the field
 * shows it, and a percentage shown to one decimal would lose the second one it was given. After
 * a commit the field reads the value again, so input that was refused or clamped does not stay in it.
 */
export function TypedValue({ label, text, unit, unitFirst = false, onCommit, inputMode }: TypedProps) {
  const [typed, setTyped] = useState<string | null>(null)
  const field = useRef<HTMLInputElement>(null)
  // On a touch screen a tap puts the caret at the end, and the way to replace a figure is a long
  // press and Select All or a dozen backspaces: the figure is selected as it takes focus instead.
  const touch = useMediaQuery('(pointer: coarse)')
  const shown = typed ?? text
  const commit = () => {
    if (typed === null) return
    setTyped(null)
    onCommit(typed)
  }
  // The label's own focus is replaced by this one: Chromium reveals a field focused that way by
  // where the field is in the page, not where the bar is held, so a click on a figure's unit
  // scrolled the page by 309px at 1280x800 with the bar already on screen. A click on the digits
  // is the field's own and never scrolled.
  const focusField = (event: MouseEvent<HTMLLabelElement>) => {
    if (event.target === field.current) return
    event.preventDefault()
    field.current?.focus({ preventScroll: true })
  }
  const unitText = <span className={styles.leverUnit}>{unit}</span>
  return (
    // A label, so a tap or a click anywhere on the figure's row (not only on its digits) puts the
    // cursor in the field. The input names itself, so the unit inside does not add to the name.
    <label className={styles.leverValue} onClick={focusField}>
      {unitFirst ? unitText : null}
      <input
        ref={field}
        className={unitFirst ? `${styles.leverInput} ${styles.leverInputAfterUnit}` : styles.leverInput}
        type="text"
        inputMode={inputMode}
        aria-label={label}
        value={shown}
        style={{ width: `${Math.max(2, shown.length) + 0.5}ch` }}
        onChange={(e) => setTyped(e.target.value)}
        onFocus={(e) => {
          // After the tap has finished placing the caret, which would otherwise undo it.
          const field = e.currentTarget
          if (touch) setTimeout(() => field.select(), 0)
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          // Escape drops what was typed; the blur that follows then has nothing to commit.
          if (e.key === 'Escape') setTyped(null)
        }}
      />
      {unitFirst ? null : unitText}
    </label>
  )
}
