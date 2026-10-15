import { useSyncExternalStore } from 'react'
import type { StoppedSeries } from '../../engine'

const STORAGE_KEY = 'expense:stopped-recurring'

/** A series the owner told the Upcoming card to stop suggesting. */
export interface StoppedEntry {
  /** The date of the series' newest charge when it was stopped: a charge after it brings the series back. */
  after: string
  /** What the series was called, so the list in Settings can name it. */
  label: string
}

export type StoppedEntries = Readonly<Record<string, StoppedEntry>>

const NONE: StoppedEntries = {}

/**
 * Held back when the browser refuses the write (a private window, a full store), so the series
 * stays stopped for as long as the page is open, if not after it.
 */
let unsaved: string | null = null
let cache: { raw: string | null; entries: StoppedEntries } = { raw: null, entries: NONE }
const listeners = new Set<() => void>()

function isEntry(value: unknown): value is StoppedEntry {
  if (typeof value !== 'object' || value === null) return false
  const { after, label } = value as Record<string, unknown>
  return typeof after === 'string' && typeof label === 'string'
}

function parse(raw: string | null): StoppedEntries {
  if (!raw) return NONE
  try {
    const data: unknown = JSON.parse(raw)
    if (typeof data !== 'object' || data === null || Array.isArray(data)) return NONE
    const entries: Record<string, StoppedEntry> = {}
    for (const [key, value] of Object.entries(data)) {
      if (isEntry(value)) entries[key] = { after: value.after, label: value.label }
    }
    return entries
  } catch {
    return NONE
  }
}

function readRaw(): string | null {
  if (unsaved !== null) return unsaved
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

/** The stopped series, the same object for as long as nothing has changed. */
function snapshot(): StoppedEntries {
  const raw = readRaw()
  if (raw !== cache.raw) cache = { raw, entries: parse(raw) }
  return cache.entries
}

function commit(entries: StoppedEntries): void {
  const raw = JSON.stringify(entries)
  try {
    localStorage.setItem(STORAGE_KEY, raw)
    unsaved = null
  } catch {
    unsaved = raw
  }
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  // Another tab changing the list reaches this one as a storage event.
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) listener()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

function stop(seriesKey: string, entry: StoppedEntry): void {
  commit({ ...snapshot(), [seriesKey]: entry })
}

function restore(seriesKey: string): void {
  commit(Object.fromEntries(Object.entries(snapshot()).filter(([key]) => key !== seriesKey)))
}

/** Forgets what was held back after a refused write, so a test starts from the browser's own storage. */
export function resetStoppedSuggestionsForTests(): void {
  unsaved = null
}

/**
 * The series stopped on this device, with `stop` and `restore`. A stopped series is kept here and
 * not on the server: it is a preference about what to be reminded of, and each device keeps its
 * own, as the dismissals do.
 */
export function useStoppedSuggestions(): {
  stopped: StoppedEntries & StoppedSeries
  stop: typeof stop
  restore: typeof restore
} {
  const stopped = useSyncExternalStore(subscribe, snapshot, () => NONE)
  return { stopped, stop, restore }
}
