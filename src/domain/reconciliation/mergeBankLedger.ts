import type { BankTransaction } from './types'
import { parseIberiaStatement } from './parseIberiaCard'
import { parseSantanderDebit } from './parseSantanderDebit'

function dedupeKey(txn: BankTransaction): string {
  return `${txn.source}|${txn.date}|${txn.amountCents}|${txn.description.toLowerCase()}`
}

/** Merge Santander debit + Iberia statements into one deduped ledger. */
export function mergeBankLedger(input: {
  santanderDebit?: Uint8Array
  iberiaStatements?: Uint8Array[]
}): BankTransaction[] {
  const all: BankTransaction[] = []
  if (input.santanderDebit) all.push(...parseSantanderDebit(input.santanderDebit))
  for (const buf of input.iberiaStatements ?? []) {
    all.push(...parseIberiaStatement(buf))
  }

  const seen = new Set<string>()
  const out: BankTransaction[] = []
  for (const txn of all) {
    const key = dedupeKey(txn)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(txn)
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.amountCents - b.amountCents)
}
