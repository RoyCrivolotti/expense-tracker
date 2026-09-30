import type { Label } from '../../types'
import styles from './LabelGlyph.module.css'

/**
 * The label marker next to its own name in a settings row — a plain colour
 * dot, unlike FlagGlyph's icon: a label has no equivalent to a flag's pole,
 * and several of these can appear side by side on a transaction (see
 * LabelChip), where an icon per chip would be busier than the name needs.
 */
export function LabelGlyph({
  label,
  className,
  /**
   * Set where the label's name is already rendered next to the glyph —
   * otherwise a screen reader announces "Label: Japan trip, Japan trip".
   */
  decorative,
}: {
  label: Label
  className?: string | undefined
  decorative?: boolean
}) {
  return (
    <span
      className={`${styles.dot} ${className ?? ''}`}
      style={{ color: label.color }}
      title={label.description ? `${label.name} — ${label.description}` : label.name}
      {...(decorative ? { 'aria-hidden': true } : { 'aria-label': `Label: ${label.name}`, role: 'img' })}
    />
  )
}
