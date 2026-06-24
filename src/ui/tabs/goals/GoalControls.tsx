import type { ReactNode } from 'react'
import type { NewGoalScenario } from '../../../data/dataSource'
import {
  MoneyField,
  NumberField,
  PercentField,
  PurchaseYearField,
} from './goalControlFields'
import styles from './goals.module.css'

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
        <PurchaseYearField
          value={draft.housePurchaseYear}
          maxYear={draft.horizonYears}
          onChange={(v) => onChange({ housePurchaseYear: v })}
        />
        <MoneyField
          label="Rent (monthly)"
          value={draft.rentMonthlyCents}
          max={300_000}
          step={5_000}
          onChange={(v) => onChange({ rentMonthlyCents: v })}
        />
      </ControlSection>
      <ControlSection title="FIRE / withdrawal">
        <MoneyField
          label="Annual spend"
          value={draft.annualSpendCents}
          max={150_000_00}
          step={1_000_00}
          onChange={(v) => onChange({ annualSpendCents: v })}
        />
        <PercentField
          label="Safe withdrawal rate"
          value={draft.safeWithdrawalRate}
          min={0.03}
          max={0.06}
          onChange={(v) => onChange({ safeWithdrawalRate: v })}
        />
      </ControlSection>
    </div>
  )
}
