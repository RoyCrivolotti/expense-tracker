import { useCallback, useEffect, useState } from 'react'
import {
  dismissRecommendation,
  fetchRecommendations,
  linkRecommendation,
  onRecommendationsChanged,
  type RecommendationInfo,
} from '../../data/recommendationsApi'

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong'
}

/** The open recommendations, read again whenever one is decided here or in the add form. */
export function useRecommendations() {
  const [items, setItems] = useState<RecommendationInfo[] | null>(null)
  const [next, setNext] = useState<string | null>(null)
  const [openCount, setOpenCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let current = true
    fetchRecommendations().then(
      (page) => {
        if (!current) return
        setItems(page.recommendations)
        setNext(page.next)
        setOpenCount(page.openCount)
      },
      (e: unknown) => current && setError(messageOf(e)),
    )
    return () => {
      current = false
    }
  }, [version])

  useEffect(() => onRecommendationsChanged(() => setVersion((v) => v + 1)), [])

  const act = useCallback(async (run: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await run()
      setVersion((v) => v + 1)
    } catch (e) {
      setError(messageOf(e))
    } finally {
      setBusy(false)
    }
  }, [])

  const more = useCallback(async () => {
    if (!next) return
    setBusy(true)
    try {
      const page = await fetchRecommendations(next)
      setItems((held) => [...(held ?? []), ...page.recommendations])
      setNext(page.next)
      setOpenCount(page.openCount)
    } catch (e) {
      setError(messageOf(e))
    } finally {
      setBusy(false)
    }
  }, [next])

  return {
    items,
    hasMore: next !== null,
    openCount,
    error,
    busy,
    more,
    dismiss: (id: string) => act(() => dismissRecommendation(id)),
    link: (id: string, transactionId: number) => act(() => linkRecommendation(id, transactionId)),
  }
}
