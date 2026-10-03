import type { ReactNode } from 'react'
import type { LeverKey } from '../../../../engine'
import { LEVER_SPECS } from '../leverFields'
import type { StarredLevers } from '../useStarredLevers'
import { StarButton } from './StarButton'
import styles from './planDesktop.module.css'

/** Why the star on an input that is not in the bar cannot be pressed. */
function whyNot(starred: StarredLevers): string | undefined {
  if (!starred.canEdit) return 'Read-only session'
  if (!starred.canAdd) return 'The bar holds five. Take one out of it first.'
  return undefined
}

/**
 * An input in the inputs panel with the star that moves it to the bar, hung in the gutter beside
 * it so the field itself is the one the phone has. The input is out of the panel once it is starred.
 */
export function Starrable({
  leverKey,
  starred,
  children,
}: {
  leverKey: LeverKey
  starred: StarredLevers
  children: ReactNode
}) {
  const reason = whyNot(starred)
  return (
    <div className={styles.starrable}>
      <StarButton
        filled={false}
        label={`Add ${LEVER_SPECS[leverKey].short} to the bar`}
        disabled={reason !== undefined}
        {...(reason ? { title: reason } : {})}
        onClick={() => starred.toggle(leverKey)}
      />
      {children}
    </div>
  )
}
