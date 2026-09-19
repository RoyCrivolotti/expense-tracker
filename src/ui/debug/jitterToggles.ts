export interface JitterToggle {
  id: string
  label: string
  /** Left out of "All off": a candidate fix or a visual aid rather than something to remove. */
  extra?: boolean
}

/**
 * One entry per suspect. "Off" means the suspect is neutralised, so if the wobble stops
 * when a switch goes on, that suspect is involved. The CSS for each lives in jitterLab.css;
 * the three that need JS (plainRows, fabOff, pullOff) are read in their own hooks.
 */
export const JITTER_TOGGLES: JitterToggle[] = [
  { id: 'stickyOff', label: 'Date rows not sticky' },
  { id: 'hdrStatic', label: 'App header not sticky' },
  { id: 'plainRows', label: 'Plain rows: no swipe, no touch handlers' },
  { id: 'tapOff', label: 'No press-scale on buttons' },
  { id: 'fabOff', label: 'No add button and no scroll listener' },
  { id: 'pullOff', label: 'No pull-to-refresh listeners' },
  { id: 'clipOff', label: 'No overflow-x clip on page wrappers' },
  { id: 'ovsOff', label: 'Default overscroll behaviour' },
  { id: 'touchOff', label: 'Default touch-action' },
  { id: 'dvhOff', label: 'No 100dvh min-height' },
  { id: 'barOff', label: 'Hide the bottom bar' },
  { id: 'insetOff', label: 'Header without safe-area padding' },
  { id: 'layers', label: 'Date rows on their own layer (will-change)', extra: true },
  { id: 'guides', label: 'Guides: outline date rows, line at 56px', extra: true },
]

export const ALL_OFF = JITTER_TOGGLES.filter((t) => !t.extra).map((t) => t.id)
