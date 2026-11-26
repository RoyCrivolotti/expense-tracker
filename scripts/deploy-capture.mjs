#!/usr/bin/env node
/**
 * Deploy one capture Worker (workers/capture, the endpoint that receives bank pushes) from the checked-out commit.
 *
 *   node scripts/deploy-capture.mjs staging
 *   node scripts/deploy-capture.mjs prod
 *
 * The committed wrangler.toml holds placeholders, so wrangler is given a filled copy: the Worker's name, the account,
 * and the D1 database looked up by the name the migrations are applied to. The copy sits beside the original, git
 * ignores it, and it is removed afterwards; anywhere else, the bundle would carry the machine's own paths. The
 * version's message is the full commit, which scripts/check-capture-deployed.mjs reads back.
 *
 * Every failure exits non-zero, a token without the scope included: a deploy that is skipped leaves the Worker running
 * old code. Needs CLOUDFLARE_API_TOKEN with Workers Scripts: Edit and D1, or a current `wrangler login`.
 *
 * The repo's Actions logs are public, so wrangler's output is printed only after `publicOutput` has been through it.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { ACCOUNT_ID, cf } from './access-api.mjs'
import { resolveCloudflareToken } from './cloudflare-auth.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const WORKER_DIR = join(ROOT, 'workers/capture')
export const TEMPLATE_CONFIG = join(WORKER_DIR, 'wrangler.toml')
export const FILLED_CONFIG = join(WORKER_DIR, 'wrangler.filled.toml')
export const REQUEST_TIMEOUT_MS = 30_000
/** Far more than a deploy prints: past the limit, spawnSync kills wrangler halfway. */
const MAX_OUTPUT_BYTES = 32 * 1024 * 1024

/** Staging comes first: whoever walks these in order finds a bad deploy before it reaches production. */
export const CAPTURE_ENVIRONMENTS = ['staging', 'prod']

/**
 * @param {string | undefined} environment
 * @param {Record<string, string | undefined>} env
 */
export function captureTarget(
  environment,
  env = process.env,
) {
  const targets = {
    staging: { worker: 'expense-capture-stg', database: env.DEV_D1_NAME || 'roy-expenses-dev' },
    prod: { worker: 'expense-capture', database: env.PROD_D1_NAME || 'roy-expenses' },
  }
  if (environment !== 'staging' && environment !== 'prod') {
    throw new Error(`Say which Worker: ${CAPTURE_ENVIRONMENTS.join(' or ')}`)
  }
  // One name for both would bind a Worker to the other environment's data.
  if (targets.staging.database === targets.prod.database) {
    throw new Error(
      `Staging and production are both set to the database ${targets.prod.database}. Check DEV_D1_NAME and PROD_D1_NAME`,
    )
  }
  return targets[environment]
}

/**
 * The commit a deploy is named after: GitHub's on a runner, HEAD otherwise.
 * @param {Record<string, string | undefined>} env
 * @param {(args: string[]) => string} git
 */
export function shippedCommit(
  env,
  git,
) {
  const commit = env.GITHUB_SHA || git(['rev-parse', 'HEAD'])
  if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error(`Not a full commit id: ${commit}`)
  return commit
}

/** @param {string[]} args */
export function runGit(args) {
  const result = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr || result.error?.message}`)
  return result.stdout.trim()
}

/**
 * @param {string} toml
 * @param {string} key
 * @param {string} value
 */
function setLine(
  toml,
  key,
  value,
) {
  const line = new RegExp(`^${key} = ".*"$`, 'gm')
  if (toml.match(line)?.length !== 1) {
    throw new Error(`workers/capture/wrangler.toml needs exactly one line setting ${key}`)
  }
  return toml.replace(line, () => `${key} = ${JSON.stringify(value)}`)
}

/**
 * The committed config with its placeholders filled.
 * @param {string} template
 * @param {{ worker: string, accountId: string, database: string, databaseId: string }} values
 */
export function filledConfig(
  template,
  values,
) {
  let toml = setLine(template, 'name', values.worker)
  toml = setLine(toml, 'database_name', values.database)
  toml = setLine(toml, 'database_id', values.databaseId)
  // A top-level key has to come before the first table.
  return `account_id = ${JSON.stringify(values.accountId)}\n${toml}`
}

/**
 * @param {string} token
 * @param {string} accountId
 * @param {string} name
 * @returns {Promise<string>}
 */
export async function findDatabaseId(
  token,
  accountId,
  name,
) {
  const found = await cf(token, `/accounts/${accountId}/d1/database?name=${encodeURIComponent(name)}&per_page=100`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  // The name filter also returns every database whose name only contains it.
  const exact = found.filter((database) => database.name === name)
  if (exact.length !== 1 || !exact[0].uuid) throw new Error(`No D1 database called ${name} on this account`)
  return exact[0].uuid
}

/**
 * What wrangler wrote, fit for a public log. It prints each Worker's address, which is private: nothing limits requests
 * to it. On an authentication error it goes on to run `whoami`, which names the account and can name its email.
 * @param {string} text
 */
export function publicOutput(text) {
  return text
    .replace(/^.*Getting User settings[\s\S]*$/m, "(wrangler's account details are left out)")
    .replace(/[\w.-]*\.workers\.dev/gi, '<address hidden>')
}

/**
 * @param {{ environment: string, worker: string, started: boolean, inCi: boolean }} failure
 */
function whereThingsStand({ environment, worker, started, inCi }) {
  const here = started
    ? `${worker} may be on either version, since wrangler can fail after the upload.`
    : `${worker} was not touched.`
  if (!inCi) return here
  // The order of the ship job in .github/workflows/deploy.yml.
  const rest =
    environment === 'staging'
      ? 'The production capture Worker was not touched, and the check did not run.'
      : 'The staging capture step had passed, and the check did not run.'
  return `Both Pages projects had already shipped. ${here} ${rest}`
}

/**
 * @param {string[]} argv
 * @param {{
 *   env?: Record<string, string | undefined>,
 *   token?: () => string | null,
 *   git?: (args: string[]) => string,
 *   run?: (command: string, args: string[], options: import('node:child_process').SpawnSyncOptions) =>
 *     { status: number | null, error?: Error, stdout?: string | Buffer, stderr?: string | Buffer },
 *   log?: (line: string) => void,
 * }} [deps]
 * @returns {Promise<number>} the exit code
 */
export async function main(
  argv,
  deps = {},
) {
  const { env = process.env, token = resolveCloudflareToken, git = runGit, run = spawnSync, log = console.log } = deps
  let written = false
  let started = false
  let target
  try {
    target = captureTarget(argv[0], env)
    // A runner's checkout is the commit itself. By hand, an edited tree would be deployed under HEAD's name.
    if (!env.GITHUB_SHA && git(['status', '--porcelain'])) {
      throw new Error('The working tree has changes, so the version could not be named after its commit')
    }
    const commit = shippedCommit(env, git)
    const apiToken = token()
    if (!apiToken) throw new Error('CLOUDFLARE_API_TOKEN is not set, and there is no wrangler login')
    const accountId = env.CLOUDFLARE_ACCOUNT_ID || ACCOUNT_ID
    const databaseId = await findDatabaseId(apiToken, accountId, target.database)

    const template = readFileSync(TEMPLATE_CONFIG, 'utf8')
    writeFileSync(FILLED_CONFIG, filledConfig(template, { ...target, accountId, databaseId }))
    written = true

    // --keep-vars: a variable set in the dashboard (OWNER_EMAIL can be one) survives the deploy.
    const args = ['wrangler', 'deploy', '--config', FILLED_CONFIG, '--keep-vars']
    args.push('--message', commit, '--tag', commit.slice(0, 8))
    started = true
    const result = run('npx', args, {
      cwd: ROOT,
      // Piped, never inherited: whatever wrangler writes straight to the log cannot be filtered.
      stdio: ['inherit', 'pipe', 'pipe'],
      encoding: 'utf8',
      maxBuffer: MAX_OUTPUT_BYTES,
      env: { ...env, CLOUDFLARE_ACCOUNT_ID: accountId },
    })
    for (const stream of [result.stdout, result.stderr]) {
      if (stream) log(publicOutput(String(stream)).trimEnd())
    }
    if (result.status !== 0) {
      throw new Error(
        `wrangler did not finish${result.error ? `: ${publicOutput(result.error.message)}` : ''}. If it reports an authentication or permission error, the token needs Account > Workers Scripts > Edit`,
      )
    }
    log(`${target.worker}: deployed ${commit}, bound to ${target.database}`)
    return 0
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    const subject = target ? ` for ${target.worker}` : ''
    const state = target
      ? ` ${whereThingsStand({ environment: argv[0], worker: target.worker, started, inCi: Boolean(env.GITHUB_ACTIONS) })}`
      : ' No Worker was touched.'
    log(`::error::Capture Worker deploy failed${subject}. ${reason.replace(/\.$/, '')}.${state}`)
    return 1
  } finally {
    if (written) rmSync(FILLED_CONFIG, { force: true })
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2))
}
