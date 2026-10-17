import {
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type RefObject,
} from 'react'
import type { ListDayGroup } from '../../engine'
import { useElementWidth } from './useElementWidth'
import { createRowHeights, rowKey, rowShape, type RowHeights } from './rowHeights'
import { readChrome, readSamples } from './windowDom'
import { buildLayout, nextBand, planWindow, type Band, type Plan } from './windowLayout'

interface Flat {
  sizes: number[]
  keys: string[]
  shapes: number[]
}

function flatten(groups: readonly ListDayGroup[]): Flat {
  const flat: Flat = { sizes: [], keys: [], shapes: [] }
  for (const group of groups) {
    flat.sizes.push(group.rows.length)
    for (const row of group.rows) {
      flat.keys.push(rowKey(row))
      flat.shapes.push(rowShape(row))
    }
  }
  return flat
}

/**
 * The part of the list to render, as the page scrolls. The page is the scroller, so the list
 * asks the window where it is; a first guess that the list starts at the top is put right by
 * the layout effect before the first paint.
 */
function useScrollBand(listRef: RefObject<HTMLElement | null>, total: number): Band {
  const [band, setBand] = useState<Band>(() =>
    nextBand(null, window.scrollY, window.scrollY + window.innerHeight, total),
  )
  const sync = useEffectEvent(() => {
    const list = listRef.current
    if (!list) return
    const { top } = list.getBoundingClientRect()
    setBand((prev) => nextBand(prev, -top, window.innerHeight - top, total))
  })

  useLayoutEffect(() => {
    const onChange = () => sync()
    onChange()
    window.addEventListener('scroll', onChange, { passive: true })
    window.addEventListener('resize', onChange)
    // What is above the list can change height without the page scrolling.
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(onChange) : null
    observer?.observe(document.body)
    return () => {
      window.removeEventListener('scroll', onChange)
      window.removeEventListener('resize', onChange)
      observer?.disconnect()
    }
  }, [])

  return band
}

/** Feeds what the rendered rows measure back to the store, which lays the list out again if it matters. */
function useMeasuredRows(listRef: RefObject<HTMLElement | null>, store: RowHeights): void {
  useLayoutEffect(() => {
    const list = listRef.current
    if (!list) return
    store.record(readSamples(list))
    const chrome = readChrome(list)
    if (chrome) store.setChrome(chrome.header, chrome.gap)
  })
}

/** A fresh store for each key: heights measured under another one do not carry over, only what rows are like. */
function useHeightStore(key: string): RowHeights {
  const [current, setCurrent] = useState(() => ({ key, store: createRowHeights() }))
  if (current.key === key) return current.store
  const next = { key, store: createRowHeights(current.store.seed()) }
  setCurrent(next)
  return next.store
}

/**
 * What to put in the DOM for a long list of day groups: only the rows near the screen, with
 * padding standing in for the rest. Row heights are measured as rows are shown and guessed from
 * rows like them until then. `signature` names whatever changes how tall rows are, so the
 * measurements are started again when it does.
 */
export function useWindowedList(
  listRef: RefObject<HTMLElement | null>,
  groups: readonly ListDayGroup[],
  collapsedDates: ReadonlySet<string>,
  signature: string,
): Plan {
  const width = useElementWidth(listRef, 0)
  const flat = useMemo(() => flatten(groups), [groups])
  const store = useHeightStore(`${signature}-${width}`)
  const version = useSyncExternalStore(store.subscribe, store.version)
  const layout = useMemo(
    () =>
      buildLayout({
        groupSizes: flat.sizes,
        collapsed: groups.map((group) => collapsedDates.has(group.date)),
        rowHeight: (i) => store.height(flat.keys[i]!, flat.shapes[i]!),
        headerHeight: store.header(),
        gap: store.gap(),
      }),
    // The version stands for the heights the store holds.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [flat, groups, collapsedDates, store, version],
  )
  const band = useScrollBand(listRef, layout.total)
  useMeasuredRows(listRef, store)
  return useMemo(() => planWindow(layout, band.from, band.to), [layout, band])
}
