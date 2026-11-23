import { useCallback, useId, useRef, useState } from 'react'
import type { TransactionSeed } from '../actions'
import type { Lookup } from '../format'
import { Card, SectionTitle } from '../components/primitives'
import { UNDO_SHORTCUT } from '../components/toastShortcuts'
import { useToast } from '../hooks/useToast'
import { OWNER_KEYS, ownerKey, useAccountOwner } from '../hooks/accountOwner'
import { useStoppedSuggestions } from './stoppedSuggestions'
import { SuggestionRow } from './UpcomingRow'
import type { MarkedSuggestion } from './useRecurringMarks'
import styles from './UpcomingCard.module.css'

interface Props {
  /** The charges due today; the engine has already dropped the ones that are too early or too late. */
  suggestions: MarkedSuggestion[]
  /** The budget month on screen; a suggestion that files under another one is marked with its own. */
  month: string
  /** The date the rows are said against: "Due tomorrow", "Due 2 days ago". */
  today: string
  lookup: Lookup
  /** Opens the add form: on a new row, or on the waiting bank push a charge's mark names. */
  onAdd: (seed: TransactionSeed) => void
}

/** Up to this many rows are all shown. Past it the card keeps `ROWS_KEPT` in view and folds the rest. */
const ROWS_SHOWN_IN_FULL = 4
const ROWS_KEPT = 3

function loadDismissed(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key)
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set()
  } catch {
    return new Set()
  }
}

function persistDismissed(
  key: string,
  set: Set<string>,
): void {
  localStorage.setItem(key, JSON.stringify([...set]))
}

function dismissKey(s: MarkedSuggestion): string {
  return `${s.description}|${s.accountId}|${s.categoryId}|${s.type}|${s.predictedBudgetMonth}`
}

/** The key as it was before it carried the category and type, so a dismissal saved then still applies. */
function legacyDismissKey(s: MarkedSuggestion): string {
  return `${s.description}|${s.accountId}|${s.predictedBudgetMonth}`
}

/** What "+" opens: the charge's waiting bank push when one stands for it, so it is not added twice; else a new row. */
function toSeed(s: MarkedSuggestion): TransactionSeed {
  if (s.mark?.push) return s.mark.push
  return {
    description: s.description,
    type: s.type,
    accountId: s.accountId,
    categoryId: s.categoryId,
    amountCents: s.amountCents,
    date: s.predictedDate,
    budgetMonth: s.filedUnder,
  }
}

export function UpcomingCard({ suggestions, month, today, lookup, onAdd }: Props) {
  // Kept for the signed-in person: the keys name what their ledger holds, and the device may be used by someone else.
  const storageKey = ownerKey(OWNER_KEYS.dismissed, useAccountOwner())
  const [dismissed, setDismissed] = useState(() => loadDismissed(storageKey))
  const [expanded, setExpanded] = useState(false)
  const foldedRowsId = useId()
  const { showToast } = useToast()
  const { stop, restore } = useStoppedSuggestions()
  const rows = useRef<HTMLDivElement>(null)

  const visible = suggestions.filter((s) => !dismissed.has(dismissKey(s)) && !dismissed.has(legacyDismissKey(s)))

  const setHidden = useCallback(
    (s: MarkedSuggestion, hidden: boolean) => {
      setDismissed((prev) => {
        const next = new Set(prev)
        if (hidden) next.add(dismissKey(s))
        else next.delete(dismissKey(s))
        persistDismissed(storageKey, next)
        return next
      })
    },
    [storageKey],
  )

  // The row the focus was on is gone; the one that takes its place, or the one before it when it
  // was the last, gets the focus.
  const focusRowAt = (index: number) => {
    requestAnimationFrame(() => {
      // Rows folded out of sight are inert and cannot take it.
      const remaining = [...(rows.current?.querySelectorAll<HTMLElement>('[data-row]') ?? [])].filter(
        (row) => !row.closest('[inert]'),
      )
      remaining[Math.min(index, remaining.length - 1)]?.querySelector('button')?.focus()
    })
  }

  const handleDismiss = (
    s: MarkedSuggestion,
    index: number,
  ) => {
    setHidden(s, true)
    showToast(`Dismissed ${s.description}`, 'info', {
      label: 'Undo',
      onAction: () => setHidden(s, false),
      shortcut: UNDO_SHORTCUT,
    })
    focusRowAt(index)
  }

  const handleStop = (
    s: MarkedSuggestion,
    index: number,
  ) => {
    stop(s.seriesKey, { after: s.lastChargeDate, label: s.description })
    showToast(`Stopped suggesting ${s.description}`, 'info', {
      label: 'Undo',
      onAction: () => restore(s.seriesKey),
      shortcut: UNDO_SHORTCUT,
    })
    focusRowAt(index)
  }

  if (visible.length === 0) return null

  // A long card keeps its first rows in view and folds the rest, so the list below it is not pushed
  // off a phone screen. A single row is never worth a toggle: past `ROWS_SHOWN_IN_FULL` at least two fold.
  const folds = visible.length > ROWS_SHOWN_IN_FULL
  const kept = folds ? visible.slice(0, ROWS_KEPT) : visible
  const folded = folds ? visible.slice(ROWS_KEPT) : []
  const renderRow = (
    s: MarkedSuggestion,
    index: number,
    last: boolean,
  ) => (
    <SuggestionRow
      key={dismissKey(s)}
      suggestion={s}
      forMonth={s.filedUnder === month ? null : s.filedUnder}
      today={today}
      last={last}
      lookup={lookup}
      onAdd={() => onAdd(toSeed(s))}
      onDismiss={() => handleDismiss(s, index)}
      onStop={() => handleStop(s, index)}
    />
  )

  return (
    <>
      <SectionTitle>Upcoming</SectionTitle>
      <Card>
        <div ref={rows}>
          {kept.map((s, index) => renderRow(s, index, !folds && index === kept.length - 1))}
          {folds && (
            <div
              id={foldedRowsId}
              className={expanded ? styles.fold : `${styles.fold} ${styles.folded}`}
              // Kept in the DOM so it can fold; `inert` keeps touch, focus and screen readers out of
              // the rows that are out of sight.
              inert={!expanded}
            >
              <div className={styles.foldInner}>{folded.map((s, index) => renderRow(s, ROWS_KEPT + index, false))}</div>
            </div>
          )}
        </div>
        {folds && (
          <button
            type="button"
            className={styles.moreBtn}
            aria-expanded={expanded}
            aria-controls={foldedRowsId}
            onClick={() => setExpanded((open) => !open)}
          >
            {expanded ? 'Show fewer' : `Show ${folded.length} more`}
          </button>
        )}
      </Card>
    </>
  )
}
