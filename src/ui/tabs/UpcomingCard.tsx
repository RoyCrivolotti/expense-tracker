import { useCallback, useState } from 'react'
import type { RecurringSuggestion } from '../../engine'
import { isDueSoon } from '../../engine'
import type { TransactionSeed } from '../actions'
import type { Lookup } from '../format'
import { formatDayLabel } from '../format'
import { formatCents } from '../../engine/money'
import { Card, SectionTitle } from '../components/primitives'
import { useMoneyFormat } from '../hooks/moneyFormatContext'
import { todayLocalIso } from '../dates'
import styles from './UpcomingCard.module.css'

interface Props {
  suggestions: RecurringSuggestion[]
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

function FrequencyLabel({ frequency }: { frequency: RecurringSuggestion['frequency'] }) {
  const labels: Record<RecurringSuggestion['frequency'], string> = {
    weekly: 'Weekly',
    monthly: 'Monthly',
    quarterly: 'Quarterly',
    yearly: 'Yearly',
  }
  return <span className={styles.freq}>{labels[frequency]}</span>
}

function SuggestionRow({
  suggestion,
  lookup,
  onAdd,
  onDismiss,
}: {
  suggestion: RecurringSuggestion
  lookup: Lookup
  onAdd: () => void
  onDismiss: () => void
}) {
  const format = useMoneyFormat()
  const categoryName = lookup.categoryName(suggestion.categoryId)
  return (
    <div className={styles.row}>
      <div className={styles.info}>
        <span className={styles.desc}>{suggestion.description}</span>
        <span className={styles.meta}>
          {categoryName} · {formatCents(suggestion.amountCents, format)} ·{' '}
          {formatDayLabel(suggestion.predictedDate)} ·{' '}
          <FrequencyLabel frequency={suggestion.frequency} />
        </span>
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.addBtn} onClick={onAdd} aria-label="Add">
          +
        </button>
        <button type="button" className={styles.dismissBtn} onClick={onDismiss} aria-label="Dismiss">
          ×
        </button>
      </div>
    </div>
  )
}

export function UpcomingCard({ suggestions, lookup, onAdd }: Props) {
  const [dismissed, setDismissed] = useState(loadDismissed)

  const today = todayLocalIso()
  const visible = suggestions.filter(
    (s) => !dismissed.has(dismissKey(s)) && isDueSoon(s.predictedDate, today),
  )

  const handleDismiss = useCallback((s: RecurringSuggestion) => {
    setDismissed((prev) => {
      const next = new Set(prev)
      next.add(dismissKey(s))
      persistDismissed(next)
      return next
    })
  }, [])

  if (visible.length === 0) return null

  return (
    <>
      <SectionTitle>Upcoming</SectionTitle>
      <Card>
        {visible.map((s) => (
          <SuggestionRow
            key={dismissKey(s)}
            suggestion={s}
            lookup={lookup}
            onAdd={() => onAdd(toSeed(s))}
            onDismiss={() => handleDismiss(s)}
          />
        ))}
      </Card>
    </>
  )
}
