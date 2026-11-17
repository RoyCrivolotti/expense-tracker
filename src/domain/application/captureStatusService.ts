import { shiftDay } from '../capture/review'
import type { CaptureSource } from '../capture/types'
import type { CaptureCounter, CaptureRepository } from '../ports/captureRepository'
import type { MutedCount, SourceOutcomes } from '../ports/captureStatusReads'

/** How far back the setup check's counts reach, in UTC days including today. */
export const STATUS_DAYS = 7

/** How far back the diagnostics reach, in UTC days including today. */
export const DIAGNOSTICS_DAYS = 30

/** What became of one source's pushes over the last `DIAGNOSTICS_DAYS`. Counts only, never a push's words. */
export interface SourceDiagnostics {
  /** Pushes the Worker accepted, read or not. */
  received: number
  /** Of those, the ones stored as a recommendation. */
  recommended: number
  /** Of those, the ones stored as another push of a recommendation already made for the same movement. */
  grouped: number
  /** Of those, the ones not read: no amount with a currency marker, a Date that cannot be trusted, or a muted wording. */
  unread: number
  /** Of the recommendations, what the person did: added as the card showed it, added after an edit, linked, dismissed. */
  addedAsIs: number
  edited: number
  linked: number
  dismissed: number
  /** Still waiting for a decision. */
  open: number
  /** Wordings of this source the person's dismissals muted, now. */
  muted: number
}

/** What reached the app from one bank app: the last recognised payment, and what arrived over the last week. */
export interface SourceStatus {
  source: CaptureSource
  /** When the last recognised push was stored, or null when none was. */
  lastCaptureAt: string | null
  /** Pushes the Worker accepted in the last `STATUS_DAYS`, recognised or not. */
  received: number
  /** Of those, the ones it did not read as a payment. */
  unrecognised: number
  diagnostics: SourceDiagnostics
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

const total = (rows: readonly CaptureCounter[], field: 'received' | 'unrecognised') => rows.reduce((n, c) => n + c[field], 0)

const NO_OUTCOMES: Omit<SourceOutcomes, 'source'> = { recommended: 0, grouped: 0, addedAsIs: 0, edited: 0, linked: 0, dismissed: 0, open: 0 }

function diagnosticsOf(counters: readonly CaptureCounter[], outcomes: SourceOutcomes | undefined, muted: MutedCount | undefined): SourceDiagnostics {
  const { recommended, grouped, addedAsIs, edited, linked, dismissed, open } = outcomes ?? NO_OUTCOMES
  return {
    received: total(counters, 'received'),
    recommended,
    grouped,
    unread: total(counters, 'unrecognised'),
    addedAsIs,
    edited,
    linked,
    dismissed,
    open,
    muted: muted?.muted ?? 0,
  }
}

/**
 * Reads only, for the person alone: per source their pushes were ever counted under, the last capture, the counts of
 * the last week for the setup check, and the last 30 days for the diagnostics. A source shows once a push of it
 * arrived, whatever the bank, and stays listed after its pushes stop, so the check can say nothing came lately.
 */
export async function captureStatus(
  captures: CaptureRepository,
  owner: string,
  setting: string | undefined,
  shortcutSetting: string | undefined,
  now: Date,
): Promise<CaptureStatus> {
  const today = now.toISOString().slice(0, 10)
  const weekFrom = shiftDay(today, -(STATUS_DAYS - 1))
  const monthFrom = shiftDay(today, -(DIAGNOSTICS_DAYS - 1))
  const [listed, counters, outcomes, muted] = await Promise.all([
    captures.countedSources(owner),
    captures.readCounters(owner, monthFrom),
    captures.readSourceOutcomes(owner, monthFrom),
    captures.countMutedTemplates(owner),
  ])
  const lasts = await Promise.all(listed.map((source) => captures.lastCaptureAt(owner, source)))
  const sources = listed.map((source, i) => {
    const mine = counters.filter((c) => c.source === source)
    const week = mine.filter((c) => c.day >= weekFrom)
    return {
      source,
      lastCaptureAt: lasts[i] ?? null,
      received: total(week, 'received'),
      unrecognised: total(week, 'unrecognised'),
      diagnostics: diagnosticsOf(
        mine,
        outcomes.find((o) => o.source === source),
        muted.find((m) => m.source === source),
      ),
    }
  })
  return { sources, endpoint: captureEndpointOf(setting), shortcutUrl: captureShortcutUrlOf(shortcutSetting) }
}
