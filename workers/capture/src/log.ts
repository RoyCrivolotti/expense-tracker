/**
 * The one line the Worker writes per request, so a missing push can be told from a refused one, a dropped one and a
 * stored one. Cloudflare's Workers Logs keeps a console.log of an object as searchable fields.
 *
 * Only labels go in. Never the body, title, merchant, amount, card digits or the owner's email: a log is not covered
 * by the app's own access rules, and a bank push is private. `source` is a word the person chose for their own
 * automation, and `keyId` is the public half of a capture key (the secret half is never read here).
 */
export interface CaptureLogLine {
  event: 'capture'
  /** What became of the request. */
  outcome: 'stored' | 'replay' | 'dropped' | 'refused' | 'limited' | 'error'
  /** Why, in a fixed vocabulary of short words, so a search for one finds every case. */
  reason: string
  /** The status the phone was given. */
  status: number
  source?: string
  keyId?: string
  /** The kind the push matched, when it matched one. */
  kind?: string
  /** Whether an amount could be read from the body. Never the amount. */
  amount?: 'read' | 'none'
  /** Milliseconds from the first check to the answer. */
  ms: number
  /** The class of a thrown error, never its message, which could quote a statement or the push. */
  errorName?: string
}

export type CaptureLogger = (line: CaptureLogLine) => void

// Workers Logs reads the console, and an object logged there keeps its fields searchable.
// eslint-disable-next-line no-console
export const consoleLogger: CaptureLogger = (line) => console.log(line)
