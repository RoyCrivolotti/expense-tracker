import { useEffect, type ReactNode } from 'react'
import { TIP_IDS } from '../../domain/onboarding/tips'
import { needsOnboarding } from '../../domain/onboarding/needsOnboarding'
import type { ExpenseActions } from '../actions'
import type { ExpenseModel } from '../useExpenseData'
import { useGuide } from '../guide/guideContext'
import { homeScreenAdvice } from './homeScreen'
import { TipCard } from './TipCard'
import { useTips } from './tipsContext'
import styles from './GettingStartedCard.module.css'

interface Props {
  /** Categories and accounts exist. */
  setUp: boolean
  /** The account has a payment. */
  hasPayment: boolean
  /** Older payments are in: the account holds more than one month. */
  imported: boolean
  /** Opens the form for a new payment. */
  onAddPayment: () => void
  /** Opens Settings on Data, where an older file is brought in. */
  onImport: () => void
}

const HOME_SCREEN_LINE = {
  ios: 'Put it on your Home Screen: in Safari, tap Share, then Add to Home Screen.',
  android: 'Put it on your Home Screen: open the browser menu and choose Install app.',
} as const

function Line({ done, children }: { done: boolean; children: ReactNode }) {
  return (
    <li className={styles.line}>
      <span className={done ? `${styles.mark} ${styles.done}` : styles.mark} aria-hidden>
        {done ? '✓' : ''}
      </span>
      <span className={styles.text}>
        <span className={styles.srOnly}>{done ? 'Done: ' : 'To do: '}</span>
        {children}
      </span>
    </li>
  )
}

/**
 * The short list on the Dashboard of a new person: what is done and the few things for the first week. It holds pointers
 * only, and goes when the person hides it or when every line is done. The Home Screen line can only be done by being in the
 * installed app (where it is not shown), so in a phone browser it stays until the person hides the card.
 */
export function GettingStartedCard({ setUp, hasPayment, imported, onAddPayment, onImport }: Props) {
  const homeScreen = homeScreenAdvice()
  const { isShown, dismiss } = useTips()
  const guide = useGuide()
  const finished = setUp && hasPayment && imported && !homeScreen
  useEffect(() => {
    if (finished && isShown(TIP_IDS.gettingStarted)) dismiss(TIP_IDS.gettingStarted)
  }, [finished, isShown, dismiss])
  return (
    <TipCard
      id={TIP_IDS.gettingStarted}
      title="Getting started"
      actionLabel="Hide"
      secondary={
        guide ? (
          <button type="button" className={styles.guideLink} onClick={guide.open}>
            Read the guide
          </button>
        ) : undefined
      }
    >
      <ul className={styles.list}>
        <Line done={setUp}>Set up your categories and accounts</Line>
        <Line done={hasPayment}>
          Add your first payment
          {!hasPayment && (
            <>
              {' '}
              <button type="button" className={styles.link} onClick={onAddPayment}>
                Add a payment
              </button>
            </>
          )}
        </Line>
        {homeScreen && <Line done={false}>{HOME_SCREEN_LINE[homeScreen]}</Line>}
        <Line done={imported}>
          Bring in older payments{' '}
          {!imported && (
            <button type="button" className={styles.link} onClick={onImport}>
              Open Import
            </button>
          )}
        </Line>
      </ul>
    </TipCard>
  )
}

/** The card on the Dashboard: absent where nothing can be acted on (no actions, as in a read-only session). */
export function DashboardGettingStarted({
  model,
  actions,
  onOpenImport,
}: {
  model: ExpenseModel
  actions: ExpenseActions | undefined
  onOpenImport: (() => void) | undefined
}) {
  if (!actions || !onOpenImport) return null
  return (
    <GettingStartedCard
      setUp={!needsOnboarding(model.dataset)}
      hasPayment={model.months.length > 0}
      imported={model.months.length > 1}
      onAddPayment={actions.onAdd}
      onImport={onOpenImport}
    />
  )
}
