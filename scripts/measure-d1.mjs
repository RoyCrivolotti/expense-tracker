#!/usr/bin/env node
/**
 * Measure what the API costs on a deployed D1 database, without touching production or anyone else's rows.
 *
 *   npx tsx scripts/measure-d1.mjs plan                      the budget, offline, no token
 *   npx tsx scripts/measure-d1.mjs seed                      dry run: what a seed would send
 *   npx tsx scripts/measure-d1.mjs check --database <dev>    read-only
 *
 * Anything that writes needs --write and --confirm <database>, and only the development database named in
 * config/dev.json is ever accepted. The Cloudflare token is read from CLOUDFLARE_API_TOKEN (with
 * CLOUDFLARE_ACCOUNT_ID) and is never printed or stored. The rules, the budget and the proof that nothing else
 * was touched are in docs/MEASURING.md.
 *
 * This file only wires the real filesystem, network and route handlers into scripts/scaling/commands.ts,
 * where the logic is and where it is tested. Run it through tsx (the way seed:scenarios is): the route
 * handlers are TypeScript.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from './scaling/args.ts'
import { execute } from './scaling/commands.ts'
import { accountUsageOn, describeDatabase, restTransport } from './scaling/transport.ts'
import { measureRoutes } from '../functions/_shared/measure/routeMatrix.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const STOP_FILE = join(ROOT, '.tmp/scaling/stop')

const files = {
  readJson: (path) => JSON.parse(readFileSync(join(ROOT, path), 'utf8')),
  writeJson: (path, value) => {
    mkdirSync(dirname(join(ROOT, path)), { recursive: true })
    writeFileSync(join(ROOT, path), `${JSON.stringify(value, null, 2)}\n`)
  },
  exists: (path) => existsSync(join(ROOT, path)),
}

const deps = {
  env: process.env,
  now: () => new Date(),
  readDevConfig: () => {
    if (!existsSync(join(ROOT, 'config/dev.json'))) {
      throw new Error('config/dev.json is missing: copy config/dev.example.json and fill in the development database id')
    }
    return JSON.parse(readFileSync(join(ROOT, 'config/dev.json'), 'utf8'))
  },
  readProductionToml: () => readFileSync(join(ROOT, 'workers/backup-cron/wrangler.toml'), 'utf8'),
  files,
  transportFor: restTransport,
  describe: describeDatabase,
  usage: accountUsageOn,
  print: (line) => console.log(line),
  stopRequested: () => existsSync(STOP_FILE),
  measureRoutes,
}

try {
  process.exitCode = await execute(parseArgs(process.argv.slice(2)), deps)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
