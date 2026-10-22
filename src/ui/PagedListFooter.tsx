import { useEffect, useRef, useSyncExternalStore } from 'react'
import type { TransactionPager } from '../data/transactionPager'
import { EmptyState } from './components/primitives'
import styles from './PagedListFooter.module.css'

/** How far below the screen the end of the rows may be before the next page is read. */
const READ_AHEAD = '0px 0px 1500px 0px'

/**
 * What sits under the rows: it reads the next page when the end of what has been read comes near the screen,
 * says so while it does, and offers to try again when a read failed. A failed read is not made again by itself,
 * or a server that is down would be asked as fast as it answers. A list read again after a write says nothing
 * while it does: the rows stay as they were until all of them are in.
 */
export function PagedListFooter({ pager }: { pager: TransactionPager }) {
  const state = useSyncExternalStore(pager.subscribe, pager.getState)
  const end = useRef<HTMLDivElement>(null)
  const { rows, loading, refreshing, error, refreshFailed, complete } = state
  useEffect(() => {
    const node = end.current
    if (!node || complete || refreshing || error !== null || typeof IntersectionObserver === 'undefined') return
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
  }, [pager, rows.length, loading, refreshing, error, complete])
  // The button goes when the read starts, so the focus it had moves to the footer and stays in the list.
  const retry = () => {
    pager.loadMore()
    end.current?.focus({ preventScroll: true })
  }
  return (
    <div ref={end} tabIndex={-1} className={styles.footer}>
      {error !== null && rows.length > 0 ? (
        <button type="button" className={styles.retry} onClick={retry}>
          {refreshFailed ? "Couldn't update the list. Try again" : "Couldn't load more. Try again"}
        </button>
      ) : loading && rows.length > 0 ? (
        <span>Loading…</span>
      ) : null}
    </div>
  )
}

/** Drawn in place of the list when the first rows could not be read. */
export function ListFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <EmptyState actionLabel="Try again" onAction={onRetry}>
      Couldn&apos;t load transactions.
    </EmptyState>
  )
}
