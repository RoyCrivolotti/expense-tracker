import { shiftDay } from '../capture/review'
import type { CaptureSource } from '../capture/types'
import type { CaptureRepository } from '../ports/captureRepository'

/** Listed even before anything arrives, because the setup card is written for them. Any other source shows once it is counted. */
const ALWAYS_LISTED: readonly CaptureSource[] = ['iberia', 'santander']

/** How far back the counts reach, in UTC days including today. */
export const STATUS_DAYS = 7

/** What reached the app from one bank app: the last recognised payment, and what arrived over the last week. */
export interface SourceStatus {
  source: CaptureSource
  /** When the last recognised push was stored, or null when none was. */
  lastCaptureAt: string | null
  /** Pushes the Worker accepted in the window, recognised or not. */
  received: number
  /** Of those, the ones it did not read as a payment. */
  unrecognised: number
}

export interface CaptureStatus {
  sources: SourceStatus[]
  /** The Worker's full address for this environment, or null when none is configured or the setting is not a usable address. */
  endpoint: string | null
  /** The public iCloud share link of the generic Shortcut, or null when none is set or the setting is not a share link. */
  shortcutUrl: string | null
}

const SHORTCUT_LINK = /^https:\/\/www\.icloud\.com\/shortcuts\/[A-Za-z0-9]+$/

/**
 * The share link an operator sets for the Shortcut. Only an iCloud Shortcuts link is used, exactly as written (no
 * trimming, no query, no extra path), so whatever else the variable holds is never turned into a link on the screen.
 */
export function captureShortcutUrlOf(setting: string | undefined): string | null {
  return setting !== undefined && SHORTCUT_LINK.test(setting) ? setting : null
}

/**
 * The address a Shortcut posts to, from the variable an operator sets. Only an https address is used, and the path is
 * always the Worker's one, so a variable holding the bare host works and one holding something else cannot send the
 * person's key anywhere unexpected.
 */
export function captureEndpointOf(setting: string | undefined): string | null {
  if (!setting) return null
  try {
    const url = new URL(setting.trim())
    if (url.protocol !== 'https:' || url.username || url.password) return null
    return `${url.origin}/capture`
  } catch {
    return null
  }
}

/** Reads only: the last capture per bank app and the counters of the last week, for the person alone. */
export async function captureStatus(
  captures: CaptureRepository,
  owner: string,
  setting: string | undefined,
  shortcutSetting: string | undefined,
  now: Date,
): Promise<CaptureStatus> {
  const from = shiftDay(now.toISOString().slice(0, 10), -(STATUS_DAYS - 1))
  const counters = await captures.readCounters(owner, from)
  const listed = [...new Set([...ALWAYS_LISTED, ...counters.map((c) => c.source)])]
  const lasts = await Promise.all(listed.map((source) => captures.lastCaptureAt(owner, source)))
  const sources = listed.map((source, i) => {
    const mine = counters.filter((c) => c.source === source)
    return {
      source,
      lastCaptureAt: lasts[i] ?? null,
      received: mine.reduce((n, c) => n + c.received, 0),
      unrecognised: mine.reduce((n, c) => n + c.unrecognised, 0),
    }
  })
  return { sources, endpoint: captureEndpointOf(setting), shortcutUrl: captureShortcutUrlOf(shortcutSetting) }
}
