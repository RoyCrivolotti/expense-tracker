import { useState, type ReactNode } from 'react'
import type { LifeEvent } from '../../../types'
import type { NewGoalScenario } from '../../../data/dataSource'
import { formatCents, type MoneyFormat } from '../../../engine'
import {
  DateField,
  MoneyField,
  NumberField,
  PercentField,
  PurchaseYearField,
} from './goalControlFields'
import { useMoneyFormat } from '../../hooks/moneyFormatContext'
import styles from './goals.module.css'

function purchaseSummary(draft: NewGoalScenario, format: MoneyFormat): string | null {
  const purchaseYear = draft.housePurchaseYear
  if (purchaseYear === null || purchaseYear === 0) return null
  const down = Math.round(draft.housePriceCents * draft.downPaymentFraction)
  const fees = draft.transactionCostsCents
  const total = down + fees
  return `Purchase cost from portfolio: ${formatCents(down, format)} down + ${formatCents(fees, format)} fees = ${formatCents(total, format)} (dip on the invested line in year ${purchaseYear}).`
}

interface GoalControlsProps {
  draft: NewGoalScenario
  onChange: (patch: Partial<NewGoalScenario>) => void
}

function ControlSection({
  title,
  defaultOpen = true,
  children,
}: {
  title: string
  defaultOpen?: boolean
  children: ReactNode
}) {
  return (
    <details className={styles.controlSection} open={defaultOpen}>
      <summary className={styles.controlSummary}>{title}</summary>
      <div className={styles.controlBody}>{children}</div>
    </details>
  )
}

export function GoalControls({ draft, onChange }: GoalControlsProps) {
  const format = useMoneyFormat()
  const purchaseHint = purchaseSummary(draft, format)
  return (
    <div className={styles.controlsStack}>
      <ControlSection title="Portfolio">
        <MoneyField
          label="Starting invested"
          value={draft.startInvestedCents}
          max={50_000_000}
          onChange={(v) => onChange({ startInvestedCents: v })}
        />
        <MoneyField
          label="Monthly investing"
          value={draft.monthlyContributionCents}
          max={2_000_00}
          step={10_00}
          onChange={(v) => onChange({ monthlyContributionCents: v })}
        />
        <PercentField
          label="Contribution growth (%/yr)"
          value={draft.annualContributionGrowth}
          max={0.1}
          onChange={(v) => onChange({ annualContributionGrowth: v })}
        />
        <PercentField
          label="Real return"
          value={draft.expectedRealReturn}
          max={0.15}
          onChange={(v) => onChange({ expectedRealReturn: v })}
        />
        <NumberField
          label="Horizon (years)"
          value={draft.horizonYears}
          min={5}
          max={40}
          format={(v) => String(v)}
          onChange={(v) => onChange({ horizonYears: v })}
        />
      </ControlSection>
      <ControlSection title="Housing">
        <MoneyField
          label="House price"
          value={draft.housePriceCents}
          max={100_000_000}
          step={25_000_00}
          onChange={(v) => onChange({ housePriceCents: v })}
        />
        <PercentField
          label="Down payment"
          value={draft.downPaymentFraction}
          max={0.5}
          onChange={(v) => onChange({ downPaymentFraction: v })}
        />
        <MoneyField
          label="Purchase fees"
          value={draft.transactionCostsCents}
          max={5_000_000}
          step={50_000}
          onChange={(v) => onChange({ transactionCostsCents: v })}
        />
        <p className={styles.fieldHint}>
          Notary, agency, and closing costs withdrawn with the down payment in the purchase
          year.
        </p>
        <PercentField
          label="Mortgage rate (%/yr)"
          value={draft.mortgageRateAnnual}
          max={0.1}
          onChange={(v) => onChange({ mortgageRateAnnual: v })}
        />
        <NumberField
          label="Mortgage term (years)"
          value={draft.mortgageTermYears}
          min={5}
          max={40}
          format={String}
          onChange={(v) => onChange({ mortgageTermYears: v })}
        />
        <PercentField
          label="House appreciation (%/yr)"
          value={draft.houseAppreciationRate}
          max={0.1}
          onChange={(v) => onChange({ houseAppreciationRate: v })}
        />
        <PurchaseYearField
          value={draft.housePurchaseYear}
          maxYear={draft.horizonYears}
          onChange={(v) => onChange({ housePurchaseYear: v })}
        />
        {purchaseHint ? <p className={styles.fieldHint}>{purchaseHint}</p> : null}
        <MoneyField
          label="Rent (monthly)"
          value={draft.rentMonthlyCents}
          max={300_000}
          step={5_000}
          onChange={(v) => onChange({ rentMonthlyCents: v })}
        />
      </ControlSection>
      <ControlSection title="FIRE / withdrawal">
        <p className={styles.fieldHint}>
          Models life after financial independence, not withdrawals today. FI is searched within
          your Horizon (years); if never reached, drawdown charts show the target only.
        </p>
        <MoneyField
          label="Annual spend at FI"
          value={draft.annualSpendCents}
          max={150_000_00}
          step={1_000_00}
          onChange={(v) => onChange({ annualSpendCents: v })}
        />
        <p className={styles.fieldHint}>
          Yearly cost of living you would need the portfolio to cover after FI (within the horizon).
        </p>
        <PercentField
          label="Withdrawal rate at FI"
          value={draft.safeWithdrawalRate}
          min={0.005}
          max={0.06}
          onChange={(v) => onChange({ safeWithdrawalRate: v })}
        />
        <p className={styles.fieldHint}>
          Share of the portfolio you would spend each year once FI (4% is the usual rule of thumb).
          Lower rate = spend less = higher FI target. FI target = annual spend ÷ this rate.
        </p>
      </ControlSection>
      <ControlSection title="Plan tracking" defaultOpen={false}>
        <DateField
          label="Plan start date"
          value={draft.planStartDate ?? null}
          hint="Anchors the projection to a calendar date so wealth check-ins can show whether you are ahead or behind."
          onChange={(v) => onChange({ planStartDate: v })}
        />
      </ControlSection>
      <ControlSection title="Life events" defaultOpen={false}>
        <p className={styles.fieldHint}>
          One-off cash events (bonuses, inheritances, large purchases) applied to the portfolio in a
          specific projection year. Shown as diamond markers on the chart.
        </p>
        <LifeEventsList
          events={draft.lifeEvents ?? []}
          horizonYears={draft.horizonYears}
          format={format}
          onChange={(events) => onChange({ lifeEvents: events })}
        />
      </ControlSection>
    </div>
  )
}

function LifeEventsList({
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
      <NumberField
        label="Year"
        value={year}
        min={1}
        max={horizonYears}
        format={String}
        onChange={setYear}
      />
      <MoneyField
        label="Amount (+ inflow / − outflow)"
        value={Math.abs(amountCents)}
        max={100_000_000_00}
        step={1_000_00}
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
