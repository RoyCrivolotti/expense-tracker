import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchRecommendations, onRecommendationsChanged, type RecommendationInfo } from '../../data/recommendationsApi'

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong'
}

/** The first page, then more while fewer rows than `want` are in hand, so a read after a decision keeps what was loaded. */
async function readLoaded(want: number) {
  let page = await fetchRecommendations()
  let rows = page.recommendations
  // A bounded walk: the list is capped well below this many pages.
  for (let pages = 1; page.next && rows.length < want && pages < 20; pages++) {
    page = await fetchRecommendations(page.next)
    rows = [...rows, ...page.recommendations]
  }
  return { rows, next: page.next, openCount: page.openCount }
}

/**
 * The person's open recommendations, newest day first, read once on mount (when `enabled`) and again whenever one is
 * decided in the add form. `remove` drops a row the caller has just decided, without another read.
 */
export function useRecommendationList(enabled: boolean) {
  const [items, setItems] = useState<RecommendationInfo[] | null>(null)
  const [next, setNext] = useState<string | null>(null)
  const [openCount, setOpenCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  // How many reads have landed, so a caller can tell the rows are the server's latest.
  const [loads, setLoads] = useState(0)
  // How many rows were showing, so a read brings back as many rather than only the first page.
  const shown = useRef(0)

  useEffect(() => {
    if (!enabled) return
    let current = true
    readLoaded(shown.current).then(
      ({ rows, next: after, openCount: count }) => {
        if (!current) return
        shown.current = rows.length
        setItems(rows)
        setNext(after)
        setOpenCount(count)
        setError(null)
        setLoads((n) => n + 1)
      },
      (e: unknown) => current && setError(messageOf(e)),
    )
    return () => {
      current = false
    }
  }, [enabled, version])

  useEffect(() => (enabled ? onRecommendationsChanged(() => setVersion((v) => v + 1)) : undefined), [enabled])

  const more = useCallback(async () => {
    if (!next) return
    try {
      const page = await fetchRecommendations(next)
      shown.current += page.recommendations.length
      setItems((held) => [...(held ?? []), ...page.recommendations])
      setNext(page.next)
      setOpenCount(page.openCount)
      setError(null)
    } catch (e) {
      setError(messageOf(e))
    }
  }, [next])

  const remove = useCallback((id: string) => {
    shown.current = Math.max(0, shown.current - 1)
    setItems((held) => (held ? held.filter((r) => r.id !== id) : held))
    setOpenCount((n) => Math.max(0, n - 1))
  }, [])

  return {
    items,
    hasMore: next !== null,
    openCount,
    loads,
    error,
    more,
    remove,
    retry: () => {
      setError(null)
      setVersion((v) => v + 1)
    },
  }
}
