import { useEffect } from 'react'
import type { RefreshOutcome } from '../useExpenseData'
import { useToast } from './useToast'

export function useRefreshToast(refreshing: boolean, refreshOutcome: RefreshOutcome): void {
  const { showToast } = useToast()
  useEffect(() => {
    if (refreshing || refreshOutcome == null) return
    if (refreshOutcome === 'ok') showToast('Updated', 'success')
    else showToast("Couldn't refresh", 'error')
  }, [refreshing, refreshOutcome, showToast])
}
