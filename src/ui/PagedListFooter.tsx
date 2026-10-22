import { useEffect, useRef, useSyncExternalStore } from 'react'
import type { TransactionPager } from '../data/transactionPager'
import styles from './PagedListFooter.module.css'

/** How far below the screen the end of the rows may be before the next page is read. */
const READ_AHEAD = '0px 0px 1500px 0px'

/**
 * What sits under the rows: it reads the next page when the end of what has been read comes near the screen,
 * says so while it does, and offers to try again when a page failed. A failed page is not read again by itself,
 * or a server that is down would be asked as fast as it answers.
 */
export function PagedListFooter({ pager }: { pager: TransactionPager }) {
  const state = useSyncExternalStore(pager.subscribe, pager.getState)
  const end = useRef<HTMLDivElement>(null)
  const { rows, loading, error, complete } = state
  useEffect(() => {
    const node = end.current
    if (!node || complete || error !== null || typeof IntersectionObserver === 'undefined') return
    // Watching again after every page makes the browser say where the end is now, so a short page that leaves it
    // on screen reads the next one.
    const watch = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) pager.loadMore()
      },
      { rootMargin: READ_AHEAD },
    )
    watch.observe(node)
    return () => watch.disconnect()
  }, [pager, rows.length, loading, error, complete])
  return (
    <div ref={end} className={styles.footer}>
      {error !== null ? (
        <button type="button" className={styles.retry} onClick={() => pager.loadMore()}>
          Couldn&apos;t load more. Try again
        </button>
      ) : loading && rows.length > 0 ? (
        <span role="status">Loading…</span>
      ) : null}
    </div>
  )
}
