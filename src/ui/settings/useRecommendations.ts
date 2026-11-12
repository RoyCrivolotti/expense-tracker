import { useCallback, useEffect, useRef, useState } from 'react'
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

/** The open recommendations, read again whenever one is decided here or in the add form. */
export function useRecommendations() {
  const [items, setItems] = useState<RecommendationInfo[] | null>(null)
  const [next, setNext] = useState<string | null>(null)
  const [openCount, setOpenCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [version, setVersion] = useState(0)
  // How many rows were showing, so a read after a decision brings back as many rather than only the first page.
  const shown = useRef(0)

  useEffect(() => {
    let current = true
    readLoaded(shown.current).then(
      ({ rows, next: after, openCount: count }) => {
        if (!current) return
        shown.current = rows.length
        setItems(rows)
        setNext(after)
        setOpenCount(count)
        setError(null)
      },
      (e: unknown) => current && setError(messageOf(e)),
    )
    return () => {
      current = false
    }
  }, [version])

  useEffect(() => onRecommendationsChanged(() => setVersion((v) => v + 1)), [])

  /** Runs a call with the busy flag and the error, and reads the list again after it unless `reread` is false. */
  const act = useCallback(async (run: () => Promise<void>, reread = true) => {
    setBusy(true)
    setError(null)
    try {
      await run()
      if (reread) setVersion((v) => v + 1)
    } catch (e) {
      setError(messageOf(e))
    } finally {
      setBusy(false)
    }
  }, [])

  const more = useCallback(async () => {
    if (!next) return
    await act(async () => {
      const page = await fetchRecommendations(next)
      shown.current += page.recommendations.length
      setItems((held) => [...(held ?? []), ...page.recommendations])
      setNext(page.next)
      setOpenCount(page.openCount)
    }, false)
  }, [next, act])

  return {
    items,
    hasMore: next !== null,
    openCount,
    error,
    busy,
    more,
    retry: () => act(() => Promise.resolve()),
    dismiss: (id: string) => act(() => dismissRecommendation(id)),
    link: (id: string, transactionId: number) => act(() => linkRecommendation(id, transactionId)),
  }
}
