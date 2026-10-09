import type { LabeledMarker } from '../../../charts/linearChartParts'
import type { RentVsBuyResult } from '../../../../engine'

/**
 * The turning points the chart names: when owning starts to cost the buyer less a month than renting
 * (and whether it stays so), and the year the loan is paid off. One that falls past the end of the
 * chart is left out.
 */
export function rentVsBuyMarkers(
  result: Pick<RentVsBuyResult, 'ownCheaper' | 'loanPaidOffYear'>,
  lastYear: number,
): LabeledMarker[] {
  const markers: LabeledMarker[] = []
  const { ownCheaper, loanPaidOffYear } = result
  if (ownCheaper && ownCheaper.fromYear <= lastYear) {
    markers.push({
      index: ownCheaper.fromYear,
      label: ownCheaper.stays ? 'Owning cheaper from here' : 'Owning first cheaper',
      title: ownCheaper.stays
        ? 'From here, owning costs the buyer less a month than renting costs the renter, for the rest of the chart.'
        : 'From here, owning first costs the buyer less a month than renting costs the renter, though not for the rest of the chart.',
    })
  }
  if (loanPaidOffYear !== null && loanPaidOffYear <= lastYear) {
    markers.push({ index: loanPaidOffYear, label: 'Loan paid off', title: 'The loan is paid off here: from now on the buyer pays no loan payment.' })
  }
  return markers
}
