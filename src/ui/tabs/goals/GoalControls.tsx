import type { ReactNode } from 'react'
import type { NewGoalScenario } from '../../../data/dataSource'
import { formatCents } from '../../../engine'
import {
  MoneyField,
  NumberField,
  PercentField,
  PurchaseYearField,
} from './goalControlFields'
import styles from './goals.module.css'

function purchaseSummary(draft: NewGoalScenario): string | null {
  const purchaseYear = draft.housePurchaseYear
  if (purchaseYear === null || purchaseYear === 0) return null
  const down = Math.round(draft.housePriceCents * draft.downPaymentFraction)
  const fees = draft.transactionCostsCents
  const total = down + fees
  return `Purchase cost from portfolio: ${formatCents(down)} down + ${formatCents(fees)} fees = ${formatCents(total)} (dip on the invested line in year ${purchaseYear}).`
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
  const purchaseHint = purchaseSummary(draft)
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
    </div>
  )
}
