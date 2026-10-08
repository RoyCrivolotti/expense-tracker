import { useCallback, useState } from 'react'
import type { ExpenseDataset, GoalScenario } from '../../../types'
import type { ExpenseActions } from '../../actions'
import {
  defaultBudgetMonth,
  formatCents,
  rebaseline,
  rebaselineSummary,
  type MoneyFormat,
  type PlanFromToday,
  type Rebaseline,
} from '../../../engine'
import { ConfirmSheet } from '../../components/ConfirmSheet'
import { Presence } from '../../components/Presence'
import { todayIso } from '../../components/transactionFormState'
import { EXIT_MS } from '../../hooks/motion'
import { failureMessage } from '../../hooks/useFailureToast'
import { useMoneyFormat } from '../../hooks/moneyFormatContext'
import { useToast } from '../../hooks/useToast'
import { formatCheckinDate, type InvestedSnapshot } from './checkinDate'
import { ProgressView } from './ProgressView'
import type { ScenarioEditor } from './useScenarioEditor'

/**
 * What a re-baseline from Progress is about to write, asked before it is written. Held
 * inside Presence so the sheet can animate out after the answer.
 */
function RebaselineSheet({
  preview,
  format,
  onConfirm,
  onCancel,
}: {
  preview: Rebaseline | null
  format: MoneyFormat
  onConfirm: () => void
  onCancel: () => void
}) {
  const summary = preview ? rebaselineSummary(preview, format, formatCheckinDate) : []
  // What is being replaced is said too, so the sheet is not only about what it puts in.
  const replaced = preview?.previous.planStartDate
    ? `, instead of ${formatCheckinDate(preview.previous.planStartDate)} from ${formatCents(preview.previous.investedCents, format)}`
    : ''
  const start = preview
    ? `The plan restarts on ${formatCheckinDate(preview.patch.planStartDate)} from ${formatCents(preview.patch.startInvestedCents, format)}${replaced}. From then on ahead or behind starts again from zero at that date, and follows what you invest and how markets do.`
    : ''
  return (
    <Presence show={preview !== null} exitMs={EXIT_MS.sheet}>
      {preview ? (
        <ConfirmSheet
          title="Re-baseline the plan from the latest check-in?"
          message={summary.length > 0 ? [start, ...summary] : start}
          confirmLabel="Re-baseline"
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      ) : null}
    </Presence>
  )
}

/**
 * Progress writes the plan directly, so it asks first, saying what moves. The editor's
 * draft of that same plan is patched alongside the write, or the header would report
 * unsaved changes and saving them would write the old start back over the re-baseline.
 */
function useRebaselinePrompt(
  actions: ExpenseActions | undefined,
  plan: GoalScenario | null,
  latestSnapshot: InvestedSnapshot | null,
  { activeId, draft, patchDraft }: Pick<ScenarioEditor, 'activeId' | 'draft' | 'patchDraft'>,
) {
  const [preview, setPreview] = useState<Rebaseline | null>(null)
  const onRebaseline = useCallback(() => {
    if (!actions || !plan || !latestSnapshot) return
    setPreview(rebaseline(plan, latestSnapshot))
  }, [actions, plan, latestSnapshot])
  const { showToast } = useToast()
  const onConfirm = useCallback(async () => {
    if (!actions || !plan || !latestSnapshot || !preview) return
    // The draft is re-baselined from its own values, so an unsaved life-event or house
    // edit in the editor moves with the start rather than being overwritten by the plan's.
    const draftPatch = activeId === plan.id ? rebaseline(draft, latestSnapshot).patch : null
    setPreview(null)
    try {
      await actions.updateScenario(plan.id, preview.patch)
    } catch (e) {
      // The plan did not move, so the editor's draft must not either, or Plan would offer to
      // save a start that was never written.
      showToast(failureMessage(e), 'error')
      return
    }
    if (draftPatch) patchDraft(draftPatch)
  }, [actions, plan, latestSnapshot, preview, activeId, patchDraft, draft, showToast])
  const onCancel = useCallback(() => setPreview(null), [])
  return { preview, onRebaseline, onConfirm, onCancel }
}

interface ProgressPaneProps {
  dataset: ExpenseDataset
  actions: ExpenseActions | undefined
  /** The owner's plan, which Progress measures against. */
  plan: GoalScenario | null
  latestSnapshot: InvestedSnapshot | null
  /** The plan restarted from the latest check-in. */
  fromToday: PlanFromToday | null
  /** amountCents -> date first observed at or above, from check-in history. */
  reached: Map<number, string>
  /** Open the check-in form, as the dashboard's nudge asks. */
  openCheckinForm: boolean
  onOpenAccountsSetup: () => void
  /** The editor's draft of the plan, kept in step with a re-baseline. */
  editor: Pick<ScenarioEditor, 'activeId' | 'draft' | 'patchDraft'>
}

/** Progress, and the question it asks before moving the plan's start to the latest check-in. */
export function ProgressPane({
  dataset,
  actions,
  plan,
  latestSnapshot,
  fromToday,
  reached,
  openCheckinForm,
  onOpenAccountsSetup,
  editor,
}: ProgressPaneProps) {
  const format = useMoneyFormat()
  const prompt = useRebaselinePrompt(actions, plan, latestSnapshot, editor)
  return (
    <>
      <RebaselineSheet
        preview={prompt.preview}
        format={format}
        onConfirm={() => {
          void prompt.onConfirm()
        }}
        onCancel={prompt.onCancel}
      />
      <ProgressView
        accounts={dataset.wealthAccounts}
        checkins={dataset.wealthCheckins}
        transactions={dataset.transactions}
        milestones={dataset.settings.milestones}
        reached={reached}
        plan={plan}
        actions={actions}
        canWrite={actions != null}
        onOpenAssumptions={onOpenAccountsSetup}
        openCheckinForm={openCheckinForm}
        cashReserveMonths={dataset.settings.cashReserveMonths}
        openBudgetMonth={defaultBudgetMonth(todayIso(), dataset.settings.budgetRolloverDay)}
        onRebaseline={prompt.onRebaseline}
        fromToday={fromToday}
      />
    </>
  )
}
