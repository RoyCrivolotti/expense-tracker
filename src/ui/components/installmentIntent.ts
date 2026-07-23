/**
 * Pure builder/validator translating the installment step's draft fields into a
 * persistence intent. No I/O: the transaction modal applies the result on save.
 */

export type InstallmentIntent =
  | { kind: 'none' }
  | { kind: 'new'; totalCount: number; installmentIndex: number }
  // `link` also covers moving a row to a different plan (a new planId).
  | { kind: 'link'; planId: number; installmentIndex: number }
  | { kind: 'unlink' }

export type InstallmentMode = 'none' | 'new' | 'existing' | 'unlink'

export interface InstallmentDraft {
  mode: InstallmentMode
  /** Total installments: user-entered for 'new', the plan's total for 'existing'. */
  totalCount: string
  installmentIndex: string
  /** Selected plan for 'existing'. */
  planId: number | null
}

export type IntentResult = { ok: true; intent: InstallmentIntent } | { ok: false; error: string }

function parseCount(value: string): number | null {
  const n = Number(value)
  return Number.isInteger(n) && n >= 1 ? n : null
}

function validateIndex(installmentIndex: string, totalCount: number): number | null {
  const idx = Number(installmentIndex)
  if (!Number.isInteger(idx) || idx < 1 || idx > totalCount) return null
  return idx
}

export function buildInstallmentIntent(draft: InstallmentDraft): IntentResult {
  if (draft.mode === 'none') return { ok: true, intent: { kind: 'none' } }
  if (draft.mode === 'unlink') return { ok: true, intent: { kind: 'unlink' } }

  const total = parseCount(draft.totalCount)
  if (total == null) return { ok: false, error: 'Total installments must be a whole number of 1 or more' }
  const index = validateIndex(draft.installmentIndex, total)
  if (index == null) return { ok: false, error: `Installment number must be between 1 and ${total}` }

  if (draft.mode === 'new') {
    return { ok: true, intent: { kind: 'new', totalCount: total, installmentIndex: index } }
  }
  if (draft.planId == null) return { ok: false, error: 'Choose an installment plan' }
  return { ok: true, intent: { kind: 'link', planId: draft.planId, installmentIndex: index } }
}
