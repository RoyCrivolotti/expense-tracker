/**
 * Where a bank push came from: one word per bank app, folded from the App name the notification carries, or the word
 * an older shortcut sends as `source`. Any word that passes `isSourceWord` is accepted, and nothing in the app depends
 * on which.
 */
export type CaptureSource = string

/** What the phone automation sends: the notification's own fields and nothing else. */
export interface RawPush {
  source: CaptureSource
  title: string
  body: string
  /** ISO 8601 with the phone's UTC offset, probably the time the push arrived. */
  date: string
}

/** The four types the app can store. A recommendation only ever suggests one. */
export type SuggestedType = 'expense' | 'income' | 'investment' | 'refund'

/** Decimal mark a source writes amounts with. Reading with the wrong one makes 345.0 into 3,450. */
export type DecimalMark = 'comma' | 'dot'
