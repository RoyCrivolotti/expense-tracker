import { formatCents } from '../../engine'

/** Money with no symbol; a dash for exact zero to keep wide tables readable. */
export const money = (cents: number): string => (cents === 0 ? '—' : formatCents(cents, false))

/** Money that always renders (used for cumulative balances, which are rarely 0). */
export const moneyAlways = (cents: number): string => formatCents(cents, false)

/** Sum a numeric field across rows (for footer totals on flow columns). */
export const sum = <R>(rows: R[], pick: (row: R) => number): number =>
  rows.reduce((acc, row) => acc + pick(row), 0)

/** CSS module class for non-zero reconciliation gaps. */
export function gapCellClass(gap: number | null, overClass: string | undefined): string | undefined {
  return gap === null || gap === 0 ? undefined : overClass
}
