import type { ReactNode } from 'react'
import type { LeverKey } from '../../../../engine'
import { LEVER_SPECS } from '../leverFields'
import type { StarredLevers } from '../useStarredLevers'
import { StarButton } from './StarButton'
import styles from './planDesktop.module.css'

/** Why the star on an input that is not in the bar cannot be pressed, while the bar can be changed. */
function whyNot(starred: StarredLevers): string | undefined {
  return starred.canAdd ? undefined : 'The bar holds five. Take one out of it first.'
}

/**
 * An input in the inputs panel with the star that moves it to the bar, hung in the gutter beside
 * it so the field itself is the one the phone has. The input is out of the panel once it is starred.
 * Where the bar cannot be changed (a session that cannot save) there is no star: the bar shows no
 * stars either, and a row of buttons that do nothing is a row of stops for the keyboard.
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
  if (!starred.canEdit) return <>{children}</>
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
