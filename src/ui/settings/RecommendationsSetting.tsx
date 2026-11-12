import { Card, SectionTitle } from '../components/primitives'
import { Money } from '../components/Money'
import { shortDayLabel } from '../format'
import type { RecommendationInfo } from '../../data/recommendationsApi'
import type { Transaction } from '../../types'
import type { ExpenseActions } from '../actions'
import type { ExpenseModel } from '../useExpenseData'
import { entryFor, foreignAmountText, groupByDay, isForeign, seedOf, warningsOf } from './recommendationRows'
import styles from './RecommendationsSetting.module.css'
import { useRecommendations } from './useRecommendations'

function timeOf(rec: RecommendationInfo): string {
  return new Date(rec.occurredAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

/** In euros when the push was, else in its own currency, so a foreign amount is never read as euros. */
function Amount({ rec }: { rec: RecommendationInfo }) {
  if (rec.amountCents === null) return null
  if (isForeign(rec)) return <span>{foreignAmountText(rec)}</span>
  return <Money cents={rec.amountCents} type={rec.suggestedType ?? undefined} />
}

interface DecideProps {
  rec: RecommendationInfo
  typed: Transaction | null
  busy: boolean
  onDismiss: (id: string) => void
  onLink: (id: string, transactionId: number) => void
}

/** Dismiss, and Link when one typed row fits. Only offered where the app can write. */
function Decide({ rec, typed, busy, onDismiss, onLink }: DecideProps) {
  return (
    <div className={styles.actions}>
      {typed ? (
        <>
          <span>Already entered as {typed.description || 'a typed row'}?</span>
          <button type="button" className={styles.quiet} disabled={busy} onClick={() => onLink(rec.id, typed.id)}>
            Link
          </button>
        </>
      ) : null}
      <button type="button" className={styles.quiet} disabled={busy} onClick={() => onDismiss(rec.id)}>
        Dismiss
      </button>
    </div>
  )
}

interface RowProps {
  rec: RecommendationInfo
  model: ExpenseModel
  actions: ExpenseActions | undefined
  busy: boolean
  onDismiss: (id: string) => void
  onLink: (id: string, transactionId: number) => void
}

function Row({ rec, model, actions, busy, onDismiss, onLink }: RowProps) {
  const warnings = warningsOf(rec)
  const typed = entryFor(rec, model.dataset.transactions)
  const account = rec.accountId !== null ? model.lookup.accountName(rec.accountId) : null
  const label = rec.merchantRaw?.trim() || rec.descriptionSuggested?.trim() || 'Payment'
  const body = (
    <>
      <span className={styles.text}>
        {label}
        <span className={styles.meta}>{[account, timeOf(rec)].filter(Boolean).join(' · ')}</span>
      </span>
      <Amount rec={rec} />
    </>
  )
  return (
    <li className={styles.row}>
      {actions ? (
        <button type="button" className={styles.open} onClick={() => actions.onAdd(seedOf(rec))}>
          {body}
        </button>
      ) : (
        <div className={styles.open}>{body}</div>
      )}
      {warnings.length ? (
        <div className={styles.chips}>
          {warnings.map((w) => (
            <span key={w} className={styles.chip}>
              {w}
            </span>
          ))}
        </div>
      ) : null}
      {actions ? <Decide rec={rec} typed={typed} busy={busy} onDismiss={onDismiss} onLink={onLink} /> : null}
    </li>
  )
}

/** Open recommendations, newest day first. Opening one fills the add form; nothing is an expense until it is saved. */
export function RecommendationsSetting({ model, actions }: { model: ExpenseModel; actions: ExpenseActions | undefined }) {
  const { items, hasMore, openCount, error, busy, more, retry, dismiss, link } = useRecommendations()
  const days = groupByDay(items ?? [])
  return (
    <>
      <SectionTitle>Captured payments</SectionTitle>
      <Card>
        {error ? (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        ) : null}
        {items === null ? (
          error ? (
            <button type="button" className={styles.quiet} onClick={() => void retry()}>
              Try again
            </button>
          ) : (
            <p className={styles.empty} aria-live="polite">
              Loading…
            </p>
          )
        ) : items.length === 0 ? (
          <p className={styles.empty} aria-live="polite">
            Nothing to review.
          </p>
        ) : (
          <div className={styles.list}>
            <p className={styles.meta}>{openCount === 1 ? '1 to review' : `${openCount} to review`}</p>
            {days.map((day) => (
              <div key={day.date}>
                <h3 className={styles.day}>{shortDayLabel(day.date)}</h3>
                <ul className={styles.rows}>
                  {day.rows.map((rec) => (
                    <Row
                      key={rec.id}
                      rec={rec}
                      model={model}
                      actions={actions}
                      busy={busy}
                      onDismiss={(id) => void dismiss(id)}
                      onLink={(id, t) => void link(id, t)}
                    />
                  ))}
                </ul>
              </div>
            ))}
            {hasMore ? (
              <button type="button" className={styles.quiet} disabled={busy} onClick={() => void more()}>
                Show more
              </button>
            ) : null}
          </div>
        )}
      </Card>
    </>
  )
}
