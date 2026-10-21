/**
 * Everything a command that talks to Cloudflare checks before its first statement: credentials are present,
 * the target is the development database and Cloudflare agrees, writes were asked for twice (`--write` and
 * `--confirm`), the account has room today, and `batch` works through the API. The token is read from the
 * environment and handed straight to the transport; nothing here prints it.
 */
import { assertAccountHasRoom, earlierThan, SpendLedger, totalsFor, utcDay, type SpendTotals } from './spend'
import {
  assertConfirmed,
  assertNotProduction,
  assertSafeTarget,
  assertStatementAllowed,
  productionDatabaseIds,
  type DevConfig,
} from './guard'
import type { MeasureOptions, RouteResult } from '../../functions/_shared/measure/records'
import type { Args } from './args'
import type { AccountUsage, D1Reply, RestOptions, Statement, Transport } from './transport'

export interface Files {
  readJson: (path: string) => unknown
  writeJson: (path: string, value: unknown) => void
  exists: (path: string) => boolean
}

export interface Deps {
  env: Record<string, string | undefined>
  now: () => Date
  readDevConfig: () => DevConfig
  readProductionToml: () => string
  files: Files
  transportFor: (options: RestOptions) => Transport
  describe: (options: RestOptions) => Promise<{ uuid: string; name: string }>
  usage: (options: Omit<RestOptions, 'databaseId'>, day: string) => Promise<AccountUsage>
  print: (line: string) => void
  stopRequested: () => boolean
  /** The route matrix, passed in because it runs the app's own handlers, which Node's typecheck cannot read. */
  measureRoutes: (options: MeasureOptions) => Promise<RouteResult[]>
}

export const SPEND_FILE = '.tmp/scaling/spend.json'

export interface Session {
  transport: Transport
  ledger: SpendLedger
  options: RestOptions
  dev: DevConfig
  day: string
  usage: AccountUsage | undefined
  /** One statement through the write guard and the spend ledger. */
  query: (statement: Statement) => Promise<D1Reply>
  saveSpend: () => void
}

function credentials(env: Deps['env']): { token: string; accountId: string } {
  const token = env.CLOUDFLARE_API_TOKEN?.trim()
  const accountId = env.CLOUDFLARE_ACCOUNT_ID?.trim()
  if (!token || !accountId) {
    throw new Error('CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID must be set in the environment of this command')
  }
  return { token, accountId }
}

function storedDays(files: Files): SpendTotals[] {
  if (!files.exists(SPEND_FILE)) return []
  const stored = files.readJson(SPEND_FILE) as { days?: SpendTotals[] }
  return stored.days ?? []
}

async function accountUsage(args: Args, deps: Deps, base: Omit<RestOptions, 'databaseId'>, day: string): Promise<AccountUsage | undefined> {
  if (args.accountWrittenToday !== undefined) {
    return { rowsRead: args.accountReadToday ?? 0, rowsWritten: args.accountWrittenToday, byDatabase: {} }
  }
  try {
    return await deps.usage(base, day)
  } catch (error) {
    if (args.write) {
      const why = error instanceof Error ? error.message : String(error)
      throw new Error(`${why}\nRead today's rows written from the dashboard (D1 > Metrics) and pass --account-written-today N`, { cause: error })
    }
    return undefined
  }
}

/** Every statement, single or batched, passes the write guard and the stop file before it is sent. */
export function guarded(inner: Transport, writesEnabled: boolean, shouldStop: () => boolean = () => false): Transport {
  const admit = (statement: Statement): void => {
    if (shouldStop()) throw new Error('Stopped: the stop file is present')
    assertStatementAllowed(statement.sql, statement.params, writesEnabled)
  }
  return {
    query: (statement) => {
      admit(statement)
      return inner.query(statement)
    },
    batch: (statements) => {
      statements.forEach(admit)
      return inner.batch(statements)
    },
  }
}

/** `plannedWritten` is what this command expects to write today; read-only commands pass 0. */
export async function openSession(args: Args, deps: Deps, plannedWritten: number): Promise<Session> {
  assertNotProduction(args.database)
  const { token, accountId } = credentials(deps.env)
  const dev = deps.readDevConfig()
  const productionIds = productionDatabaseIds(deps.readProductionToml())
  assertSafeTarget({ database: args.database, dev, productionIds })
  const options: RestOptions = { accountId, databaseId: dev.d1DatabaseId, token }
  assertSafeTarget({ database: args.database, dev, productionIds, resolved: await deps.describe(options) })
  if (args.write) assertConfirmed(args.database, args.confirm)

  const day = utcDay(deps.now())
  const days = storedDays(deps.files)
  const ledger = new SpendLedger(totalsFor(days, day), earlierThan(days, day))
  const usage = await accountUsage(args, deps, { accountId, token }, day)
  if (args.write) {
    if (!usage) throw new Error('Cannot tell how much of the day the account has used; refusing to write')
    assertAccountHasRoom(usage, plannedWritten)
    ledger.assertWithin(plannedWritten)
  }
  const transport = guarded(deps.transportFor(options), args.write, deps.stopRequested)
  return {
    transport,
    query: async (statement) => {
      const reply = await transport.query(statement)
      ledger.record(reply.meta)
      return reply
    },
    ledger,
    options,
    dev,
    day,
    usage,
    saveSpend: () => {
      const others = days.filter((d) => d.day !== day)
      deps.files.writeJson(SPEND_FILE, { days: [...others, ledger.totals] })
    },
  }
}

/** Two reads in one batch must come back as two results, in order: the write routes rely on it. */
export async function probeBatch(transport: Transport): Promise<void> {
  const replies = await transport.batch([
    { sql: 'SELECT 1 AS a', params: [] },
    { sql: 'SELECT 2 AS a', params: [] },
  ])
  const values = replies.map((r) => r.results[0]?.a)
  if (values[0] !== 1 || values[1] !== 2) throw new Error('The API did not answer a batch statement by statement')
}
