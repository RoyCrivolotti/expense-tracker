import type { RefObject } from 'react'
import type { ExpenseSettings, Milestone } from '../../types'
import {
  defaultMilestones,
  formatCents,
  MILESTONE_MAX_CENTS,
  MILESTONE_MAX_COUNT,
  resolveMoneyFormat,
  currencyWord,
  type MoneyFormat,
} from '../../engine'
import { Card } from '../components/primitives'
import { MilestoneRow } from './MilestoneRow'
import { useMilestoneSave } from './useMilestoneSave'
import styles from '../tabs/tabs.module.css'
import goalStyles from '../tabs/goals/goals.module.css'

interface Props {
  settings: ExpenseSettings
  /** Returning the save promise lets the editor keep overlapping edits from clobbering each other. */
  onChange: (patch: Partial<ExpenseSettings>) => void | Promise<void>
}

/** Amount to prefill a new row with: a step above the current top of the ladder. */
function suggestedAmountCents(milestones: Milestone[]): number {
  const top = milestones[milestones.length - 1]?.amountCents ?? 0
  return Math.min(MILESTONE_MAX_CENTS, top + 10_000_000)
}

/** Owner-wide net-worth milestones shown on the Goals charts and matrix. */
export function MilestonesSetting({ settings, onChange }: Props) {
  const format = resolveMoneyFormat(settings.currencyCode, settings.numberLocale)
  const milestones = settings.milestones

  const { workingRef, error, errorRef, failed, save, replaceAmount, removeAmount } = useMilestoneSave(
    milestones,
    onChange,
  )

  return (
    <>
      <Card>
        {/* Same card title as the accounts card beside it in Assumptions, not a page heading. */}
        <h3 className={goalStyles.sectionTitle}>Milestones</h3>
        <div className={styles.settingGroup}>
          <p className={styles.settingHint}>
            Amounts you want to see on your account, shown on the Goals charts and the years-to-milestone matrix and
            measured against your invested portfolio. The plan is counted after inflation to date them:{' '}
            {currencyWord(format)} on the account in ten years buy less than {currencyWord(format)} today. Names are
            optional, and a named milestone is shown with its amount alongside; an unnamed one shows the amount on its
            own. Give one a target date and Progress will say whether the plan reaches it in time.
          </p>
          {error ? (
            <p ref={errorRef} className={styles.settingError} role="alert">
              Could not save the milestones: {error}
            </p>
          ) : null}

          <MilestoneList
            milestones={milestones}
            format={format}
            workingRef={workingRef}
            failed={failed}
            onReplace={replaceAmount}
            onRemove={removeAmount}
          />

          <div className={styles.milestoneActions}>
            <button
              type="button"
              className={styles.milestoneAddBtn}
              disabled={milestones.length >= MILESTONE_MAX_COUNT}
              onClick={() =>
                void save([...workingRef.current, { amountCents: suggestedAmountCents(workingRef.current), label: '' }])
              }
            >
              + Add milestone
            </button>
            <button type="button" className={styles.milestoneResetBtn} onClick={() => void save(defaultMilestones())}>
              Reset to defaults
            </button>
          </div>
          {milestones.length >= MILESTONE_MAX_COUNT ? (
            <p className={styles.settingHint}>
              {MILESTONE_MAX_COUNT} is the most the matrix can show legibly. Remove one to add another.
            </p>
          ) : null}
        </div>
      </Card>
    </>
  )
}

function MilestoneList({
  milestones,
  format,
  workingRef,
  failed,
  onReplace,
  onRemove,
}: {
  milestones: Milestone[]
  format: MoneyFormat
  workingRef: RefObject<Milestone[]>
  failed: { amountCents: number; n: number } | null
  onReplace: (
    key: number,
    savedAmountCents: number,
    next: Milestone,
  ) => void
  onRemove: (amountCents: number) => void
}) {
  return (
    <>
      {milestones.length > 0 ? (
        <ul className={styles.milestoneList}>
          {milestones.map((m) => (
            <MilestoneRow
              key={m.amountCents}
              milestone={m}
              format={format}
              formatted={formatCents(m.amountCents, format)}
              isAmountTaken={(cents) =>
                cents !== m.amountCents && workingRef.current.some((other) => other.amountCents === cents)
              }
              onCommit={(key, next) => onReplace(key, m.amountCents, next)}
              failed={failed}
              onRemove={() => onRemove(m.amountCents)}
            />
          ))}
        </ul>
      ) : (
        <p className={styles.settingHint}>
          No milestones. The Goals matrix and chart reference lines stay empty until you add one.
        </p>
      )}
    </>
  )
}
