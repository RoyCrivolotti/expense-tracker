import type { Account, Category } from '../../types'
import type { DeleteAccountOptions, DeleteCategoryOptions, NewAccount, NewCategory } from '../../data/dataSource'
import type { ExpenseModel } from '../useExpenseData'
import type { ExpenseActions } from '../actions'
import type { ReassignOption, ReassignTarget } from '../components/ReassignDeleteSheet'
import type { UsageView } from './recordUsage'
import type { FieldSpec, FieldValue } from './recordFields'

export type EditTarget =
  { kind: 'category'; record: Category | null } | { kind: 'account'; record: Account | null } | { kind: 'settings' }

const categoryFields = (cur: string): FieldSpec[] => [
  { key: 'name', label: 'Name', kind: 'text' },
  { key: 'icon', label: 'Icon (emoji)', kind: 'text' },
  { key: 'monthlyBudgetCents', label: `Monthly budget (${cur})`, kind: 'money' },
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
const settingsFields = (cur: string): FieldSpec[] => [
  { key: 'openingCashCents', label: `Opening cash (${cur})`, kind: 'money' },
  { key: 'openingInvestmentCents', label: `Opening investments (${cur})`, kind: 'money' },
]

export interface DeleteConfig {
  label: string
  noun: 'category' | 'account'
  /** How many records name it, or null while that is not known (see `UsageView`). */
  usageCount: number | null
  /** The counts it was taken from, which the delete says when they cannot be taken as they are. */
  usage: UsageView
  otherOptions: ReassignOption[]
  /** True when this is the tenant's only record of this kind — deleting it is blocked. */
  isLast: boolean
  onPlainDelete: () => Promise<void>
  onReassignDelete: (target: ReassignTarget) => Promise<void>
}

export interface Config {
  title: string
  submitLabel: string
  fields: FieldSpec[]
  initial: object
  onSubmit: (patch: Record<string, FieldValue>) => Promise<void>
  delete?: DeleteConfig
}

function withoutId<T extends { id: number }>({ id: _id, ...rest }: T): Omit<T, 'id'> {
  return rest
}

function categoryDeleteConfig(
  record: Category,
  model: ExpenseModel,
  actions: ExpenseActions,
  usage: UsageView,
): DeleteConfig {
  return {
    label: record.name,
    noun: 'category',
    usageCount: usage.count('category', record.id),
    usage,
    // Active = archive: reassigning should never link records to an already-inactive
    // category, same rule as the transaction/installment pickers (PR3). If every other
    // category is inactive, the list is empty and ReassignDeleteSheet falls back to
    // create-new, which is fine.
    otherOptions: model.dataset.categories
      .filter((c) => c.id !== record.id && c.active)
      .map((c) => ({ id: c.id, name: c.name })),
    isLast: model.dataset.categories.length <= 1,
    onPlainDelete: async () => {
      await actions.deleteCategory(record.id)
    },
    onReassignDelete: async (target) => {
      const options: DeleteCategoryOptions =
        'reassignToId' in target
          ? { reassignToId: target.reassignToId }
          : { createCategory: { ...withoutId(record), name: target.createName } }
      await actions.deleteCategory(record.id, options)
    },
  }
}

function accountDeleteConfig(
  record: Account,
  model: ExpenseModel,
  actions: ExpenseActions,
  usage: UsageView,
): DeleteConfig {
  return {
    label: record.name,
    noun: 'account',
    usageCount: usage.count('account', record.id),
    usage,
    // See the matching comment in categoryDeleteConfig: reassign targets stay active-only.
    otherOptions: model.dataset.accounts
      .filter((a) => a.id !== record.id && a.active)
      .map((a) => ({ id: a.id, name: a.name })),
    isLast: model.dataset.accounts.length <= 1,
    onPlainDelete: async () => {
      await actions.deleteAccount(record.id)
    },
    onReassignDelete: async (target) => {
      const options: DeleteAccountOptions =
        'reassignToId' in target
          ? { reassignToId: target.reassignToId }
          : { createAccount: { ...withoutId(record), name: target.createName } }
      await actions.deleteAccount(record.id, options)
    },
  }
}

function categoryConfig(
  target: Extract<EditTarget, { kind: 'category' }>,
  model: ExpenseModel,
  actions: ExpenseActions,
  cur: string,
  usage: UsageView,
): Config {
  const nextOrder = Math.max(0, ...model.dataset.categories.map((c) => c.sortOrder)) + 1
  const record = target.record
  return {
    title: record ? `Edit ${record.name}` : 'New category',
    submitLabel: record ? 'Save category' : 'Add category',
    fields: categoryFields(cur),
    initial: record ?? { active: true, sortOrder: nextOrder, monthlyBudgetCents: 0 },
    onSubmit: (patch) =>
      record ? actions.updateCategory(record.id, patch) : actions.createCategory(patch as unknown as NewCategory),
    ...(record ? { delete: categoryDeleteConfig(record, model, actions, usage) } : {}),
  }
}

function accountConfig(
  target: Extract<EditTarget, { kind: 'account' }>,
  model: ExpenseModel,
  actions: ExpenseActions,
  usage: UsageView,
): Config {
  const record = target.record
  return {
    title: record ? `Edit ${record.name}` : 'New account',
    submitLabel: record ? 'Save account' : 'Add account',
    fields: ACCOUNT_FIELDS,
    initial: record ?? { active: true, settlement: 'immediate', kind: 'debit' },
    onSubmit: (patch) =>
      record ? actions.updateAccount(record.id, patch) : actions.createAccount(patch as unknown as NewAccount),
    ...(record ? { delete: accountDeleteConfig(record, model, actions, usage) } : {}),
  }
}

export function buildConfig(
  target: EditTarget,
  model: ExpenseModel,
  actions: ExpenseActions,
  cur: string,
  usage: UsageView,
): Config {
  if (target.kind === 'category') return categoryConfig(target, model, actions, cur, usage)
  if (target.kind === 'account') return accountConfig(target, model, actions, usage)
  return {
    title: 'Opening balances',
    submitLabel: 'Save balances',
    fields: settingsFields(cur),
    initial: model.dataset.settings,
    onSubmit: (patch) => actions.updateSettings(patch),
  }
}
