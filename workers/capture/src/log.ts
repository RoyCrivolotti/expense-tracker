/**
 * The one line the Worker writes per request, so a missing push can be told from a refused one, a dropped one and a
 * stored one. Cloudflare's Workers Logs keeps a console.log of an object as searchable fields.
 *
 * Only labels go in. Never the body, title, merchant, amount, card digits or the owner's email: a log is not covered
 * by the app's own access rules, and a bank push is private. `source` is a word the person chose for their own
 * automation, and `keyId` is the public half of a capture key (the secret half is never read here).
 */
/** Every word `reason` may hold. A word is added here first, so a search for one finds every case. */
export type CaptureReason =
  | 'unknown'
  | 'exception'
  | 'wrong-path'
  | 'wrong-method'
  | 'no-valid-key-header'
  | 'body-too-large'
  | 'not-json'
  | 'not-configured'
  | 'key-rejected'
  | 'bad-body'
  | 'too-many-sources'
  | 'daily-cap'
  /** The push's Date cannot be read, or is more than two days from the server's clock: counted as unread. */
  | 'bad-date'
  | 'clock-skew'
  /** The push shows no amount with a currency marker: counted as unread, nothing stored. */
  | 'no-amount'
  /** The same, and all it holds is a code with no other number, which is what a one-time code looks like. */
  | 'code-like'
  | 'recommendation-cap'
  | 'stored'
  /** The push joined an open recommendation of the same movement instead of making another. */
  | 'grouped'
  | 'replay'
  /** The push belongs to a template the person has ignored: counted as unread, nothing stored. */
  | 'ignored-shape'

export interface CaptureLogLine {
  event: 'capture'
  /** What became of the request. */
  outcome: 'stored' | 'replay' | 'dropped' | 'refused' | 'limited' | 'error'
  /** Why, in a fixed vocabulary of short words, so a search for one finds every case. */
  reason: CaptureReason
  /** The status the phone was given. */
  status: number
  source?: string
  keyId?: string
  /** Milliseconds from the first check to the answer. */
  ms: number
  /** The class of a thrown error, never its message, which could quote a statement or the push. */
  errorName?: string
}

export type CaptureLogger = (line: CaptureLogLine) => void

// Workers Logs reads the console, and an object logged there keeps its fields searchable.
// eslint-disable-next-line no-console
export const consoleLogger: CaptureLogger = (line) => console.log(line)
