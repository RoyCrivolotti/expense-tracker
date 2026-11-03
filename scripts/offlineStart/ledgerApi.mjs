/**
 * The routes the app reads a ledger in parts from, answered from a dataset by the repo's own in-memory source, which
 * serves the shapes the real routes do (`src/data/inMemoryLedgerParts.ts`).
 */
import { tsImport } from 'tsx/esm/api'

const { inMemoryLedgerParts } = await tsImport('../../src/data/inMemoryLedgerParts.ts', import.meta.url)

export function serveLedgerParts(site, dataset) {
  const parts = inMemoryLedgerParts(() => ({ dataset, revision: 'r1' }))
  const range = (url) => ({ from: url.searchParams.get('from'), to: url.searchParams.get('to') })
  const routes = {
    '/api/expenses/reference': () => parts.readReferencePart(),
    '/api/expenses/transactions/months': (url) => parts.readMonthsPart(range(url)),
    '/api/expenses/cube': (url) => parts.readCubePart(range(url)),
    '/api/expenses/series': () => parts.readSeriesPart(),
    '/api/expenses/usage': () => parts.readUsagePart(),
    '/api/expenses/attachments': () => parts.readReceiptsPart(),
  }
  for (const [path, answer] of Object.entries(routes)) site.state.api.set(path, answer)
}
