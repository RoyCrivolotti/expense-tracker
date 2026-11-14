import { shiftDay } from '../capture/review'
import type { CaptureSource } from '../capture/types'
import type { CaptureRepository } from '../ports/captureRepository'
import { CARD_SOURCES } from './captureCardService'

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
  /** An iCloud share link to the Shortcut, or null when none is configured or the setting is not one. */
  shortcutUrl: string | null
}

/** Whether the address carries anything before the host (`name:value@`), which no link here should. */
const hasUserInfo = (url: URL): boolean => !url.href.startsWith(`${url.protocol}//${url.host}`)

const SHORTCUT_HOSTS = new Set(['www.icloud.com', 'icloud.com'])

/**
 * The link behind the "Add the shortcut" button. Only an https link on iCloud's own host under `/shortcuts/` is passed
 * on, without a query or fragment, credentials or a port, so a mistyped or hostile setting cannot send a person to
 * another site from a button that says it adds their shortcut.
 */
export function captureShortcutUrlOf(setting: string | undefined): string | null {
  if (!setting) return null
  try {
    const url = new URL(setting.trim())
    if (url.protocol !== 'https:' || !SHORTCUT_HOSTS.has(url.hostname) || hasUserInfo(url) || url.port) {
      return null
    }
    const id = url.pathname.startsWith('/shortcuts/') ? url.pathname.slice('/shortcuts/'.length) : ''
    return /^[A-Za-z0-9_-]+\/?$/.test(id) ? `${url.origin}/shortcuts/${id.replace(/\/$/, '')}` : null
  } catch {
    return null
  }
}

/** What the operator set for this environment. */
export interface CaptureSettings {
  endpoint: string | undefined
  shortcutUrl: string | undefined
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
    if (url.protocol !== 'https:' || hasUserInfo(url)) return null
    return `${url.origin}/capture`
  } catch {
    return null
  }
}

/** Reads only: the last capture per bank app and the counters of the last week, for the person alone. */
export async function captureStatus(
  captures: CaptureRepository,
  owner: string,
  settings: CaptureSettings,
  now: Date,
): Promise<CaptureStatus> {
  const from = shiftDay(now.toISOString().slice(0, 10), -(STATUS_DAYS - 1))
  const [counters, lasts] = await Promise.all([
    captures.readCounters(owner, from),
    Promise.all(CARD_SOURCES.map((source) => captures.lastCaptureAt(owner, source))),
  ])
  const sources = CARD_SOURCES.map((source, i) => {
    const mine = counters.filter((c) => c.source === source)
    return {
      source,
      lastCaptureAt: lasts[i] ?? null,
      received: mine.reduce((n, c) => n + c.received, 0),
      unrecognised: mine.reduce((n, c) => n + c.unrecognised, 0),
    }
  })
  return {
    sources,
    endpoint: captureEndpointOf(settings.endpoint),
    shortcutUrl: captureShortcutUrlOf(settings.shortcutUrl),
  }
}
