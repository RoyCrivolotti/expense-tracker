import { prefersReducedMotion } from './prefersReducedMotion'

/** Run `run` once React has rendered what the viewer just did, and the browser has laid it out. */
export function afterRender(run: () => void): void {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run)
  else run()
}

/**
 * The behaviour to scroll with: the one asked for, unless the viewer has asked for less
 * movement, which a smooth-scrolled jump is exactly the kind of. The rest of the app honours
 * that in CSS (theme.css); a scroll started from script has to ask.
 */
export function scrollBehavior(behavior: 'auto' | 'smooth'): 'auto' | 'smooth' {
  return prefersReducedMotion() ? 'auto' : behavior
}
