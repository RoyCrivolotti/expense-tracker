import { OWNER_KEYS, ownerKey } from '../hooks/accountOwner'

// Kept for the person who skipped it: someone else on the same browser has their own first run.
const keyFor = (owner: string | undefined): string => ownerKey(OWNER_KEYS.onboardingSkipped, owner)

export function isOnboardingSkipped(owner?: string): boolean {
  try {
    return localStorage.getItem(keyFor(owner)) === '1'
  } catch {
    return false
  }
}

export function skipOnboarding(owner?: string): void {
  try {
    localStorage.setItem(keyFor(owner), '1')
  } catch {
    /* ignore private browsing */
  }
}

/** Un-skip onboarding, e.g. when the user explicitly re-opens the setup wizard. */
export function clearOnboardingSkip(owner?: string): void {
  try {
    localStorage.removeItem(keyFor(owner))
  } catch {
    /* ignore private browsing */
  }
}
