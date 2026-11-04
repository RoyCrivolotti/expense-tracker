/**
 * Whether this browser reads the ledger in parts instead of as one dataset: a switch kept in the browser, so it can
 * be turned off for one device and on again without a deploy. It is on unless the browser was told otherwise.
 *
 * - `on`: the ledger is read in parts and the screens show it, held in full up to `HOLD_IN_FULL_ROWS` rows and as a
 *   window of months with the sums of the rest above that.
 * - `shadow`: the same, and the whole dataset is read as well and compared with it, reporting any difference
 *   in the console. Only a development build or a staging build honours it; anywhere else it counts as `on`.
 * - `off`: the whole dataset is loaded as one, the way every browser did before ledger mode.
 *
 * `?ledger=on`, `?ledger=shadow` or `?ledger=off` in the address sets it and it is kept. `off` is kept as `off`: with
 * nothing kept the mode is `on`, so removing the key would turn it back on.
 */
export type LedgerMode = 'off' | 'on' | 'shadow'

export const LEDGER_MODE_KEY = 'expenses-ledger-mode'

export interface LedgerModeInput {
  /** A development or staging build, where `shadow` is allowed. */
  checking: boolean
  /** The address's query string, `?ledger=on` and so on. */
  search: string
  storage: Pick<Storage, 'getItem' | 'setItem'> | null
}

const isMode = (value: string | null): value is Exclude<LedgerMode, never> =>
  value === 'on' || value === 'shadow' || value === 'off'

export function readLedgerMode({ checking, search, storage }: LedgerModeInput): LedgerMode {
  let wanted: string | null = new URLSearchParams(search).get('ledger')
  try {
    if (isMode(wanted)) storage?.setItem(LEDGER_MODE_KEY, wanted)
    else wanted = storage?.getItem(LEDGER_MODE_KEY) ?? null
  } catch {
    // A browser that refuses storage (a private window, blocked site data) keeps only what the address said.
  }
  if (wanted === 'off') return 'off'
  return wanted === 'shadow' && checking ? 'shadow' : 'on'
}

/** The mode for this page, read from the browser. */
export function currentLedgerMode(): LedgerMode {
  let storage: LedgerModeInput['storage'] = null
  try {
    storage = window.localStorage
  } catch {
    // Reading localStorage itself throws in some privacy modes; the address alone then decides.
  }
  return readLedgerMode({
    checking: import.meta.env.DEV || import.meta.env.MODE === 'staging',
    search: window.location.search,
    storage,
  })
}
