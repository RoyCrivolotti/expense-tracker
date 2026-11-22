import type { NewGoalScenario } from '../../../data/dataSource'
import { shortDateLabel } from '../../../engine'
import { TIP_IDS } from '../../../domain/onboarding/tips'
import { todayIso } from '../../components/transactionFormState'
import { TipCard } from '../../tips/TipCard'
import { useMoneyFormat } from '../../hooks/moneyFormatContext'
import { MoneyField } from './goalControlFields'
import { LEVER_SPECS } from './leverFields'
import type { MobilePlanView, TabView } from './goalsView'
import type { ScenarioEditor } from './useScenarioEditor'
import styles from './GoalsTips.module.css'

interface StartProps {
  /** What the plan is being drawn from now. The two boxes write into it as the person leaves them, as the controls do. */
  draft: NewGoalScenario
  onChange: (patch: Partial<NewGoalScenario>) => void
  /** The account has no saved scenario: the only person this is for. */
  noScenarios: boolean
}

/**
 * The first visit to Goals by a person with no saved scenario: what the page answers, and the two numbers that make the
 * chart mean something. The boxes are the controls' own money fields on the draft, under the controls' own names, so
 * what is typed is read, held to the ceiling and kept the way the controls keep it, and nothing here does its own sums.
 * They write as they are left, so the one button only puts the card away; it saves no scenario.
 */
export function GoalsStartCard({ draft, onChange, noScenarios }: StartProps) {
  const { symbol } = useMoneyFormat()
  // The draft starts from the latest check-in, dated the day it was taken, so what is typed here is the balance on that day.
  const fromCheckin = draft.planStartDate !== null && draft.planStartDate !== todayIso()
  const start = fromCheckin ? `what your investments held on ${shortDateLabel(draft.planStartDate ?? '')}, from your latest check-in` : 'what your investments hold now, not your bank balance'
  return (
    <TipCard id={TIP_IDS.goals} title="A long-range plan" actionLabel="Show my plan" when={noScenarios}>
      <p>
        Goals answers one question: if you invest the same amount every month, what could you have in 10, 20 or 30 years?
        Start with two numbers. The rest begins at a sensible value you can change later. Nothing is saved until you save the
        scenario.
      </p>
      <div className={styles.fields}>
        <MoneyField
          label={`${LEVER_SPECS.startInvestedCents.label} (${symbol})`}
          value={draft.startInvestedCents}
          onChange={(cents) => onChange({ startInvestedCents: cents })}
        />
        <MoneyField
          label={`${LEVER_SPECS.monthlyContributionCents.label} (${symbol})`}
          value={draft.monthlyContributionCents}
          onChange={(cents) => onChange({ monthlyContributionCents: cents })}
        />
      </div>
      <p className={styles.hint}>
        Starting invested is {start}. Monthly investing is what you add to them each month.
      </p>
    </TipCard>
  )
}

/** The first time Progress is opened: what it needs from the person to say anything. */
export function ProgressTip() {
  return (
    <TipCard id={TIP_IDS.goalsProgress} title="Monthly check-in">
      <p>Once a month, write down what your accounts hold. Progress compares that with the plan.</p>
    </TipCard>
  )
}

interface TipsProps {
  view: TabView
  narrow: boolean
  /** The half of Plan a phone is showing. */
  half: MobilePlanView
  editor: Pick<ScenarioEditor, 'draft' | 'patchDraft'>
  noScenarios: boolean
}

/** The card for the view that is open. On a phone the start card is on the chart half, not over the controls it duplicates. */
export function GoalsTips({ view, narrow, half, editor, noScenarios }: TipsProps) {
  if (view === 'progress') return <ProgressTip />
  if (view !== 'plan' || (narrow && half !== 'chart')) return null
  return <GoalsStartCard draft={editor.draft} onChange={editor.patchDraft} noScenarios={noScenarios} />
}
