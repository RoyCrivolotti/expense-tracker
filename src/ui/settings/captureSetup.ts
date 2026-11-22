import type { SourceStatus } from '../../data/captureStatusApi'
import { shortDayLabel } from '../format'
import { ownerKey } from '../hooks/accountOwner'

/**
 * Where a bank app stands: nothing has reached the app (waiting), pushes arrive but none of the last week's was read as a
 * payment (unrecognised), the last payment captured is older than `STALE_DAYS` (quiet), or a payment was captured lately.
 * Information only: there is no banner or reconciliation behind it, so a stopped automation is still noticed by the person.
 */
export type SourceState = 'waiting' | 'unrecognised' | 'quiet' | 'ok'

/**
 * Every source as one: the counts added up, and the newest capture with the source it came from. Undefined when no
 * push has arrived from any. A source quiet for a week while another sends still reads as captured, since the person
 * may simply not have used that card.
 */
export function overall(sources: readonly SourceStatus[]): SourceStatus | undefined {
  const [first, ...rest] = sources
  if (!first) return undefined
  const newest = rest.reduce((a, b) => ((b.lastCaptureAt ?? '') > (a.lastCaptureAt ?? '') ? b : a), first)
  return {
    ...newest,
    received: sources.reduce((n, s) => n + s.received, 0),
    unrecognised: sources.reduce((n, s) => n + s.unrecognised, 0),
  }
}

/** How old the last captured payment may be before the card says nothing has been captured lately. */
export const STALE_DAYS = 3

export function sourceState(
  status: Pick<SourceStatus, 'lastCaptureAt' | 'received' | 'unrecognised'> | undefined,
  now: Date,
): SourceState {
  if (!status) return 'waiting'
  if (!status.lastCaptureAt) return status.received > 0 ? 'unrecognised' : 'waiting'
  // Everything of the last week went unread: the last payment is from before the bank reworded its message.
  if (status.received > 0 && status.unrecognised >= status.received) return 'unrecognised'
  const age = now.getTime() - new Date(status.lastCaptureAt).getTime()
  return age > STALE_DAYS * 86_400_000 ? 'quiet' : 'ok'
}

const pad = (n: number) => String(n).padStart(2, '0')
const localDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** "today at 09:41", "yesterday at 18:02" or "12 Nov at 09:41", in the phone's own clock. */
export function lastCaptureText(
  iso: string,
  now: Date,
): string {
  const at = new Date(iso)
  const time = `${pad(at.getHours())}:${pad(at.getMinutes())}`
  const day = localDay(at)
  if (day === localDay(now)) return `today at ${time}`
  if (day === localDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1))) return `yesterday at ${time}`
  return `${shortDayLabel(day)} at ${time}`
}

const STORAGE_KEY = 'expenses-capture-setup'

/**
 * One person's key. Not in `OWNER_KEYS`: `forgetUnownedSettings` deletes those bare keys at start-up, and this one is
 * handed to whoever is signed in first instead (see `adoptUnownedSetup`). With no one signed in (the demo, a test) it
 * is the bare key, as for the other owner-keyed settings.
 */
const keyFor = (owner: string | undefined): string => ownerKey(STORAGE_KEY, owner)

/**
 * Earlier builds kept one copy for the browser. The first person to open the card afterwards takes it over, so nobody
 * loses ticks they already made, and it is removed so a second person on the same browser starts clean.
 */
export function adoptUnownedSetup(
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null,
  owner: string | undefined,
): void {
  if (!storage || !owner) return
  try {
    const old = storage.getItem(STORAGE_KEY)
    if (old === null) return
    if (storage.getItem(keyFor(owner)) === null) storage.setItem(keyFor(owner), old)
    storage.removeItem(STORAGE_KEY)
  } catch {
    // Storage that refuses leaves the old copy where it is, to be tried again.
  }
}

/**
 * What the person ticked off, an address they pasted, whether they opened or closed the steps themselves (absent
 * until they do, so the card can choose for them) and whether they build the shortcut by hand, kept in this browser only.
 */
export interface SetupMemory {
  ticks: string[]
  endpoint: string
  steps?: 'open' | 'closed'
  /** The person chose to build the shortcut by hand although a shared one is offered. */
  byHand?: boolean
}

/**
 * Whether the steps are open: what the person last chose, else open until a payment has been captured. Someone whose
 * capture works has no use for the steps on every visit, and someone still setting up needs them in front of them.
 */
export function stepsOpen(
  memory: Pick<SetupMemory, 'steps'>,
  sources: readonly SourceStatus[] | undefined,
): boolean {
  if (memory.steps) return memory.steps === 'open'
  return !overall(sources ?? [])?.lastCaptureAt
}

/** The two choices, each left out unless it was stored as one of its values. */
function choices(raw: Partial<SetupMemory> | null): Pick<SetupMemory, 'steps' | 'byHand'> {
  return {
    ...(raw?.steps === 'open' || raw?.steps === 'closed' ? { steps: raw.steps } : {}),
    ...(raw?.byHand === true ? { byHand: true } : {}),
  }
}

export function readSetupMemory(
  storage: Pick<Storage, 'getItem'> | null,
  owner?: string,
): SetupMemory {
  try {
    const raw = JSON.parse(storage?.getItem(keyFor(owner)) ?? 'null') as Partial<SetupMemory> | null
    const ticks = Array.isArray(raw?.ticks) ? raw.ticks.filter((t): t is string => typeof t === 'string') : []
    return { ticks, endpoint: typeof raw?.endpoint === 'string' ? raw.endpoint : '', ...choices(raw) }
  } catch {
    return { ticks: [], endpoint: '' }
  }
}

export function writeSetupMemory(
  storage: Pick<Storage, 'setItem'> | null,
  memory: SetupMemory,
  owner?: string,
): void {
  try {
    storage?.setItem(keyFor(owner), JSON.stringify(memory))
  } catch {
    // A browser that refuses storage keeps the ticks for this visit only.
  }
}

/** A pasted address is used only when it is https, so the key is never sent in the clear. The Worker's path is added. */
export function pastedEndpoint(text: string): string | null {
  try {
    const url = new URL(text.trim())
    return url.protocol === 'https:' && !url.username && !url.password ? `${url.origin}/capture` : null
  } catch {
    return null
  }
}
