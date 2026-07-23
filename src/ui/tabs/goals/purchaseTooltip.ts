import type { MoneyFormat, PurchaseYearBreakdown } from '../../../engine'
import type { TooltipLine } from '../../charts/ChartTooltip'
import { formatMoneyShort, formatSignedMoneyShort } from './chartTheme'

/** Tooltip lines explaining growth → contribution → purchase withdrawal at one year. */
export function purchaseBreakdownTooltipLines(
  breakdown: PurchaseYearBreakdown,
  format: MoneyFormat,
): TooltipLine[] {
  return [
    { label: 'Purchase breakdown', value: '', variant: 'detail', tone: 'neutral' },
    {
      label: 'Start of year',
      value: formatMoneyShort(breakdown.startInvestedCents, format),
      variant: 'detail',
      tone: 'neutral',
    },
    {
      label: 'Return this year',
      value: formatSignedMoneyShort(breakdown.growthCents, format),
      variant: 'detail',
      tone: breakdown.growthCents >= 0 ? 'income' : 'expense',
    },
    {
      label: 'Contributions',
      value: formatSignedMoneyShort(breakdown.contributionCents, format),
      variant: 'detail',
      tone: breakdown.contributionCents >= 0 ? 'income' : 'expense',
    },
    {
      label: 'Down payment + fees',
      value: formatSignedMoneyShort(-breakdown.totalWithdrawalCents, format),
      variant: 'detail',
      tone: 'expense',
    },
    {
      label: 'End invested',
      value: formatMoneyShort(breakdown.endInvestedCents, format),
      variant: 'detail',
      tone: 'neutral',
    },
    {
      label: 'Step vs prior year',
      value: formatSignedMoneyShort(breakdown.netChangeCents, format),
      variant: 'detail',
      tone: breakdown.netChangeCents >= 0 ? 'income' : 'expense',
    },
  ]
}
