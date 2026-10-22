/**
 * The commands that can write: seed, measure with the write routes, and cleanup. Without `--write` the first
 * and last are dry runs that print what they would send and never open a connection. verify only reads.
 */
import { cleanupReserve, readPassEstimate, ROUTE_WRITES_ESTIMATE, seedBudget } from './budget'
import { cleanUp, DELETE_CHUNK, ownerRowCounts, tableDeletes } from './cleanup'
import { measuredDb } from './d1Adapter'
import { SYNTHETIC_OWNER } from './guard'
import { currentBudgetMonth, ledgerOfAbout } from './ledgerSize'
import { renderRoutes, type RunFile } from './report'
import { runSeed } from './runSeed'
import { ID_HEADROOM, ID_TABLES, readIdBases, seedSteps, type IdBases } from './seedSql'
import { openSession, probeBatch, type Deps, type Session } from './session'
import { differences, fingerprintOthers, type Fingerprint } from './snapshot'
import type { Args } from './args'

const OWN_TRANSACTIONS = 'SELECT count(*) AS n FROM transactions WHERE owner = ?'

async function ownTransactions(session: Session): Promise<number> {
  const reply = await session.query({ sql: OWN_TRANSACTIONS, params: [SYNTHETIC_OWNER] })
  return Number(reply.results[0]?.n ?? 0)
}

export async function seed(args: Args, deps: Deps): Promise<number> {
  const dataset = ledgerOfAbout(args.transactions, currentBudgetMonth(deps.now()))
  const budget = seedBudget(dataset)
  if (!args.write) {
    const offline = Object.fromEntries(ID_TABLES.map((t) => [t, ID_HEADROOM])) as IdBases
    const steps = seedSteps(dataset, offline)
    deps.print(`dry run: ${steps.length} statements insert ${budget.transactions} transactions as ${SYNTHETIC_OWNER}`)
    deps.print(`expected rows written: ${budget.insertWrites + budget.referenceWrites} (delete later: about the same)`)
    return budget.fitsTotalCap && budget.fitsDailyCap ? 0 : 1
  }
  if (!budget.fitsTotalCap || !budget.fitsDailyCap) throw new Error('This seed does not fit the caps; see the plan command')
  const session = await openSession(args, deps, budget.insertWrites + budget.referenceWrites)
  if (!args.snapshot || !deps.files.exists(args.snapshot)) {
    throw new Error('seed needs --snapshot FILE from the snapshot command, taken first, so cleanup can be proved')
  }
  if ((await ownTransactions(session)) > 0) throw new Error('The synthetic owner already has rows; run cleanup first')
  const bases = await readIdBases(session.transport)
  const result = await runSeed(session.transport, seedSteps(dataset, bases), session.ledger, deps.stopRequested)
  session.saveSpend()
  deps.print(`seeded ${budget.transactions} transactions in ${result.statements} statements, ${result.rowsWritten} rows written`)
  deps.print(`first 20 transactions: ${result.calibration?.actual} rows written, the plan expected ${result.calibration?.expected}`)
  return 0
}

export async function measure(args: Args, deps: Deps): Promise<number> {
  const session = await openSession(args, deps, args.write ? ROUTE_WRITES_ESTIMATE : 0)
  const count = await ownTransactions(session)
  if (count === 0) throw new Error('The synthetic owner has no rows; seed first')
  session.ledger.assertWithin(args.write ? ROUTE_WRITES_ESTIMATE : 0, readPassEstimate(count))
  if (args.write) await probeBatch(session.transport)
  const { db, recorder } = measuredDb({
    transport: session.transport,
    ledger: session.ledger,
    writesEnabled: args.write,
    shouldStop: deps.stopRequested,
  })
  const results = await deps.measureRoutes({
    db,
    recorder,
    owner: SYNTHETIC_OWNER,
    month: currentBudgetMonth(deps.now()),
    includeWrites: args.write,
  })
  const file: RunFile = { day: session.day, transactions: count, results }
  const path = `.tmp/scaling/routes-${count}-${deps.now().toISOString().replace(/[:.]/g, '-')}.json`
  deps.files.writeJson(path, file)
  session.saveSpend()
  for (const line of renderRoutes(results)) deps.print(line)
  deps.print(`results saved to ${path}; rows read so far today by this exercise: ${session.ledger.totals.read}`)
  return results.some((r) => r.status >= 400 || r.unexpectedWrite) ? 1 : 0
}

export async function cleanup(args: Args, deps: Deps): Promise<number> {
  if (!args.write) {
    deps.print(`dry run: deletes ${SYNTHETIC_OWNER}'s transactions ${DELETE_CHUNK} at a time (links first), then ${tableDeletes().length} more tables`)
    deps.print('every delete binds the synthetic owner; nothing else can match')
    return 0
  }
  const reserve = cleanupReserve(ledgerOfAbout(args.transactions, currentBudgetMonth(deps.now())))
  const session = await openSession(args, deps, reserve)
  const result = await cleanUp(session.transport, session.ledger, deps.stopRequested)
  const left = await ownerRowCounts(session.transport, session.ledger)
  session.saveSpend()
  deps.print(`cleanup sent ${result.statements} statements, ${result.rowsWritten} rows written`)
  const remaining = Object.entries(left).filter(([, n]) => n > 0)
  for (const [table, n] of remaining) deps.print(`STILL THERE: ${table} has ${n} rows`)
  return remaining.length === 0 ? 0 : 1
}

export async function verify(args: Args, deps: Deps): Promise<number> {
  if (!args.snapshot || !deps.files.exists(args.snapshot)) throw new Error('verify needs --snapshot FILE')
  const session = await openSession(args, deps, 0)
  const before = (deps.files.readJson(args.snapshot) as { fingerprint: Fingerprint }).fingerprint
  const left = await ownerRowCounts(session.transport, session.ledger)
  const after = await fingerprintOthers(session.transport, session.ledger)
  session.saveSpend()
  const remaining = Object.entries(left).filter(([, n]) => n > 0)
  const changed = differences(before, after)
  for (const [table, n] of remaining) deps.print(`STILL THERE: ${table} has ${n} rows`)
  for (const line of changed) deps.print(`CHANGED: ${line}`)
  deps.print(remaining.length === 0 ? 'the synthetic owner has no rows in any table' : 'the synthetic owner still has rows')
  deps.print(changed.length === 0 ? 'every other row is byte-for-byte what the snapshot recorded' : 'other rows differ from the snapshot: check whether someone else wrote meanwhile')
  return remaining.length === 0 && changed.length === 0 ? 0 : 1
}
