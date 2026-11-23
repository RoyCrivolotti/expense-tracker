import type { Account, Category, TxnType } from '../../types'
import { MonthInput } from '../components/MonthInput'
import { optionLabel } from '../components/pickerOptions'
import formStyles from '../components/TransactionForm.module.css'
import styles from './definitions.module.css'
import { TXN_TYPES, type Fields } from './planFieldsModel'

type SetField = <K extends keyof Fields>(
  key: K,
  value: Fields[K],
) => void

interface FieldProps {
  f: Fields
  set: SetField
}

export function PlanAmountFields({ f, set, symbol }: FieldProps & { symbol: string }) {
  return (
    <>
      <div className={formStyles.row}>
        <label className={formStyles.field}>
          <span className={formStyles.label}>Installment amount ({symbol})</span>
          <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={f.amount}
            onChange={(e) => set('amount', e.target.value)}
          />
        </label>
        <label className={formStyles.field}>
          <span className={formStyles.label}>Total installments</span>
          <input
            type="number"
            step="1"
            min="1"
            value={f.totalCount}
            onChange={(e) => set('totalCount', e.target.value)}
          />
        </label>
      </div>
    </>
  )
}

export function PlanScheduleFields({
  f,
  set,
  onTrapPausedChange,
}: FieldProps & { onTrapPausedChange?: ((paused: boolean) => void) | undefined }) {
  return (
    <>
      <div className={formStyles.row}>
        <label className={formStyles.field}>
          <span className={formStyles.label}>First tracked installment</span>
          <input
            type="number"
            step="1"
            value={f.startInstallmentIndex}
            onChange={(e) => set('startInstallmentIndex', e.target.value)}
          />
        </label>
        <div className={formStyles.field}>
          <span className={formStyles.label}>Anchor budget month</span>
          <MonthInput
            value={f.anchorBudgetMonth}
            ariaLabel="Anchor budget month"
            onChange={(v) => set('anchorBudgetMonth', v)}
            onTrapPausedChange={onTrapPausedChange}
          />
        </div>
      </div>
      <label className={formStyles.field}>
        <span className={formStyles.label}>Due day of month (1-31, optional)</span>
        <input
          type="number"
          step="1"
          min="1"
          max="31"
          value={f.dueDay}
          onChange={(e) => set('dueDay', e.target.value)}
        />
      </label>
    </>
  )
}

export function PlanAccountFields({
  f,
  set,
  accounts,
  categories,
}: FieldProps & {
  accounts: Pick<Account, 'id' | 'name' | 'active'>[]
  categories: Pick<Category, 'id' | 'name' | 'active'>[]
}) {
  return (
    <>
      <div className={formStyles.row}>
        <label className={formStyles.field}>
          <span className={formStyles.label}>Account</span>
          <select value={String(f.accountId)} onChange={(e) => set('accountId', Number(e.target.value))}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {optionLabel(a)}
              </option>
            ))}
          </select>
        </label>
        <label className={formStyles.field}>
          <span className={formStyles.label}>Category</span>
          <select value={String(f.categoryId)} onChange={(e) => set('categoryId', Number(e.target.value))}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {optionLabel(c)}
              </option>
            ))}
          </select>
        </label>
      </div>
    </>
  )
}

export function PlanKindFields({ f, set }: FieldProps) {
  return (
    <>
      <label className={formStyles.field}>
        <span className={formStyles.label}>Type</span>
        <select value={f.type} onChange={(e) => set('type', e.target.value as TxnType)}>
          {TXN_TYPES.map((t) => (
            <option key={t} value={t}>
              {t[0]!.toUpperCase() + t.slice(1)}
            </option>
          ))}
        </select>
      </label>
      <label className={styles.toggle}>
        <input type="checkbox" checked={f.active} onChange={(e) => set('active', e.target.checked)} />
        <span>Active</span>
      </label>
    </>
  )
}
