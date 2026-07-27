import { useState } from 'react'
import type { Account, Category } from '../../types'
import type {
  DeleteAccountOptions,
  DeleteCategoryOptions,
  NewAccount,
  NewCategory,
} from '../../data/dataSource'
import type { ExpenseModel } from '../useExpenseData'
import type { ExpenseActions } from '../actions'
import { Modal } from '../components/Modal'
import { ConfirmSheet } from '../components/ConfirmSheet'
import { ReassignDeleteSheet, type ReassignOption, type ReassignTarget } from '../components/ReassignDeleteSheet'
import { RecordForm } from './RecordForm'
import { useMoneyFormat } from '../hooks/moneyFormatContext'
import { accountUsageCount, categoryUsageCount } from './recordUsage'
import type { FieldSpec, FieldValue } from './recordFields'
import styles from './definitions.module.css'

export type EditTarget =
  | { kind: 'category'; record: Category | null }
  | { kind: 'account'; record: Account | null }
  | { kind: 'settings' }
  | { kind: 'goals' }

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
  { key: 'liquidNetWorthCents', label: `Liquid net worth (${cur})`, kind: 'money' },
]
const goalFields = (cur: string): FieldSpec[] => [
  { key: 'housePriceCents', label: `House price (${cur})`, kind: 'money' },
  { key: 'downPaymentFraction', label: 'Down payment (%)', kind: 'percent' },
  { key: 'mortgageTermYears', label: 'Mortgage term (years)', kind: 'number' },
  { key: 'mortgageRateAnnual', label: 'Mortgage rate (%)', kind: 'percent' },
  { key: 'longTermTargetCents', label: `Long-term target (${cur})`, kind: 'money' },
  { key: 'horizonYears', label: 'Horizon (years)', kind: 'number' },
  { key: 'expectedRealReturn', label: 'Expected real return (%)', kind: 'percent' },
]

interface DeleteConfig {
  label: string
  noun: 'category' | 'account'
  usageCount: number
  otherOptions: ReassignOption[]
  /** True when this is the tenant's only record of this kind — deleting it is blocked. */
  isLast: boolean
  onPlainDelete: () => Promise<void>
  onReassignDelete: (target: ReassignTarget) => Promise<void>
}

interface Config {
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
): DeleteConfig {
  return {
    label: record.name,
    noun: 'category',
    usageCount: categoryUsageCount(model.dataset, record.id),
    otherOptions: model.dataset.categories
      .filter((c) => c.id !== record.id)
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
): DeleteConfig {
  return {
    label: record.name,
    noun: 'account',
    usageCount: accountUsageCount(model.dataset, record.id),
    otherOptions: model.dataset.accounts
      .filter((a) => a.id !== record.id)
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
): Config {
  const nextOrder = Math.max(0, ...model.dataset.categories.map((c) => c.sortOrder)) + 1
  const record = target.record
  return {
    title: record ? `Edit ${record.name}` : 'New category',
    submitLabel: record ? 'Save category' : 'Add category',
    fields: categoryFields(cur),
    initial: record ?? { active: true, sortOrder: nextOrder, monthlyBudgetCents: 0 },
    onSubmit: (patch) =>
      record
        ? actions.updateCategory(record.id, patch)
        : actions.createCategory(patch as unknown as NewCategory),
    ...(record ? { delete: categoryDeleteConfig(record, model, actions) } : {}),
  }
}

function accountConfig(
  target: Extract<EditTarget, { kind: 'account' }>,
  model: ExpenseModel,
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
    ...(record ? { delete: accountDeleteConfig(record, model, actions) } : {}),
  }
}

function buildConfig(
  target: EditTarget,
  model: ExpenseModel,
  actions: ExpenseActions,
  cur: string,
): Config {
  if (target.kind === 'category') return categoryConfig(target, model, actions, cur)
  if (target.kind === 'account') return accountConfig(target, model, actions)
  if (target.kind === 'settings') {
    return {
      title: 'Opening balances',
      submitLabel: 'Save balances',
      fields: settingsFields(cur),
      initial: model.dataset.settings,
      onSubmit: (patch) => actions.updateSettings(patch),
    }
  }
  return {
    title: 'Goal inputs',
    submitLabel: 'Save goals',
    fields: goalFields(cur),
    initial: model.dataset.goalInputs,
    onSubmit: (patch) => actions.updateGoals(patch),
  }
}

type DeleteMode = 'idle' | 'confirm' | 'reassign'

function DeleteControl({
  config,
  onDeleted,
  mode,
  onModeChange,
}: {
  config: DeleteConfig
  onDeleted: () => void
  mode: DeleteMode
  onModeChange: (mode: DeleteMode) => void
}) {
  const [err, setErr] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  if (config.isLast) {
    return (
      <p className={styles.deleteNote}>
        You need at least one {config.noun}, so this one can&apos;t be deleted.
      </p>
    )
  }

  const runPlainDelete = async () => {
    if (deleting) return
    setDeleting(true)
    try {
      await config.onPlainDelete()
      onDeleted()
    } catch (e) {
      onModeChange('idle')
      setErr(e instanceof Error ? e.message : 'Could not delete')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <button
        type="button"
        className={`${styles.editBtn} ${styles.deleteBtn}`}
        onClick={() => {
          setErr(null)
          onModeChange(config.usageCount > 0 ? 'reassign' : 'confirm')
        }}
      >
        Delete {config.noun}
      </button>
      {err && <p className={styles.deleteError}>{err}</p>}
      {mode === 'confirm' ? (
        <ConfirmSheet
          title={`Delete ${config.label}?`}
          message="This can't be undone."
          confirmLabel="Delete"
          destructive
          onConfirm={() => void runPlainDelete()}
          onCancel={() => onModeChange('idle')}
        />
      ) : null}
      {mode === 'reassign' ? (
        <ReassignDeleteSheet
          title={`Delete ${config.label}?`}
          message={`This ${config.noun} is used by ${config.usageCount} record${config.usageCount === 1 ? '' : 's'}. Move them to another ${config.noun} first, or create a new one.`}
          options={config.otherOptions}
          createLabel={config.noun}
          onConfirm={(target) => config.onReassignDelete(target).then(onDeleted)}
          onCancel={() => onModeChange('idle')}
        />
      ) : null}
    </>
  )
}

interface ConfigModalProps {
  target: EditTarget
  model: ExpenseModel
  actions: ExpenseActions
  onClose: () => void
}

export function ConfigModal({ target, model, actions, onClose }: ConfigModalProps) {
  const { symbol } = useMoneyFormat()
  const cfg = buildConfig(target, model, actions, symbol)
  const [deleteMode, setDeleteMode] = useState<DeleteMode>('idle')
  // While a delete confirm/reassign sheet is open, Escape/backdrop should close just that
  // sheet — otherwise the sheet's own Escape handler and this Modal's both fire (they're
  // independent document-level listeners), closing the whole editor out from under it.
  const dismiss = deleteMode !== 'idle' ? () => setDeleteMode('idle') : onClose
  return (
    <Modal title={cfg.title} onClose={dismiss}>
      <RecordForm
        fields={cfg.fields}
        initial={cfg.initial}
        submitLabel={cfg.submitLabel}
        onSubmit={cfg.onSubmit}
        onClose={onClose}
      />
      {cfg.delete ? (
        <DeleteControl config={cfg.delete} onDeleted={onClose} mode={deleteMode} onModeChange={setDeleteMode} />
      ) : null}
    </Modal>
  )
}
