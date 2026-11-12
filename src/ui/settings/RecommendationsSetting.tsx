import { Card, SectionTitle } from '../components/primitives'
import { Money } from '../components/Money'
import { shortDayLabel } from '../format'
import type { RecommendationInfo } from '../../data/recommendationsApi'
import type { ExpenseActions } from '../actions'
import type { ExpenseModel } from '../useExpenseData'
import { entryFor, seedOf, warningsOf } from './recommendationRows'
import styles from './RecommendationsSetting.module.css'
import { useRecommendations } from './useRecommendations'

function timeOf(rec: RecommendationInfo): string {
  return new Date(rec.occurredAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
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
      {rec.amountCents !== null ? <Money cents={rec.amountCents} type={rec.suggestedType ?? undefined} /> : null}
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
    </li>
  )
}

/** Open recommendations, newest day first. Opening one fills the add form; nothing is an expense until it is saved. */
export function RecommendationsSetting({ model, actions }: { model: ExpenseModel; actions: ExpenseActions | undefined }) {
  const { items, hasMore, openCount, error, busy, more, dismiss, link } = useRecommendations()
  const days: { date: string; rows: RecommendationInfo[] }[] = []
  for (const rec of items ?? []) {
    const last = days[days.length - 1]
    if (last?.date === rec.localDate) last.rows.push(rec)
    else days.push({ date: rec.localDate, rows: [rec] })
  }
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
          error ? null : <p className={styles.empty}>Loading…</p>
        ) : items.length === 0 ? (
          <p className={styles.empty}>Nothing to review.</p>
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
