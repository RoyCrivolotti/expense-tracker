/**
 * Formula-injection guard for CSV we hand to a spreadsheet.
 *
 * A value beginning `=`, `+`, `-`, `@`, tab or carriage return is evaluated as a
 * formula by Excel and Sheets. Descriptions arrive from bank imports, so they are not
 * ours to trust.
 *
 * Never apply this to a numeric column: money is written with a leading `-` for
 * credits, and prefixing it turns the column an approver sums into text.
 */
const TRIGGER = /^[=+\-@\t\r]/

export function guardCsvValue(value: string): string {
  return TRIGGER.test(value) ? `'${value}` : value
}

/**
 * Undo {@link guardCsvValue}. Exports are re-imported by `parseExportCsv`, which
 * resolves categories and accounts by exact name — without this, a guarded name no
 * longer matches the dataset it came from.
 *
 * Only strips an apostrophe that is followed by a trigger, so a value genuinely
 * starting with `'` survives untouched.
 */
export function unguardCsvValue(value: string): string {
  return value.startsWith("'") && TRIGGER.test(value.slice(1)) ? value.slice(1) : value
}
