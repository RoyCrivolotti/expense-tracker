import { useState } from 'react'
import type { LifeEvent } from '../../../types'
import { formatCents, type MoneyFormat } from '../../../engine'
import { MoneyField, NumberField } from './goalControlFields'
import styles from './goals.module.css'

export function LifeEventsList({
  events,
  horizonYears,
  format,
  onChange,
}: {
  events: LifeEvent[]
  horizonYears: number
  format: MoneyFormat
  onChange: (events: LifeEvent[]) => void
}) {
  const [adding, setAdding] = useState(false)

  function removeEvent(idx: number) {
    onChange(events.filter((_, i) => i !== idx))
  }

  function addEvent(ev: LifeEvent) {
    onChange([...events, ev])
    setAdding(false)
  }

  return (
    <div>
      {events.length > 0 && (
        <ul className={styles.lifeEventList}>
          {events.map((ev, idx) => (
            <li key={idx} className={styles.lifeEventRow}>
              <span className={styles.lifeEventLabel}>{ev.label}</span>
              <span className={styles.lifeEventYear}>yr {ev.year}</span>
              <span
                className={
                  ev.amountCents >= 0 ? styles.lifeEventInflow : styles.lifeEventOutflow
                }
              >
                {ev.amountCents >= 0 ? '+' : ''}
                {formatCents(ev.amountCents, format)}
              </span>
              <button
                type="button"
                className={styles.lifeEventRemove}
                aria-label={`Remove ${ev.label}`}
                onClick={() => removeEvent(idx)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {adding ? (
        <LifeEventForm
          horizonYears={horizonYears}
          onAdd={addEvent}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <button
          type="button"
          className={styles.addLifeEventBtn}
          onClick={() => setAdding(true)}
        >
          + Add life event
        </button>
      )}
    </div>
  )
}

const DEFAULT_AMOUNT_CENTS = 1_000_000_00

function LifeEventForm({
  horizonYears,
  onAdd,
  onCancel,
}: {
  horizonYears: number
  onAdd: (ev: LifeEvent) => void
  onCancel: () => void
}) {
  const [label, setLabel] = useState('')
  const [year, setYear] = useState(1)
  const [amountCents, setAmountCents] = useState(DEFAULT_AMOUNT_CENTS)

  function submit() {
    const trimmed = label.trim()
    if (!trimmed) return
    onAdd({ label: trimmed, year, amountCents })
  }

  return (
    <div className={styles.lifeEventForm}>
      <label className={styles.field}>
        <div className={styles.fieldRow}>
          <span className={styles.fieldLabel}>Label</span>
          <input
            className={styles.valueInput}
            type="text"
            aria-label="Life event label"
            placeholder="e.g. Inheritance"
            value={label}
            maxLength={60}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
      </label>
      <NumberField label="Year" value={year} min={1} max={horizonYears} onChange={setYear} />
      <MoneyField
        label="Amount (+ inflow / − outflow)"
        value={Math.abs(amountCents)}
        onChange={(v) => setAmountCents(amountCents < 0 ? -v : v)}
      />
      <div className={styles.lifeEventSignRow}>
        <label className={styles.lifeEventSignLabel}>
          <input
            type="radio"
            name="le-sign"
            checked={amountCents >= 0}
            onChange={() => setAmountCents(Math.abs(amountCents))}
          />
          {' '}Inflow (add to portfolio)
        </label>
        <label className={styles.lifeEventSignLabel}>
          <input
            type="radio"
            name="le-sign"
            checked={amountCents < 0}
            onChange={() => setAmountCents(-Math.abs(amountCents))}
          />
          {' '}Outflow (remove from portfolio)
        </label>
      </div>
      <div className={styles.lifeEventActions}>
        <button type="button" className={styles.addLifeEventBtn} onClick={submit}>
          Add
        </button>
        <button type="button" className={styles.lifeEventCancelBtn} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}
