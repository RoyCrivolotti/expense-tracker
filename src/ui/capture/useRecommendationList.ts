import { useCallback, useEffect, useState } from 'react'
import { ReadBook } from './readBook'
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
 * The person's open recommendations, newest day first, read once on mount and again whenever one is
 * decided in the add form. `remove` drops a row the caller has just decided, without another read.
 */
export function useRecommendationList() {
  const [items, setItems] = useState<RecommendationInfo[] | null>(null)
  const [next, setNext] = useState<string | null>(null)
  const [openCount, setOpenCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  // `asked` is true for the first read and for Retry, so only a read the person is waiting on shows its failure; a
  // refresh or a return to the app keeps the rows on screen, which offline are still the best the app has.
  const [version, setVersion] = useState({ n: 0, asked: true })
  // How many reads have landed, so a caller can tell the rows are the server's latest.
  const [loads, setLoads] = useState(0)
  const [book] = useState(() => new ReadBook())

  useEffect(() => {
    let current = true
    const since = book.begin()
    readLoaded(book.held).then(
      (read) => {
        if (!current) return
        const { rows, next: after, openCount: count } = book.landed(read, since)
        setItems(rows)
        setNext(after)
        setOpenCount(count)
        setError(null)
        setLoads((n) => n + 1)
      },
      (e: unknown) => current && version.asked && setError(messageOf(e)),
    )
    return () => {
      current = false
    }
  }, [version, book])

  useEffect(() => onRecommendationsChanged(() => setVersion((v) => ({ n: v.n + 1, asked: false }))), [])

  const more = useCallback(async () => {
    if (!next) return
    try {
      const page = await fetchRecommendations(next)
      book.grew(page)
      setItems((held) => [...(held ?? []), ...page.recommendations])
      setNext(page.next)
      setOpenCount(page.openCount)
      setError(null)
    } catch (e) {
      setError(messageOf(e))
    }
  }, [next, book])

  const remove = useCallback(
    (id: string) => {
      book.decided(id)
      setItems((held) => (held ? held.filter((r) => r.id !== id) : held))
      setOpenCount((n) => Math.max(0, n - 1))
    },
    [book],
  )

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
      setVersion((v) => ({ n: v.n + 1, asked: true }))
    },
  }
}
