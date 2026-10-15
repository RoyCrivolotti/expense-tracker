import { useCallback, useRef, useState } from 'react'
import type { RecurringSuggestion } from '../../engine'
import { shortMonthLabel } from '../../engine'
import type { TransactionSeed } from '../actions'
import type { Lookup } from '../format'
import { formatDayLabel } from '../format'
import { formatCents } from '../../engine/money'
import { Card, SectionTitle } from '../components/primitives'
import { NoEntryIcon } from '../icons'
import { UNDO_SHORTCUT } from '../components/toastShortcuts'
import { useMoneyFormat } from '../hooks/moneyFormatContext'
import { useToast } from '../hooks/useToast'
import { dueLabel, daysUntilDue } from './dueLabel'
import { useStoppedSuggestions } from './stoppedSuggestions'
import styles from './UpcomingCard.module.css'

interface Props {
  /** The charges due today; the engine has already dropped the ones that are too early or too late. */
  suggestions: RecurringSuggestion[]
  /** The budget month on screen; a suggestion that files under another one is marked with its own. */
  month: string
  /** The date the rows are said against: "Due tomorrow", "Due 2 days ago". */
  today: string
  lookup: Lookup
  onAdd: (seed: TransactionSeed) => void
}

const DISMISS_KEY = 'expense:dismissed-recurring'

function loadDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISS_KEY)
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set()
  } catch {
    return new Set()
  }
}

function persistDismissed(set: Set<string>): void {
  localStorage.setItem(DISMISS_KEY, JSON.stringify([...set]))
}

function dismissKey(s: RecurringSuggestion): string {
  return `${s.description}|${s.accountId}|${s.categoryId}|${s.type}|${s.predictedBudgetMonth}`
}

/** The key as it was before it carried the category and type, so a dismissal saved then still applies. */
function legacyDismissKey(s: RecurringSuggestion): string {
  return `${s.description}|${s.accountId}|${s.predictedBudgetMonth}`
}

function toSeed(s: RecurringSuggestion): TransactionSeed {
  return {
    description: s.description,
    type: s.type,
    accountId: s.accountId,
    categoryId: s.categoryId,
    amountCents: s.amountCents,
    date: s.predictedDate,
    budgetMonth: s.predictedBudgetMonth,
  }
}

function SuggestionRow({
  suggestion,
  forMonth,
  today,
  last,
  lookup,
  onAdd,
  onDismiss,
  onStop,
}: {
  suggestion: RecurringSuggestion
  /** The suggestion's budget month when it is not the current one. */
  forMonth: string | null
  today: string
  /** The last row of a card with nothing under it, so it has no line below. */
  last: boolean
  lookup: Lookup
  onAdd: () => void
  onDismiss: () => void
  onStop: () => void
}) {
  const format = useMoneyFormat()
  const categoryName = lookup.categoryName(suggestion.categoryId)
  const daysUntil = daysUntilDue(suggestion.predictedDate, today)
  return (
    <div className={last ? `${styles.row} ${styles.rowLast}` : styles.row} data-row>
      <div className={styles.info}>
        <span className={styles.desc}>{suggestion.description}</span>
        <span className={styles.meta}>
          <span className={styles.what}>
            {categoryName} · {formatCents(suggestion.amountCents, format)}
          </span>
          <span className={styles.when}>
            <span className={daysUntil < 0 ? styles.late : daysUntil === 0 ? styles.today : undefined}>
              {dueLabel(daysUntil)}
            </span>
            {' · '}
            {formatDayLabel(suggestion.predictedDate)}
            {forMonth && (
              <>
                {' · '}
                <span className={styles.forMonth}>For {shortMonthLabel(forMonth)}</span>
              </>
            )}
          </span>
        </span>
      </div>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.addBtn}
          onClick={onAdd}
          aria-label={`Add ${suggestion.description}`}
        >
          +
        </button>
        <button
          type="button"
          className={styles.dismissBtn}
          onClick={onDismiss}
          aria-label={`Dismiss ${suggestion.description}`}
        >
          ×
        </button>
        <button
          type="button"
          className={styles.stopBtn}
          onClick={onStop}
          aria-label={`Stop suggesting ${suggestion.description}`}
          title="Stop suggesting"
        >
          <NoEntryIcon className={styles.stopIcon} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}

export function UpcomingCard({ suggestions, month, today, lookup, onAdd }: Props) {
  const [dismissed, setDismissed] = useState(loadDismissed)
  const { showToast } = useToast()
  const { stop, restore } = useStoppedSuggestions()
  const rows = useRef<HTMLDivElement>(null)

  const visible = suggestions.filter(
    (s) => !dismissed.has(dismissKey(s)) && !dismissed.has(legacyDismissKey(s)),
  )

  const setHidden = useCallback((s: RecurringSuggestion, hidden: boolean) => {
    setDismissed((prev) => {
      const next = new Set(prev)
      if (hidden) next.add(dismissKey(s))
      else next.delete(dismissKey(s))
      persistDismissed(next)
      return next
    })
  }, [])

  // The row the focus was on is gone; the one that takes its place, or the one before it when it
  // was the last, gets the focus.
  const focusRowAt = (index: number) => {
    requestAnimationFrame(() => {
      const remaining = rows.current?.querySelectorAll<HTMLElement>('[data-row]')
      remaining?.[Math.min(index, remaining.length - 1)]?.querySelector('button')?.focus()
    })
  }

  const handleDismiss = (s: RecurringSuggestion, index: number) => {
    setHidden(s, true)
    showToast(`Dismissed ${s.description}`, 'info', {
      label: 'Undo',
      onAction: () => setHidden(s, false),
      shortcut: UNDO_SHORTCUT,
    })
    focusRowAt(index)
  }

  const handleStop = (s: RecurringSuggestion, index: number) => {
    stop(s.seriesKey, { after: s.lastChargeDate, label: s.description })
    showToast(`Stopped suggesting ${s.description}`, 'info', {
      label: 'Undo',
      onAction: () => restore(s.seriesKey),
      shortcut: UNDO_SHORTCUT,
    })
    focusRowAt(index)
  }

  if (visible.length === 0) return null

  return (
    <>
      <SectionTitle>Upcoming</SectionTitle>
      <Card>
        <div ref={rows}>
          {visible.map((s, index) => (
            <SuggestionRow
              key={dismissKey(s)}
              suggestion={s}
              forMonth={s.predictedBudgetMonth === month ? null : s.predictedBudgetMonth}
              today={today}
              last={index === visible.length - 1}
              lookup={lookup}
              onAdd={() => onAdd(toSeed(s))}
              onDismiss={() => handleDismiss(s, index)}
              onStop={() => handleStop(s, index)}
            />
          ))}
        </div>
      </Card>
    </>
  )
}
