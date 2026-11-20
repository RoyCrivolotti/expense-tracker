import { useCallback } from 'react'
import { reloadRecommendations } from '../../data/recommendationsApi'

/**
 * What the header button and a pull do: read the dataset again, and the payments waiting for a look, which are read by
 * their own list and not by the dataset.
 */
export function useRefreshAll(reloadDataset: () => void): () => void {
  return useCallback(() => {
    reloadDataset()
    reloadRecommendations()
  }, [reloadDataset])
}
