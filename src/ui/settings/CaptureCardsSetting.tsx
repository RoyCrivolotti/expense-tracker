import { useCallback, useEffect, useState } from 'react'
import { fetchCardLinks, unlinkCard, type CardLink, type CardLinks, type CardSource } from '../../data/captureCardsApi'
import { announceRecommendationsChanged } from '../../data/recommendationsApi'
import { ConfirmSheet } from '../components/ConfirmSheet'
import { Card, SectionTitle } from '../components/primitives'
import tabStyles from '../tabs/tabs.module.css'
import type { ExpenseModel } from '../useExpenseData'
import styles from './CaptureKeySetting.module.css'

const SOURCE_NAME: Record<string, string> = { iberia: 'Iberia', santander: 'Santander' }

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong'
}

/** The links, and the cards payments are waiting on. Removing a link reads the list again and tells the review card. */
function useCardLinkList() {
  const [found, setFound] = useState<CardLinks | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let current = true
    fetchCardLinks().then(
      (links) => current && setFound(links),
      (e: unknown) => current && setError(messageOf(e)),
    )
    return () => {
      current = false
    }
  }, [version])

  const remove = useCallback(async (link: CardLink) => {
    setBusy(true)
    setError(null)
    try {
      await unlinkCard(link)
      announceRecommendationsChanged()
      setVersion((v) => v + 1)
    } catch (e) {
      setError(messageOf(e))
    } finally {
      setBusy(false)
    }
  }, [])
  return { found, error, busy, remove }
}

const cardName = (c: { source: CardSource; digits: string; digitsKind?: 'card' | 'account' }) =>
  `${SOURCE_NAME[c.source] ?? c.source} ${c.digitsKind === 'account' ? 'account' : 'card'} ending ${c.digits}`

/**
 * Which account each bank card is, so a captured payment arrives with its account. Several cards can point at one
 * account (a bank reissues a card and the old one can still turn up), and nothing here replaces one: removing the old
 * link is a choice made on this list.
 */
export function CaptureCardsSetting({ model }: { model: ExpenseModel }) {
  const { found, error, busy, remove } = useCardLinkList()
  const [removing, setRemoving] = useState<CardLink | null>(null)
  const waiting = found?.waiting ?? []
  return (
    <>
      <SectionTitle>Linked cards</SectionTitle>
      <Card>
        <div className={tabStyles.settingGroup}>
          <p className={tabStyles.settingHint}>
            The first time a card shows up in a captured payment you are asked which account it is, and it is remembered
            here. A new card for the same account is added beside the old one.
          </p>
          {error ? (
            <p className={tabStyles.settingError} role="alert">
              {error}
            </p>
          ) : null}
          {waiting.length > 0 ? (
            <p className={tabStyles.settingHint} role="status">
              {waiting.length === 1 ? '1 card is' : `${waiting.length} cards are`} waiting for an account:{' '}
              {waiting.map((w) => `${cardName(w)} (${w.count === 1 ? '1 payment' : `${w.count} payments`})`).join(', ')}.
            </p>
          ) : null}
          {found && found.cards.length === 0 ? <p className={tabStyles.settingHint}>No cards linked yet.</p> : null}
          <ul className={styles.list}>
            {(found?.cards ?? []).map((link) => (
              <li key={`${link.source}:${link.digitsKind}:${link.digits}`} className={styles.row}>
                <span className={styles.name}>
                  <span className={styles.label}>{cardName(link)}</span>
                  <span className={styles.meta}>{model.lookup.account(link.accountId)?.name ?? 'An account that was deleted'}</span>
                </span>
                <button type="button" className={styles.revoke} disabled={busy} aria-label={`Remove ${cardName(link)}`} onClick={() => setRemoving(link)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      </Card>
      {removing ? (
        <ConfirmSheet
          title={`Remove ${cardName(removing)}?`}
          message="Its payments that are waiting will need an account again. The card is linked again the next time you answer for it."
          confirmLabel="Remove"
          destructive
          onCancel={() => setRemoving(null)}
          onConfirm={() => {
            const target = removing
            setRemoving(null)
            void remove(target)
          }}
        />
      ) : null}
    </>
  )
}
