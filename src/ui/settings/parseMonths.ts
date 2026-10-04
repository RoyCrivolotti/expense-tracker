/**
 * Whole months from what was typed: digits, with a decimal mark and zeros after them allowed ("6",
 * "6.0", "6,0"). Number() also reads "1e1", "0x10" and " " (as 10, 16 and 0), none of which is a
 * number of months anyone typed. Null for anything else, which puts the saved value back.
 */
export function parseMonths(text: string): number | null {
  const typed = text.trim()
  // One or two zeros after the mark, as a decimal: three would be a thousands mark ("1,000").
  if (!/^\d+([.,]0{1,2})?$/.test(typed)) return null
  return Number(typed.replace(',', '.'))
}
