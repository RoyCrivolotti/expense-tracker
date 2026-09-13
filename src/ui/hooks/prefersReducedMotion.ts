/**
 * Whether the viewer has asked for less movement.
 *
 * Most of the app honours this in CSS. Read it from script only where the motion is
 * driven from script too — a smooth-scrolled jump, or a sheet whose exit animation
 * gates when it unmounts and so has to be skipped rather than merely stilled.
 */
export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}
