/** Where a bank push came from. One phone automation per bank app, each with a fixed source word. */
export type CaptureSource = 'iberia' | 'santander'

/** What the phone automation sends: the notification's own fields and nothing else. */
export interface RawPush {
  source: CaptureSource
  title: string
  body: string
  /** ISO 8601 with the phone's UTC offset, probably the time the push arrived. */
  date: string
}

/** Kinds of push the app acts on. Anything else is dropped and counted. */
export type PushKind =
  | 'card-purchase'
  | 'cash-withdrawal'
  | 'bizum-received'
  | 'transfer-sent'
  | 'inflow'
  | 'refund'

/** The four types the app can store. A recommendation only ever suggests one. */
export type SuggestedType = 'expense' | 'income' | 'investment' | 'refund'

/** Decimal mark a source writes amounts with. Reading with the wrong one makes 250.0 into 2,500. */
export type DecimalMark = 'comma' | 'dot'

/** One row of the kind list: a Title plus a Body test, because one Title can mean two things. */
export interface KindRule {
  source: CaptureSource
  /** Compared without case or accents. */
  title: string
  body?: RegExp
  kind: PushKind
  mark: DecimalMark
  /** False for kinds whose body holds another person's name: the text is never kept. */
  keepsText: boolean
}
