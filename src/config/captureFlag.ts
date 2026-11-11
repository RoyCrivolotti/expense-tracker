/**
 * Whether this browser shows the bank-push capture screens. Off until it is turned on, so a build that carries the
 * screens changes nothing for anyone who has not asked for them. `?capture=on` or `?capture=off` in the address sets
 * it and the choice is kept in the browser.
 */
export const CAPTURE_FLAG_KEY = 'expenses-capture'

export interface CaptureFlagInput {
  /** The address's query string, `?capture=on` and so on. */
  search: string
  storage: Pick<Storage, 'getItem' | 'setItem'> | null
}

export function readCaptureFlag({ search, storage }: CaptureFlagInput): boolean {
  let wanted: string | null = new URLSearchParams(search).get('capture')
  try {
    if (wanted === 'on' || wanted === 'off') storage?.setItem(CAPTURE_FLAG_KEY, wanted)
    else wanted = storage?.getItem(CAPTURE_FLAG_KEY) ?? null
  } catch {
    // A browser that refuses storage (a private window, blocked site data) keeps only what the address said.
  }
  return wanted === 'on'
}

/** The flag for this page, read from the browser. */
export function captureEnabled(): boolean {
  let storage: CaptureFlagInput['storage'] = null
  try {
    storage = window.localStorage
  } catch {
    // Reading localStorage itself throws in some privacy modes; the address alone then decides.
  }
  return readCaptureFlag({ search: window.location.search, storage })
}
