import { createElement, lazy, type ComponentProps } from 'react'
import type { OnboardingWizard } from '../onboarding/OnboardingWizard'

// Only a new person, or someone re-running setup, ever opens the box, so it stays out of the
// default build. The chunk is precached, so a cold offline start still has it.
let loaded: typeof OnboardingWizard | null = null
const load = () =>
  import('../onboarding/OnboardingWizard').then((m) => {
    loaded = m.OnboardingWizard
    return { default: m.OnboardingWizard }
  })

const LazyWizard = lazy(load)

/**
 * The setup box. Once its chunk has arrived it is drawn directly, since a lazy component that has already loaded still
 * suspends for a tick, which would leave the empty Dashboard showing alone.
 */
export function ChunkedOnboardingWizard(props: ComponentProps<typeof OnboardingWizard>) {
  return createElement(loaded ?? LazyWizard, props)
}

/**
 * Starts the download before anyone knows the box is needed. The app only learns that this is a first run when the
 * data arrives, and asking for the chunk then leaves the empty Dashboard on screen for the length of a round trip;
 * asking at start overlaps it with the data load. Someone who already has data gets it from the service worker's
 * cache, so it costs them nothing at start.
 */
export function prefetchOnboardingWizard(): void {
  load().catch(() => undefined)
}
