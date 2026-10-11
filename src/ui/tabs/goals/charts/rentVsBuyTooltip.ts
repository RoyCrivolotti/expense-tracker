import { formatCentsCompact } from '../../../../engine'
import type { MoneyFormat } from '../../../../engine/money'
import type { RentVsBuyPoint } from '../../../../engine'
import type { TooltipLine } from '../../../charts/ChartTooltip'
import { formatMoneyShort } from '../chartTheme'

/** A change in what the buyer invests that is worth saying the year before's figure for: a quarter, and a hundred euros. */
const JUMP_SHARE = 0.25
const JUMP_MIN_CENTS = 10_000

const yearsAfter = (n: number) => (n === 1 ? '1 year after buying' : `${n} years after buying`)

function invested(cents: number, previous: number | undefined, format: MoneyFormat): string {
  if (cents <= 0) return 'nothing'
  const now = formatCentsCompact(cents, format)
  const jumped = previous !== undefined && Math.abs(cents - previous) >= Math.max(JUMP_MIN_CENTS, JUMP_SHARE * previous)
  return jumped ? `${now} (was ${previous <= 0 ? 'nothing' : formatCentsCompact(previous, format)})` : now
}

/**
 * What the readout says for a year: both totals in the colour of their line, then what each side holds
 * and what each pays and invests a month. The parts are small print under the totals. A year has no
 * month behind it at the day of the purchase, and nothing is added or saved yet.
 */
export function rentVsBuyTooltip(
  points: readonly RentVsBuyPoint[],
  index: number,
  { format, rentColor, buyColor }: { format: MoneyFormat; rentColor: string; buyColor: string },
): { title: string; lines: TooltipLine[] } {
  const p = points[index]
  if (!p) return { title: '', lines: [] }
  const short = (cents: number) => formatMoneyShort(cents, format)
  const detail = (label: string, value: string): TooltipLine => ({ label, value, tone: 'neutral', variant: 'detail' })
  const after = p.year > 0
  const lines: TooltipLine[] = [
    { label: 'Renter total', value: short(p.rentNetWorthCents), color: rentColor, tone: 'neutral' },
    { label: 'Buyer total', value: short(p.buyNetWorthCents), color: buyColor, tone: 'neutral' },
    detail('Renter: start cash, grown', short(p.rentSeedCents)),
    ...(after ? [detail('Renter: invested since', short(p.rentExtraCents))] : []),
    detail('Buyer: house worth', short(p.houseValueCents)),
    detail('Buyer: loan left', short(-p.loanLeftCents)),
    ...(after ? [detail('Buyer: savings', short(p.buySavingsCents))] : []),
  ]
  if (after) {
    const before = points[index - 1]
    lines.push(
      detail('Renter pays a month', formatCentsCompact(p.rentHousingMonthlyCents, format)),
      detail('Renter invests a month', invested(p.rentInvestsMonthlyCents, before?.rentInvestsMonthlyCents, format)),
      detail('Buyer pays a month', formatCentsCompact(p.buyHousingMonthlyCents, format)),
      detail('Buyer invests a month', invested(p.buyInvestsMonthlyCents, before?.buyInvestsMonthlyCents, format)),
    )
  }
  return { title: p.year === 0 ? 'The day you buy' : yearsAfter(p.year), lines }
}
