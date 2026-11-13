import type { SourceStatus } from '../../data/captureStatusApi'
import { shortDayLabel } from '../format'

/** Where a bank app stands: nothing has reached the app, pushes arrive but none was read as a payment, or one was. */
export type SourceState = 'waiting' | 'unrecognised' | 'ok'

export function sourceState(status: Pick<SourceStatus, 'lastCaptureAt' | 'received'> | undefined): SourceState {
  if (status?.lastCaptureAt) return 'ok'
  return status && status.received > 0 ? 'unrecognised' : 'waiting'
}

const pad = (n: number) => String(n).padStart(2, '0')
const localDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** "today at 09:41", "yesterday at 18:02" or "12 Nov at 09:41", in the phone's own clock. */
export function lastCaptureText(iso: string, now: Date): string {
  const at = new Date(iso)
  const time = `${pad(at.getHours())}:${pad(at.getMinutes())}`
  const day = localDay(at)
  if (day === localDay(now)) return `today at ${time}`
  if (day === localDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1))) return `yesterday at ${time}`
  return `${shortDayLabel(day)} at ${time}`
}

const STORAGE_KEY = 'expenses-capture-setup'

/** What the person ticked off, and an address they pasted, kept in this browser only. */
export interface SetupMemory {
  ticks: string[]
  endpoint: string
}

export function readSetupMemory(storage: Pick<Storage, 'getItem'> | null): SetupMemory {
  try {
    const raw = JSON.parse(storage?.getItem(STORAGE_KEY) ?? 'null') as Partial<SetupMemory> | null
    const ticks = Array.isArray(raw?.ticks) ? raw.ticks.filter((t): t is string => typeof t === 'string') : []
    return { ticks, endpoint: typeof raw?.endpoint === 'string' ? raw.endpoint : '' }
  } catch {
    return { ticks: [], endpoint: '' }
  }
}

export function writeSetupMemory(storage: Pick<Storage, 'setItem'> | null, memory: SetupMemory): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(memory))
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
