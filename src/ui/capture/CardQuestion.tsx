import { useEffect, useRef, useState } from 'react'
import type { Account } from '../../types'
import type { SeedCard } from '../actions'
import { otherCardsOf, useCardLinks } from './cardLinks'
import styles from './Review.module.css'

/** Hands the form a way to show this question's message and move the cursor here, outside render. */
function offerAsk(card: SeedCard, ask: (() => boolean) | undefined) {
  card.ask = ask
}

/** What the form can ask of the question: show its message and move the cursor into it. */
function useAsk(card: SeedCard) {
  const [missing, setMissing] = useState(false)
  const select = useRef<HTMLSelectElement>(null)
  useEffect(() => {
    offerAsk(card, () => {
      // Only says it did when the question is on screen. Without the select (the form shows another view) the form says it.
      if (!select.current) return false
      setMissing(true)
      select.current.focus()
      select.current.scrollIntoView?.({ block: 'center' })
      return true
    })
    // Gone with the question: the form must not hand the message to something that is not there.
    return () => offerAsk(card, undefined)
  }, [card])
  return { missing, setMissing, select }
}

/** Writes the answer where the form's save reads it, outside render. */
function answer(card: SeedCard, patch: Partial<SeedCard['answer']>) {
  Object.assign(card.answer, patch)
}

/**
 * Asks which account a card is the first time its payments show up, and offers to remember the answer. Nothing is
 * chosen for the person. An account that has a card already says so, and choosing it adds this card without touching
 * the old one, since a bank reissues a card and the old one can still appear on subscriptions and refunds.
 */
export default function CardQuestion({ card, accounts, onPick }: { card: SeedCard; accounts: readonly Account[]; onPick: (id: number) => void }) {
  const links = useCardLinks()
  const [picked, setPicked] = useState<number | null>(null)
  const [remember, setRemember] = useState(true)
  const { missing, setMissing, select } = useAsk(card)

  const others = picked === null ? [] : otherCardsOf(links, picked, card)
  return (
    <fieldset className={styles.question}>
      <legend className={styles.questionTitle}>Which account is the card ending {card.digits}?</legend>
      <select
        ref={select}
        aria-label={`Account for the card ending ${card.digits}`}
        className={styles.questionSelect}
        value={picked ?? ''}
        onChange={(e) => {
          const id = e.target.value === '' ? null : Number(e.target.value)
          setPicked(id)
          setMissing(false)
          answer(card, { accountId: id })
          if (id !== null) onPick(id)
        }}
      >
        <option value="">Pick an account</option>
        {accounts
          .filter((a) => a.active)
          .map((a) => {
            const also = otherCardsOf(links, a.id, card)
            return (
              <option key={a.id} value={a.id}>
                {a.name}
                {also.length > 0 ? ` (also card ${also.join(', ')})` : ''}
              </option>
            )
          })}
      </select>
      {missing ? (
        <p role="alert" className={styles.error}>
          {card.unanswered}
        </p>
      ) : null}
      <label className={styles.questionRemember}>
        <input
          type="checkbox"
          checked={remember}
          onChange={(e) => {
            setRemember(e.target.checked)
            answer(card, { remember: e.target.checked })
          }}
        />
        Remember this card
      </label>
      {remember && others.length > 0 ? (
        <p className={styles.hint}>
          This adds the card ending {card.digits} and keeps the one ending {others.join(', ')}. Remove the old one in Settings when it is no longer used.
        </p>
      ) : null}
    </fieldset>
  )
}
