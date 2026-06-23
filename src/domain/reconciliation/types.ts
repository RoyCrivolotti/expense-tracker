/** How a bank row was classified during Santander debit parsing. */
export type BankRowKind =
  | 'debit_direct'
  | 'sc_purchase'
  | 'iberia_settlement'
  | 'sc_settlement'
  | 'skip'

/** Which ledger a matchable bank row came from. */
export type BankSource = 'debit_direct' | 'sc_purchase' | 'iberia'

export interface BankTransaction {
  date: string
  amountCents: number
  description: string
  source: BankSource
  kind: BankRowKind
}

export type CoverageTier = 'reconcilable' | 'heuristic_only' | 'out_of_scope'

export type MatchConfidence =
  | 'high'
  | 'medium'
  | 'low'
  | 'unchanged'
  | 'no_bank_match'
  | 'no_bank_coverage'

export interface DateDiffLine {
  txnId: number
  description: string
  category: string
  account: string
  budgetMonth: string
  appDate: string
  bankDate: string
  deltaDays: number
  amountCents: number
  bankAmountCents: number
  bankDescription: string
  bankSource: BankSource | ''
  coverageTier: CoverageTier
  confidence: MatchConfidence
  suspectedPlaceholder: boolean
  proposedDate: string
  matchCount: number
}

export interface ReconciliationSummary {
  totalAppTxns: number
  reconcilable: number
  proposedFixes: number
  unchanged: number
  noMatch: number
  outOfScope: number
  suspectedPlaceholders: number
}

export interface ReconciliationReport {
  lines: DateDiffLine[]
  summary: ReconciliationSummary
}
