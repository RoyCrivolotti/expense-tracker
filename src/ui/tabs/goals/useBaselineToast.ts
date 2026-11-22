import { useEffect } from 'react'
import { formatCents } from '../../../engine'
import { useMoneyFormat } from '../../hooks/moneyFormatContext'
import { useToast } from '../../hooks/useToast'

/**
 * Said out loud as well: a measured spend equal to the plan's changes nothing on screen. Told once per arrival, when the
 * Analytics baseline has landed in the draft.
 */
export function useBaselineToast(baselineAnnualCents: number | null): void {
  const { showToast } = useToast()
  const moneyFormat = useMoneyFormat()
  useEffect(() => {
    if (baselineAnnualCents === null) return
    showToast(
      `Annual spend at FI set to ${formatCents(baselineAnnualCents, moneyFormat)} from your measured spending. Save to keep it.`,
    )
  }, [baselineAnnualCents, moneyFormat, showToast])
}
