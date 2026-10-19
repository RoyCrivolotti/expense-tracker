/**
 * The rules that keep a measurement run off production and off anyone else's rows. Pure functions, so the
 * rules are tested without a token; the command line and the D1 adapter both call them before anything is
 * sent. See docs/SCALING.md, "Measuring on a deployed system".
 */

/** The production database's name (docs/DEPLOYMENT.md). It is never a valid target, whatever else matches. */
export const PRODUCTION_DATABASE = 'roy-expenses'

/**
 * The only owner a run may write as. example.com is reserved for documentation (RFC 2606), so no one can
 * sign in as this address and no real user can share it, and `scripts/check-pii.mjs` accepts it.
 */
export const SYNTHETIC_OWNER = 'scaling-check@example.com'

export interface DevConfig {
  d1DatabaseId: string
  d1DatabaseName: string
}

/** The ids of every `[[d1_databases]]` block whose name is the production database, from a wrangler.toml. */
export function productionDatabaseIds(wranglerToml: string): string[] {
  const ids: string[] = []
  for (const block of wranglerToml.split('[[d1_databases]]').slice(1)) {
    const name = /database_name\s*=\s*"([^"]+)"/.exec(block)?.[1]
    const id = /database_id\s*=\s*"([^"]+)"/.exec(block)?.[1]
    if (name === PRODUCTION_DATABASE && id) ids.push(id)
  }
  return ids
}

/** The one check that needs nothing else: production is refused before config or credentials are read. */
export function assertNotProduction(database: string): void {
  if (database === PRODUCTION_DATABASE) {
    throw new Error(`Refusing to use "${database}": that is the production database`)
  }
}

export interface TargetCheck {
  /** `--database`, as typed. */
  database: string
  dev: DevConfig
  /** Ids the repository itself binds to production (the backup Worker's wrangler.toml). */
  productionIds: readonly string[]
  /** What Cloudflare says the id is called, once the caller has asked. Absent for an offline check. */
  resolved?: { uuid: string; name: string }
}

/**
 * Throws unless `database` is the development database and demonstrably not production: the name matches
 * `config/dev.json`, is not the production name and ends in `-dev`; the id is not one the repository binds
 * to production; and when Cloudflare has been asked, it agrees about name and id.
 */
export function assertSafeTarget(check: TargetCheck): void {
  const { database, dev, productionIds, resolved } = check
  const refuse = (why: string): never => {
    throw new Error(`Refusing to use "${database}": ${why}`)
  }
  if (!database) refuse('no --database given')
  assertNotProduction(database)
  if (!/-dev$/.test(database)) refuse('a development database name ends in -dev')
  if (database !== dev.d1DatabaseName) refuse(`config/dev.json names "${dev.d1DatabaseName}"`)
  if (productionIds.includes(dev.d1DatabaseId)) refuse('config/dev.json holds the production id')
  if (resolved && (resolved.uuid !== dev.d1DatabaseId || resolved.name !== database)) {
    refuse('Cloudflare reports a different database for the id in config/dev.json')
  }
}

const SQL_COMMENT = /--[^\n]*|\/\*[\s\S]*?\*\//g
const DDL = /\b(create|drop|alter|vacuum|reindex|analyze|attach|detach)\b/i
// `replace(` is also a string function (the search statement uses it), so only the statement forms count.
const WRITE = /\b(insert|update|delete)\b|\breplace\s+into\b|\bor\s+replace\b/i
const PRAGMA_SET = /\bpragma\b[^;]*=/i

export type StatementKind = 'read' | 'write' | 'ddl'

/** What a statement does, judged by its keywords. Errs toward "write": a false alarm only refuses. */
export function classifyStatement(sql: string): StatementKind {
  const text = sql.replace(SQL_COMMENT, ' ')
  if (DDL.test(text) || PRAGMA_SET.test(text)) return 'ddl'
  return WRITE.test(text) ? 'write' : 'read'
}

/**
 * Throws when a statement may not be sent. Reads always may. A write needs writes to have been enabled, must
 * name an owner column and bind the synthetic owner, and DDL is never allowed: a run changes rows, never
 * the schema. Everything the tool sends is built from fixed templates, so this is a second line, not the
 * first.
 */
export function assertStatementAllowed(
  sql: string,
  params: readonly unknown[],
  writesEnabled: boolean,
): void {
  const kind = classifyStatement(sql)
  if (kind === 'read') return
  const head = sql.trim().slice(0, 80)
  if (kind === 'ddl') throw new Error(`Refusing a schema statement: ${head}`)
  if (!writesEnabled) throw new Error(`Refusing a write without --write: ${head}`)
  if (!/\b(owner|email)\b/i.test(sql)) throw new Error(`Refusing a write that names no owner: ${head}`)
  if (!params.includes(SYNTHETIC_OWNER)) {
    throw new Error(`Refusing a write that does not bind the synthetic owner: ${head}`)
  }
}

/** The `--confirm` flag must repeat the database name, so a pasted command cannot write by accident. */
export function assertConfirmed(database: string, confirm: string | undefined): void {
  if (confirm !== database) {
    throw new Error(`Writes need --confirm ${database || '<database>'} to repeat the database name`)
  }
}
