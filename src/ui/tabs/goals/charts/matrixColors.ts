/**
 * The cell's colours as a pair, since the text is picked for the background it sits on: only the
 * dark green of "now" takes white (7.1:1), and every other bucket is light enough for the dark
 * text (at least 6.8:1).
 */
export function cellColors(years: number | null): { background: string; color: string } {
  const color = years === 0 ? '#fff' : '#111'
  if (years === null) return { background: '#fecaca', color }
  if (years === 0) return { background: '#166534', color }
  if (years <= 10) return { background: '#86efac', color }
  if (years <= 20) return { background: '#fde047', color }
  if (years <= 30) return { background: '#fdba74', color }
  return { background: '#f87171', color }
}
