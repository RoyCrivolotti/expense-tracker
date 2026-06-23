const ALIASES: ReadonlyArray<{ app: string[]; bank: string[] }> = [
  { app: ['chatgpt'], bank: ['openai', 'chatgpt'] },
  { app: ['disney'], bank: ['disney'] },
  { app: ['cetelam', 'cetelem'], bank: ['cetelem'] },
  { app: ['rent'], bank: ['hamlet'] },
  { app: ['coaching'], bank: ['coaching', 'javier alcala'] },
  { app: ['1password'], bank: ['1password'] },
  { app: ['prime video', 'primevideo'], bank: ['primevideo', 'prime video'] },
  { app: ['youtube'], bank: ['youtube', 'google'] },
  { app: ['glovo'], bank: ['glovo'] },
  { app: ['cursor'], bank: ['cursor'] },
  { app: ['crunchyroll'], bank: ['crunchyroll'] },
  { app: ['google photos'], bank: ['google'] },
]

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1)
}

/** Score 0–1 for description similarity between app label and bank merchant text. */
export function descriptionScore(appDesc: string, bankDesc: string): number {
  const app = appDesc.toLowerCase()
  const bank = bankDesc.toLowerCase()
  if (app === bank) return 1
  if (bank.includes(app) || app.includes(bank)) return 0.85

  for (const { app: appKeys, bank: bankKeys } of ALIASES) {
    const appHit = appKeys.some((k) => app.includes(k))
    const bankHit = bankKeys.some((k) => bank.includes(k))
    if (appHit && bankHit) return 0.9
  }

  const appTok = new Set(tokens(app))
  const bankTok = tokens(bank)
  if (appTok.size === 0 || bankTok.length === 0) return 0
  let overlap = 0
  for (const t of bankTok) {
    if (appTok.has(t)) overlap += 1
  }
  return overlap / Math.max(appTok.size, bankTok.length)
}
