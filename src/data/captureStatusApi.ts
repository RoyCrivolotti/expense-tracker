import { req } from './apiClient'

/** What reached the app from one bank app. */
export interface SourceStatus {
  source: 'iberia' | 'santander'
  /** When the newest recognised push was stored, or null when none was. */
  lastCaptureAt: string | null
  /** Pushes accepted over the last seven days, recognised or not, and how many of them were not read as a payment. */
  received: number
  unrecognised: number
}

export interface CaptureStatus {
  sources: SourceStatus[]
  /** The capture Worker's full address for this environment, or null when the server has none configured. */
  endpoint: string | null
}

export function fetchCaptureStatus(): Promise<CaptureStatus> {
  return req<CaptureStatus>('/api/capture-status')
}
