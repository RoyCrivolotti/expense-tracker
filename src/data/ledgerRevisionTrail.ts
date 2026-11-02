import type { WriteReceipt } from '../domain/data/writeReceipt'
import type { HeldLedger } from './ledgerHold'

/** Receipts kept between one patch and the next. A user's action is a handful of requests; more means a patch went missing. */
const MAX_PENDING = 64

/** The writes since `base`, the revision a held ledger carried when the last patch left it, took it to `at`. */
interface Chain {
  base: string | null
  at: string
}

/**
 * How a ledger held open keeps knowing which revision it is at across the writes its own user makes.
 *
 * A held ledger carries the revision its parts were read under, and forgets it at the first local write: the server
 * replaces the token twice around every write, so the token it holds afterwards is not one the browser has seen. What a
 * read of one more month brings can then not be told from a later state of the ledger, and the session reads everything
 * again. The server says what it did: each write answers with the token it found and the one it left (`WriteReceipt`),
 * and the second is sent only when no other write ran in between. A patch whose writes follow on from the revision
 * the ledger is at, receipt by receipt, leaves it at the last token, and a month read under that token belongs with
 * what is held. The held ledger's own `revision` is left as it is: what compares parts with it (the series, the
 * counts) reads null as "not compared", and should go on doing so.
 *
 * Nothing here is trusted beyond the next read: the token a part carries is the server's now, and a write by anyone
 * else, a write that failed part way or one that was not shown has moved it away from the one known here.
 */
export class RevisionTrail {
  private pending: WriteReceipt[] = []
  private lost = false
  private chain: Chain | null = null
  /** A write made here was answered with a receipt that does not follow on, so another write ran beside it. */
  private interfered = false

  /** The server answered a write. */
  note(receipt: WriteReceipt): void {
    if (this.pending.length >= MAX_PENDING) this.lost = true
    else this.pending.push(receipt)
  }

  /** The revision `held` is at: its own, or the one writes shown since have taken it to. Null when unknown. */
  known(held: HeldLedger | null): string | null {
    if (held === null) return null
    return this.chain !== null && this.chain.base === held.revision ? this.chain.at : held.revision
  }

  /**
   * A patch is being applied for the writes noted since the last one: the revision they leave `held` at, or null
   * when they do not follow on from where it is. Ends the chain, which a patch that is not a plain write breaks.
   */
  take(held: HeldLedger | null): string | null {
    const receipts = this.pending
    const lost = this.lost
    this.pending = []
    this.lost = false
    const from = this.known(held)
    this.chain = null
    const at = lost ? null : followed(from, receipts)
    if (receipts.length > 0 && at === null) this.interfered = true
    return at
  }

  /** The patch for what `take` returned has been applied, leaving the held ledger's own revision as `base`. */
  vouch(at: string | null, base: string | null): void {
    this.chain = at === null ? null : { base, at }
  }

  /**
   * A read of everything is starting, which settles the revision. Whatever was known is given up: a write that
   * lands while it is read is not vouched for against a state the read may be about to replace.
   */
  forget(): void {
    this.chain = null
    this.interfered = false
  }

  /**
   * Whether a read at `revision` may become the held ledger's own: not when writes made here left it at another, nor
   * after one that was answered with a receipt that did not follow on, since someone else wrote beside it and the rows
   * held may lack that. Null then, and the next month read finds out.
   */
  adoptable(held: HeldLedger, revision: string | null): string | null {
    if (this.interfered) return null
    const known = this.known(held)
    return known === null || known === revision ? revision : null
  }
}

/** The revision `from` is at once `receipts` are in, if each starts where the last left off; else null. */
function followed(from: string | null, receipts: readonly WriteReceipt[]): string | null {
  if (from === null || receipts.length === 0) return null
  let at = from
  for (const { before, after } of receipts) {
    if (before !== at || after === null) return null
    at = after
  }
  return at
}
