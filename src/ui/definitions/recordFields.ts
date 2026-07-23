import {
  formatMoneyInput,
  formatPercentInput,
  parseMoneyToCents,
  parsePercentToFraction,
  type MoneyFormat,
} from '../../engine/money'

/**
 * Declarative field specs for the small definition forms (categories, accounts,
 * opening balances, goals). Keeps the editor generic so each form is a data list,
 * not bespoke JSX. Money is edited in the user's currency but stored in cents;
 * percentages are edited as whole numbers but stored as fractions.
 */
export type FieldKind = 'text' | 'money' | 'number' | 'percent' | 'toggle' | 'select'

export interface FieldSpec {
  key: string
  label: string
  kind: FieldKind
  options?: { value: string; label: string }[]
}

export type InputValue = string | boolean
export type FieldValue = string | number | boolean

/** Domain value -> form input representation. */
export function toInput(kind: FieldKind, raw: unknown, format: MoneyFormat): InputValue {
  if (kind === 'toggle') return Boolean(raw)
  if (raw == null) return ''
  if (kind === 'money') return formatMoneyInput(Number(raw), format)
  if (kind === 'percent') return formatPercentInput(Number(raw), format)
  if (kind === 'number') return String(Number(raw))
  return typeof raw === 'string' ? raw : ''
}

/** Form input representation -> domain value. */
export function fromInput(kind: FieldKind, value: InputValue, format: MoneyFormat): FieldValue {
  if (kind === 'toggle') return Boolean(value)
  if (kind === 'money') return parseMoneyToCents(String(value), format)
  if (kind === 'percent') return parsePercentToFraction(String(value), format)
  if (kind === 'number') return Number(value)
  return String(value)
}

export function buildInitial(
  fields: FieldSpec[],
  initial: object,
  format: MoneyFormat,
): Record<string, InputValue> {
  const rec = initial as Record<string, unknown>
  return Object.fromEntries(fields.map((f) => [f.key, toInput(f.kind, rec[f.key], format)]))
}

export function buildPatch(
  fields: FieldSpec[],
  values: Record<string, InputValue>,
  format: MoneyFormat,
): Record<string, FieldValue> {
  return Object.fromEntries(
    fields.map((f) => [f.key, fromInput(f.kind, values[f.key] ?? '', format)]),
  )
}
