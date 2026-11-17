import { req } from './apiClient'

/** What reached the app from one bank app. */
export interface SourceStatus {
  source: string
  /** When the newest recognised push was stored, or null when none was. */
  lastCaptureAt: string | null
  /** Pushes accepted over the last seven days, recognised or not, and how many of them were not read as a payment. */
  received: number
  unrecognised: number
  /** What became of the source's pushes over the last 30 UTC days. Counts only, never a push's words. */
  diagnostics: SourceDiagnostics
}

export interface SourceDiagnostics {
  /** Pushes accepted, read or not, and how many were stored as a recommendation, joined one, or were not read. */
  received: number
  recommended: number
  grouped: number
  unread: number
  /** What the person did with the recommendations: added as shown, added after an edit, linked, dismissed. */
  addedAsIs: number
  edited: number
  linked: number
  dismissed: number
  /** Recommendations still waiting, and wordings of this source the person's dismissals muted. */
  open: number
  muted: number
}

export interface CaptureStatus {
  sources: SourceStatus[]
  /** Requests from the person's shortcut over the last seven days whose fields could not be read. */
  malformed: number
  /** The capture Worker's full address for this environment, or null when the server has none configured. */
  endpoint: string | null
  /** The iCloud share link of the generic Shortcut, or null when the server has none (or an invalid one). */
  shortcutUrl: string | null
}

export function fetchCaptureStatus(): Promise<CaptureStatus> {
  return req<CaptureStatus>('/api/capture-status')
}
