import type { Account, Category } from '../../types'
import type { NewAccount, NewCategory } from '../../data/dataSource'
import type { ExpenseModel } from '../useExpenseData'
import type { ExpenseActions } from '../actions'
import { Modal } from '../components/Modal'
import { RecordForm } from './RecordForm'
import type { FieldSpec, FieldValue } from './recordFields'

export type EditTarget =
  | { kind: 'category'; record: Category | null }
  | { kind: 'account'; record: Account | null }
  | { kind: 'settings' }
  | { kind: 'goals' }

const CATEGORY_FIELDS: FieldSpec[] = [
  { key: 'name', label: 'Name', kind: 'text' },
  { key: 'icon', label: 'Icon (emoji)', kind: 'text' },
  { key: 'monthlyBudgetCents', label: 'Monthly budget (€)', kind: 'money' },
  { key: 'sortOrder', label: 'Sort order', kind: 'number' },
  { key: 'active', label: 'Active', kind: 'toggle' },
]
const ACCOUNT_FIELDS: FieldSpec[] = [
  { key: 'name', label: 'Name', kind: 'text' },
  {
    key: 'settlement',
    label: 'Settlement',
    kind: 'select',
    options: [
      { value: 'immediate', label: 'Debit · posts instantly' },
      { value: 'deferred', label: 'Card · posts when paid' },
    ],
  },
  {
    key: 'kind',
    label: 'Kind',
    kind: 'select',
    options: [
      { value: 'debit', label: 'Debit' },
      { value: 'credit', label: 'Credit' },
    ],
  },
  { key: 'active', label: 'Active', kind: 'toggle' },
]
const SETTINGS_FIELDS: FieldSpec[] = [
  { key: 'openingCashCents', label: 'Opening cash (€)', kind: 'money' },
  { key: 'openingInvestmentCents', label: 'Opening investments (€)', kind: 'money' },
  { key: 'liquidNetWorthCents', label: 'Liquid net worth (€)', kind: 'money' },
]
const GOAL_FIELDS: FieldSpec[] = [
  { key: 'housePriceCents', label: 'House price (€)', kind: 'money' },
  { key: 'downPaymentFraction', label: 'Down payment (%)', kind: 'percent' },
  { key: 'mortgageTermYears', label: 'Mortgage term (years)', kind: 'number' },
  { key: 'mortgageRateAnnual', label: 'Mortgage rate (%)', kind: 'percent' },
  { key: 'longTermTargetCents', label: 'Long-term target (€)', kind: 'money' },
  { key: 'horizonYears', label: 'Horizon (years)', kind: 'number' },
  { key: 'expectedRealReturn', label: 'Expected real return (%)', kind: 'percent' },
]

interface Config {
  title: string
  submitLabel: string
  fields: FieldSpec[]
  initial: object
  onSubmit: (patch: Record<string, FieldValue>) => Promise<void>
}

function categoryConfig(
  target: Extract<EditTarget, { kind: 'category' }>,
  model: ExpenseModel,
  actions: ExpenseActions,
): Config {
  const nextOrder = Math.max(0, ...model.dataset.categories.map((c) => c.sortOrder)) + 1
  const record = target.record
  return {
    title: record ? `Edit ${record.name}` : 'New category',
    submitLabel: record ? 'Save category' : 'Add category',
    fields: CATEGORY_FIELDS,
    initial: record ?? { active: true, sortOrder: nextOrder, monthlyBudgetCents: 0 },
    onSubmit: (patch) =>
      record
        ? actions.updateCategory(record.id, patch)
        : actions.createCategory(patch as unknown as NewCategory),
  }
}

function accountConfig(
  target: Extract<EditTarget, { kind: 'account' }>,
  actions: ExpenseActions,
): Config {
  const record = target.record
  return {
    title: record ? `Edit ${record.name}` : 'New account',
    submitLabel: record ? 'Save account' : 'Add account',
    fields: ACCOUNT_FIELDS,
    initial: record ?? { active: true, settlement: 'immediate', kind: 'debit' },
    onSubmit: (patch) =>
      record
        ? actions.updateAccount(record.id, patch)
        : actions.createAccount(patch as unknown as NewAccount),
  }
}

function buildConfig(target: EditTarget, model: ExpenseModel, actions: ExpenseActions): Config {
  if (target.kind === 'category') return categoryConfig(target, model, actions)
  if (target.kind === 'account') return accountConfig(target, actions)
  if (target.kind === 'settings') {
    return {
      title: 'Opening balances',
      submitLabel: 'Save balances',
      fields: SETTINGS_FIELDS,
      initial: model.dataset.settings,
      onSubmit: (patch) => actions.updateSettings(patch),
    }
  }
  return {
    title: 'Goal inputs',
    submitLabel: 'Save goals',
    fields: GOAL_FIELDS,
    initial: model.dataset.goalInputs,
    onSubmit: (patch) => actions.updateGoals(patch),
  }
}

interface ConfigModalProps {
  target: EditTarget
  model: ExpenseModel
  actions: ExpenseActions
  onClose: () => void
}

export function ConfigModal({ target, model, actions, onClose }: ConfigModalProps) {
  const cfg = buildConfig(target, model, actions)
  return (
    <Modal title={cfg.title} onClose={onClose}>
      <RecordForm
        fields={cfg.fields}
        initial={cfg.initial}
        submitLabel={cfg.submitLabel}
        onSubmit={cfg.onSubmit}
        onClose={onClose}
      />
    </Modal>
  )
}
