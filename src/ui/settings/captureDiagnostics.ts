import type { SourceDiagnostics } from '../../data/captureStatusApi'

/** The three rates the panel shows, as whole percentages of the decided recommendations. */
export interface DiagnosticRates {
  decided: number
  addedAsIs: number
  edited: number
  dismissed: number
}

const percent = (
  part: number,
  whole: number,
) => Math.round((100 * part) / whole)

/**
 * Of the recommendations decided in the window, how many were added as the card showed them, added after an edit, and
 * dismissed. A link is a decision too, so the three need not add up to 100. Null before anything was decided.
 */
export function ratesOf(d: SourceDiagnostics): DiagnosticRates | null {
  const decided = d.addedAsIs + d.edited + d.linked + d.dismissed
  if (decided === 0) return null
  return {
    decided,
    addedAsIs: percent(d.addedAsIs, decided),
    edited: percent(d.edited, decided),
    dismissed: percent(d.dismissed, decided),
  }
}
