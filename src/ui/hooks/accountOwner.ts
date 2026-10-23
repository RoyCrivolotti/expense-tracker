import { createContext, useContext } from 'react'

/**
 * Who is signed in. A browser can be used by more than one person, so what it keeps about what a ledger holds
 * (the series stopped, the suggestions dismissed, the setup skipped) is kept for one person and not for the device.
 */
export const AccountOwnerContext = createContext<string | undefined>(undefined)

export const useAccountOwner = (): string | undefined => useContext(AccountOwnerContext)

/** The keys such settings are kept under, which `ownerKey` makes one person's. */
export const OWNER_KEYS = {
  stopped: 'expense:stopped-recurring',
  dismissed: 'expense:dismissed-recurring',
  onboardingSkipped: 'exp-onboarding-skipped',
} as const

/** `base` for `owner`. With no one signed in (the demo, a test) it is `base` itself, as it was for everyone before. */
export const ownerKey = (base: string, owner: string | undefined): string => (owner ? `${base}:${owner}` : base)

/**
 * Removes what earlier builds kept under keys that named no one. It cannot be told whose it is, and it is not
 * read for anyone, so a second person on the same browser never sees the first one's.
 */
export function forgetUnownedSettings(): void {
  for (const key of Object.values(OWNER_KEYS)) {
    try {
      localStorage.removeItem(key)
    } catch {
      /* storage that refuses a removal has nothing to remove */
    }
  }
}
