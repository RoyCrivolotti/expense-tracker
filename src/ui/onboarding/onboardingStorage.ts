const STORAGE_KEY = 'exp-onboarding-skipped'

export function isOnboardingSkipped(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function skipOnboarding(): void {
  try {
    localStorage.setItem(STORAGE_KEY, '1')
  } catch {
    /* ignore private browsing */
  }
}
