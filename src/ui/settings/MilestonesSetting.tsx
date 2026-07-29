import { useState } from 'react'
import type { ExpenseSettings, Milestone } from '../../types'
import {
  defaultMilestones,
  formatCents,
  MILESTONE_LABEL_MAX_LENGTH,
  MILESTONE_MAX_CENTS,
  MILESTONE_MAX_COUNT,
  resolveMoneyFormat,
} from '../../engine'
import { Card, SectionTitle } from '../components/primitives'
import styles from '../tabs/tabs.module.css'

interface Props {
  settings: ExpenseSettings
  onChange: (patch: Partial<ExpenseSettings>) => void
}

/** Amount to prefill a new row with: a step above the current top of the ladder. */
function suggestedAmountCents(milestones: Milestone[]): number {
  const top = milestones[milestones.length - 1]?.amountCents ?? 0
  return Math.min(MILESTONE_MAX_CENTS, top + 10_000_000)
}

function MilestoneRow({
  milestone,
  currencySymbol,
  formatted,
  onCommit,
  onRemove,
}: {
  milestone: Milestone
  currencySymbol: string
  formatted: string
  onCommit: (next: Milestone) => void
  onRemove: () => void
}) {
  const [label, setLabel] = useState(milestone.label)
  const [amount, setAmount] = useState(String(milestone.amountCents / 100))

  function commit() {
    const units = Number(amount)
    // An unparseable or out-of-range amount reverts rather than saving junk.
    const amountCents =
      Number.isFinite(units) && units > 0
        ? Math.min(MILESTONE_MAX_CENTS, Math.round(units * 100))
        : milestone.amountCents
    setAmount(String(amountCents / 100))
    onCommit({ amountCents, label })
  }

  return (
    <li className={styles.milestoneRow}>
      <input
        className={styles.milestoneLabelInput}
        type="text"
        aria-label="Milestone name"
        placeholder="Unnamed"
        value={label}
        maxLength={MILESTONE_LABEL_MAX_LENGTH}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={commit}
      />
      <input
        className={styles.milestoneAmountInput}
        type="number"
        aria-label={`Milestone amount in ${currencySymbol}`}
        min={1}
        step={1000}
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        onBlur={commit}
      />
      <span className={styles.milestoneFormatted}>{formatted}</span>
      <button
        type="button"
        className={styles.milestoneRemove}
        aria-label={`Remove milestone ${milestone.label || formatted}`}
        onClick={onRemove}
      >
        ×
      </button>
    </li>
  )
}

/** Owner-wide net-worth milestones shown on the Goals charts and matrix. */
export function MilestonesSetting({ settings, onChange }: Props) {
  const format = resolveMoneyFormat(settings.currencyCode, settings.numberLocale)
  const milestones = settings.milestones

  const save = (next: Milestone[]) => onChange({ milestones: next })
  const replaceAt = (index: number, next: Milestone) =>
    save(milestones.map((m, i) => (i === index ? next : m)))

  return (
    <>
      <SectionTitle>Milestones</SectionTitle>
      <Card>
        <div className={styles.settingGroup}>
          <p className={styles.settingHint}>
            Net-worth targets shown on the Goals charts and the years-to-milestone matrix, measured
            against your invested portfolio. Names are optional — an unnamed milestone shows its
            amount instead.
          </p>

          {milestones.length > 0 ? (
            <ul className={styles.milestoneList}>
              {milestones.map((m, i) => (
                <MilestoneRow
                  key={m.amountCents}
                  milestone={m}
                  currencySymbol={format.symbol}
                  formatted={formatCents(m.amountCents, format)}
                  onCommit={(next) => replaceAt(i, next)}
                  onRemove={() => save(milestones.filter((_, j) => j !== i))}
                />
              ))}
            </ul>
          ) : (
            <p className={styles.settingHint}>
              No milestones. The Goals matrix and chart reference lines stay empty until you add
              one.
            </p>
          )}

          <div className={styles.milestoneActions}>
            <button
              type="button"
              className={styles.milestoneAddBtn}
              disabled={milestones.length >= MILESTONE_MAX_COUNT}
              onClick={() =>
                save([...milestones, { amountCents: suggestedAmountCents(milestones), label: '' }])
              }
            >
              + Add milestone
            </button>
            <button
              type="button"
              className={styles.milestoneResetBtn}
              onClick={() => save(defaultMilestones())}
            >
              Reset to defaults
            </button>
          </div>
          {milestones.length >= MILESTONE_MAX_COUNT ? (
            <p className={styles.settingHint}>
              {MILESTONE_MAX_COUNT} is the most the matrix can show legibly. Remove one to add
              another.
            </p>
          ) : null}
        </div>
      </Card>
    </>
  )
}
