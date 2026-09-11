import type { Flag } from '../../types'
import { FlagIcon } from '../icons'
import styles from './FlagGlyph.module.css'

/**
 * The flag marker on a transaction row. Display-only on purpose: rows render as
 * a <button> (or a <label> in select mode), so anything interactive here would
 * nest a control inside a control. Flagging happens in the editor, the batch
 * bar, or the Flagged card.
 */
export function FlagGlyph({
  flag,
  className,
  /**
   * Set where the flag's name is already rendered next to the glyph — otherwise
   * a screen reader announces "Flagged: Work travel, Work travel".
   */
  decorative,
}: {
  flag: Flag
  className?: string | undefined
  decorative?: boolean
}) {
  return (
    <span
      className={`${styles.glyph} ${className ?? ''}`}
      style={{ color: flag.color }}
      title={flag.description ? `${flag.name} — ${flag.description}` : flag.name}
      {...(decorative
        ? { 'aria-hidden': true }
        : { 'aria-label': `Flagged: ${flag.name}`, role: 'img' })}
    >
      <FlagIcon fill="currentColor" strokeWidth={1.5} />
    </span>
  )
}
