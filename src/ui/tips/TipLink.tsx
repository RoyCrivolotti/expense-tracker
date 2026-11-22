import { useContext, type ReactNode } from 'react'
import { PutAwayContext } from './tipsContext'
import styles from './TipLink.module.css'

/** The quiet second way out of a card: puts it away without doing what the main button does. Only inside a `TipCard`. */
export function TipLink({ children }: { children: ReactNode }) {
  const putAway = useContext(PutAwayContext)
  return (
    <button type="button" className={styles.link} onClick={putAway}>
      {children}
    </button>
  )
}
