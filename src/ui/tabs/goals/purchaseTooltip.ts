import type { PurchaseYearBreakdown } from '../../../engine'
import type { TooltipLine } from '../../charts/ChartTooltip'
import { formatEuroShort, formatSignedEuroShort } from './chartTheme'

/** Tooltip lines explaining growth → contribution → purchase withdrawal at one year. */
export function purchaseBreakdownTooltipLines(breakdown: PurchaseYearBreakdown): TooltipLine[] {
  return [
    { label: 'Purchase breakdown', value: '', variant: 'detail', tone: 'neutral' },
    {
      label: 'Start of year',
      value: formatEuroShort(breakdown.startInvestedCents),
      variant: 'detail',
      tone: 'neutral',
    },
    {
      label: 'Return this year',
      value: formatSignedEuroShort(breakdown.growthCents),
      variant: 'detail',
      tone: breakdown.growthCents >= 0 ? 'income' : 'expense',
    },
    {
      label: 'Contributions',
      value: formatSignedEuroShort(breakdown.contributionCents),
      variant: 'detail',
      tone: breakdown.contributionCents >= 0 ? 'income' : 'expense',
    },
    {
      label: 'Down payment + fees',
      value: formatSignedEuroShort(-breakdown.totalWithdrawalCents),
      variant: 'detail',
      tone: 'expense',
    },
    {
      label: 'End invested',
      value: formatEuroShort(breakdown.endInvestedCents),
      variant: 'detail',
      tone: 'neutral',
    },
    {
      label: 'Step vs prior year',
      value: formatSignedEuroShort(breakdown.netChangeCents),
      variant: 'detail',
      tone: breakdown.netChangeCents >= 0 ? 'income' : 'expense',
    },
  ]
}
