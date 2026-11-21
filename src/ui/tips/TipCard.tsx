import { useRef, useState, type ReactNode } from 'react'
import { Presence } from '../components/Presence'
import { EXIT_MS, exitVars } from '../hooks/motion'
import { useExit } from '../hooks/usePresence'
import { moveFocusPast } from './moveFocusPast'
import { useTips } from './tipsContext'
import styles from './TipCard.module.css'

interface Props {
  /** Which tip this is: what is saved on the account when it is put away. */
  id: string
  title: string
  /** The words on the button that puts it away. */
  actionLabel?: string
  /** Pressing the button runs this first, for a card whose button also does something (it is put away either way). */
  onAction?: () => void
  /** Shows only while this holds. The card stays mounted, so it folds open when the data arrives. */
  when?: boolean
  children: ReactNode
}

/**
 * A tinted card at the top of a page that says one thing once. It stays until it is put away on the account, so a person who
 * glanced and left finds it again, and then it is gone on every device.
 *
 * It folds shut over `EXIT_MS.fold` and is `inert` while it does. One that is there when the page first draws does not
 * animate in; one that comes back after being hidden, while the page is open, folds open.
 */
export function TipCard(props: Props) {
  const shown = useTips().isShown(props.id) && (props.when ?? true)
  // True once the card has been absent at any point since the page drew it, which is what makes its next showing an arrival.
  const [wasAbsent, setWasAbsent] = useState(!shown)
  if (!shown && !wasAbsent) setWasAbsent(true)
  return (
    <Presence show={shown} exitMs={EXIT_MS.fold}>
      <TipCardBody {...props} arriving={wasAbsent} />
    </Presence>
  )
}

function TipCardBody({ id, title, actionLabel = 'Got it', onAction, children, arriving }: Props & { arriving: boolean }) {
  const { dismiss } = useTips()
  const { leaving, exitMs } = useExit()
  const card = useRef<HTMLElement>(null)
  const classes = [styles.fold, arriving ? styles.arriving : '', leaving ? styles.leaving : ''].filter(Boolean).join(' ')
  return (
    <div className={classes} style={exitVars(leaving, exitMs)} inert={leaving}>
      <div className={styles.foldInner}>
        <section ref={card} className={styles.card} aria-label={title}>
          <h2 className={styles.title}>{title}</h2>
          <div className={styles.body}>{children}</div>
          <button
            type="button"
            className={styles.action}
            onClick={() => {
              moveFocusPast(card.current)
              onAction?.()
              dismiss(id)
            }}
          >
            {actionLabel}
          </button>
        </section>
      </div>
    </div>
  )
}
