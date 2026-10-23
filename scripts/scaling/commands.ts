/**
 * The commands of scripts/measure-d1.mjs that only read, and the dispatcher. The writing ones are in
 * commandsWrite.ts. Each takes its collaborators in `Deps`, so tests run them against SQLite.
 */
import { CAPS, largestSeed, seedBudget } from './budget'
import { ledgerOfAbout, currentBudgetMonth } from './ledgerSize'
import { SYNTHETIC_OWNER } from './guard'
import { compareRuns, renderPlan, type RunFile } from './report'
import { fingerprintOthers } from './snapshot'
import { openSession, probeBatch, type Deps } from './session'
import type { Args } from './args'
import { cleanup, measure, seed, verify } from './commandsWrite'

function plan(args: Args, deps: Deps): number {
  const month = currentBudgetMonth(deps.now())
  const budget = seedBudget(ledgerOfAbout(args.transactions, month))
  const largest = largestSeed((n) => ledgerOfAbout(n, month))
  for (const line of renderPlan(budget, largest)) deps.print(line)
  return budget.fitsTotalCap && budget.fitsDailyCap ? 0 : 1
}

async function check(args: Args, deps: Deps): Promise<number> {
  const session = await openSession(args, deps, 0)
  const { transport } = session
  const one = async (sql: string, params: unknown[] = []) => (await session.query({ sql, params })).results
  deps.print(`target ${args.database}: matches config/dev.json and Cloudflare, and is not the production database`)
  deps.print(`last migration recorded: ${String((await one('SELECT name FROM _migrations ORDER BY name DESC LIMIT 1'))[0]?.name)}`)
  const indexes = await one('PRAGMA index_list(transactions)')
  deps.print(`indexes on transactions: ${indexes.length} (${indexes.map((i) => String(i.name)).join(', ')})`)
  try {
    deps.print(`table statistics: ${String((await one('SELECT count(*) AS n FROM sqlite_stat1'))[0]?.n)} rows in sqlite_stat1`)
  } catch (error) {
    deps.print(`table statistics: sqlite_stat1 cannot be read (${error instanceof Error ? error.message : String(error)})`)
  }
  deps.print(`synthetic owner transactions: ${String((await one('SELECT count(*) AS n FROM transactions WHERE owner = ?', [SYNTHETIC_OWNER]))[0]?.n)}`)
  await probeBatch(transport)
  deps.print('batch through the API: answers statement by statement')
  const { usage } = session
  deps.print(usage
    ? `account today: ${usage.rowsWritten} rows written, ${usage.rowsRead} read (this exercise stops at ${CAPS.accountWrittenCeiling} and ${CAPS.accountReadCeiling})`
    : 'account today: unknown (the token cannot read analytics; pass --account-written-today N before any write)')
  session.saveSpend()
  return 0
}

async function snapshot(args: Args, deps: Deps): Promise<number> {
  const session = await openSession(args, deps, 0)
  const fingerprint = await fingerprintOthers(session.transport, session.ledger)
  const path = `.tmp/scaling/snapshot-${args.database}-${deps.now().toISOString().replace(/[:.]/g, '-')}.json`
  deps.files.writeJson(path, { database: args.database, takenAt: deps.now().toISOString(), fingerprint })
  session.saveSpend()
  for (const [table, f] of Object.entries(fingerprint)) deps.print(`${table}: ${f.rows} rows`)
  deps.print(`snapshot saved to ${path} (hashes of row contents; nothing else is stored)`)
  deps.print(`rows read so far today by this exercise: ${session.ledger.totals.read}`)
  return 0
}

function compare(args: Args, deps: Deps): number {
  const [a, b] = args.files
  if (!a || !b) throw new Error('compare needs two result files from measure runs')
  for (const line of compareRuns(deps.files.readJson(a) as RunFile, deps.files.readJson(b) as RunFile)) deps.print(line)
  return 0
}

export async function execute(args: Args, deps: Deps): Promise<number> {
  switch (args.command) {
    case 'plan': return plan(args, deps)
    case 'check': return check(args, deps)
    case 'snapshot': return snapshot(args, deps)
    case 'seed': return seed(args, deps)
    case 'measure': return measure(args, deps)
    case 'cleanup': return cleanup(args, deps)
    case 'verify': return verify(args, deps)
    case 'compare': return compare(args, deps)
  }
}
