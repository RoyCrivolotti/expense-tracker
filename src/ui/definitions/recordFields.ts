import { formatEuroInput, parseEuroToCents } from '../../engine/money'

/**
 * Declarative field specs for the small definition forms (categories, accounts,
 * opening balances, goals). Keeps the editor generic so each form is a data list,
 * not bespoke JSX. Money is edited in euros but stored in cents; percentages are
 * edited as whole numbers but stored as fractions.
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
export function toInput(kind: FieldKind, raw: unknown): InputValue {
  if (kind === 'toggle') return Boolean(raw)
  if (raw == null) return ''
  if (kind === 'money') return formatEuroInput(Number(raw))
  if (kind === 'percent') return String(Number(raw) * 100)
  if (kind === 'number') return String(Number(raw))
  return typeof raw === 'string' ? raw : ''
}

/** Form input representation -> domain value. */
export function fromInput(kind: FieldKind, value: InputValue): FieldValue {
  if (kind === 'toggle') return Boolean(value)
  if (kind === 'money') return parseEuroToCents(String(value))
  if (kind === 'percent') return Number(value) / 100
  if (kind === 'number') return Number(value)
  return String(value)
}

export function buildInitial(fields: FieldSpec[], initial: object): Record<string, InputValue> {
  const rec = initial as Record<string, unknown>
  return Object.fromEntries(fields.map((f) => [f.key, toInput(f.kind, rec[f.key])]))
}

export function buildPatch(
  fields: FieldSpec[],
  values: Record<string, InputValue>,
): Record<string, FieldValue> {
  return Object.fromEntries(fields.map((f) => [f.key, fromInput(f.kind, values[f.key] ?? '')]))
}
