import type { NewGoalScenario } from '../../../data/dataSource'
import { formatCents, formatPercent } from '../../../engine'
import styles from './goals.module.css'

interface RangeFieldProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  format: (value: number) => string
  onChange: (value: number) => void
}

export function RangeField({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: RangeFieldProps) {
  return (
    <label className={styles.field}>
      <div className={styles.fieldRow}>
        <span className={styles.fieldLabel}>{label}</span>
        <span className={styles.fieldValue}>{format(value)}</span>
      </div>
      <input
        className={styles.range}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  )
}

interface GoalControlsProps {
  draft: NewGoalScenario
  onChange: (patch: Partial<NewGoalScenario>) => void
}

export function GoalControls({ draft, onChange }: GoalControlsProps) {
  return (
    <div className={styles.panel}>
      <div>
        <h3 className={styles.sectionTitle}>Portfolio</h3>
        <RangeField
          label="Starting invested"
          value={draft.startInvestedCents}
          min={0}
          max={50_000_000}
          step={10_000}
          format={formatCents}
          onChange={(v) => onChange({ startInvestedCents: v })}
        />
        <RangeField
          label="Monthly investing"
          value={draft.monthlyContributionCents}
          min={0}
          max={2_000_00}
          step={10_00}
          format={formatCents}
          onChange={(v) => onChange({ monthlyContributionCents: v })}
        />
        <RangeField
          label="Real return"
          value={draft.expectedRealReturn}
          min={0}
          max={0.15}
          step={0.005}
          format={formatPercent}
          onChange={(v) => onChange({ expectedRealReturn: v })}
        />
        <RangeField
          label="Horizon"
          value={draft.horizonYears}
          min={5}
          max={40}
          step={1}
          format={(v) => `${v} years`}
          onChange={(v) => onChange({ horizonYears: v })}
        />
      </div>
      <div>
        <h3 className={styles.sectionTitle}>Housing</h3>
        <RangeField
          label="House price"
          value={draft.housePriceCents}
          min={0}
          max={100_000_000}
          step={25_000_00}
          format={formatCents}
          onChange={(v) => onChange({ housePriceCents: v })}
        />
        <RangeField
          label="Down payment"
          value={draft.downPaymentFraction}
          min={0}
          max={0.5}
          step={0.05}
          format={formatPercent}
          onChange={(v) => onChange({ downPaymentFraction: v })}
        />
        <RangeField
          label="Purchase year"
          value={draft.housePurchaseYear ?? -1}
          min={-1}
          max={draft.horizonYears}
          step={1}
          format={(v) => (v < 0 ? 'Never' : v === 0 ? 'Now' : `Year ${v}`)}
          onChange={(v) => onChange({ housePurchaseYear: v < 0 ? null : v })}
        />
        <RangeField
          label="Rent (monthly)"
          value={draft.rentMonthlyCents}
          min={0}
          max={300_000}
          step={5_000}
          format={formatCents}
          onChange={(v) => onChange({ rentMonthlyCents: v })}
        />
      </div>
      <div>
        <h3 className={styles.sectionTitle}>FIRE / withdrawal</h3>
        <RangeField
          label="Annual spend"
          value={draft.annualSpendCents}
          min={0}
          max={150_000_00}
          step={1_000_00}
          format={formatCents}
          onChange={(v) => onChange({ annualSpendCents: v })}
        />
        <RangeField
          label="Safe withdrawal rate"
          value={draft.safeWithdrawalRate}
          min={0.03}
          max={0.06}
          step={0.005}
          format={formatPercent}
          onChange={(v) => onChange({ safeWithdrawalRate: v })}
        />
      </div>
    </div>
  )
}
