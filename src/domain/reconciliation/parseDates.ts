/** Parse DD/MM/YYYY from Santander / Iberia exports into ISO YYYY-MM-DD. */
export function parseBankDate(raw: string): string | null {
  const match = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!match) return null
  const day = Number(match[1])
  const month = Number(match[2])
  const year = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function daysBetween(isoA: string, isoB: string): number {
  const a = new Date(`${isoA}T12:00:00Z`).getTime()
  const b = new Date(`${isoB}T12:00:00Z`).getTime()
  return Math.round((b - a) / 86_400_000)
}

export function addDays(iso: string, delta: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}

export function monthWindow(budgetMonth: string): { from: string; to: string } {
  const parts = budgetMonth.split('-').map(Number)
  const y = parts[0] ?? 0
  const m = parts[1] ?? 1
  const from = addDays(`${y}-${String(m).padStart(2, '0')}-01`, -45)
  const nextM = m === 12 ? 1 : m + 1
  const nextY = m === 12 ? y + 1 : y
  const to = addDays(`${nextY}-${String(nextM).padStart(2, '0')}-01`, 45)
  return { from, to }
}
