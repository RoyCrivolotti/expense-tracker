import type { LedgerPartsSource } from './dataSource'
import type { ReferencePart } from '../domain/data/ledgerParts'

/**
 * `source`, with its next read of the reference answered by one the caller has just made. A session starts by reading
 * the reference, and a caller that asked for it first, to decide how to read the ledger, would otherwise have it read
 * twice. Only that first read is answered: it is not kept past it, and a reference that has moved on since is found out
 * by the parts read under it, which carry their own revision (`readLedgerParts`).
 */
export function startingFrom<S extends LedgerPartsSource>(source: S, reference: ReferencePart): S {
  let unused = true
  return {
    ...source,
    readReferencePart: () => {
      if (!unused) return source.readReferencePart()
      unused = false
      return Promise.resolve(reference)
    },
  }
}
