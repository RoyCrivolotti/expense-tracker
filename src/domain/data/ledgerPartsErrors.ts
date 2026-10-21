/**
 * Why a ledger could not be read in parts. A caller that has another way to load (the whole dataset)
 * falls back on any of them; none means the owner's data is wrong or missing.
 */

/** The server does not serve ledger parts, or answered with something that is not one. */
export class PartsUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PartsUnavailableError'
  }
}

/**
 * A part is bigger than one request may return: a month with more rows than a rows request allows, or
 * a range with more cells than a cube request allows even for a single month.
 */
export class PartTooLargeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PartTooLargeError'
  }
}

/** The ledger changed again every time its parts were read, so no consistent set was ever held. */
export class LedgerChangedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LedgerChangedError'
  }
}
