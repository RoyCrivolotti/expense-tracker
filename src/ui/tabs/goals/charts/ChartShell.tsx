import type { ReactNode } from 'react'
import { Card } from '../../../components/primitives'
import styles from '../goals.module.css'

/**
 * Container for a secondary Goals chart. Renders a standalone Card by default,
 * or a bare div when embedded inside the shared tabbed card so we never nest
 * cards (which would double the border/padding).
 */
export function ChartShell({
  embedded = false,
  children,
}: {
  embedded?: boolean
  children: ReactNode
}) {
  if (embedded) return <div className={styles.chartCard}>{children}</div>
  return <Card className={styles.chartCard}>{children}</Card>
}
