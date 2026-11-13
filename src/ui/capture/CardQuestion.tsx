import { useState } from 'react'
import type { Account } from '../../types'
import type { SeedCard } from '../actions'
import { otherCardsOf, useCardLinks } from './cardLinks'
import styles from './Review.module.css'

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

  const others = picked === null ? [] : otherCardsOf(links, picked, card)
  return (
    <fieldset className={styles.question}>
      <legend className={styles.questionTitle}>Which account is the card ending {card.digits}?</legend>
      <select
        aria-label={`Account for the card ending ${card.digits}`}
        className={styles.questionSelect}
        value={picked ?? ''}
        onChange={(e) => {
          const id = e.target.value === '' ? null : Number(e.target.value)
          setPicked(id)
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
                {also.length > 0 ? ` (also has card ending ${also.join(', ')})` : ''}
              </option>
            )
          })}
      </select>
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
