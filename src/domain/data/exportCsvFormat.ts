/** Shared transaction CSV export/import format (comma-separated, quoted fields). */
export const EXPORT_CSV_HEADER =
  'id,date,budget_month,description,category,account,type,amount_cents,status,cancelled,notes'

export const EXPORT_CSV_COLUMNS = [
  'id',
  'date',
  'budget_month',
  'description',
  'category',
  'account',
  'type',
  'amount_cents',
  'status',
  'cancelled',
  'notes',
] as const

export const EXPORT_CSV_TYPES = ['expense', 'income', 'investment', 'refund'] as const

/** One-line import template with a placeholder example row. */
export function buildImportCsvTemplate(): string {
  const example = [
    '',
    '2026-07-01',
    '2026-07',
    'Example purchase',
    'Groceries',
    'Santander Debit',
    'expense',
    '1250',
    'posted',
    '0',
    '',
  ].join(',')
  return `${EXPORT_CSV_HEADER}\n${example}\n`
}

/** Short human-readable column summary for UI and docs. */
export function describeExportCsvColumns(): string {
  return EXPORT_CSV_COLUMNS.join(', ')
}
