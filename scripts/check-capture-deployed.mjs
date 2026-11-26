#!/usr/bin/env node
/**
 * Fail unless both capture Workers are running the commit being shipped. Only reads.
 *
 *   node scripts/check-capture-deployed.mjs
 *
 * For each Worker: the current deployment must be a single version taking all the traffic, and that version's message,
 * which scripts/deploy-capture.mjs sets, must be the commit (GITHUB_SHA, or HEAD when run by hand). The version must
 * also be bound to its environment's database, as `DB`, and to the secret without which it refuses every push. Anything
 * it cannot read is a failure. An upload made another way names no commit and fails too.
 *
 * Needs CLOUDFLARE_API_TOKEN with Workers Scripts and D1, or a current `wrangler login`.
 */
import { pathToFileURL } from 'node:url'
import { ACCOUNT_ID, cf } from './access-api.mjs'
import { resolveCloudflareToken } from './cloudflare-auth.mjs'
import {
  CAPTURE_ENVIRONMENTS,
  captureTarget,
  findDatabaseId,
  REQUEST_TIMEOUT_MS,
  runGit,
  shippedCommit,
} from './deploy-capture.mjs'

/**
 * What a version of the right commit can still have wrong: a database that is another environment's, or no replay secret
 * (a Worker that was deleted comes back from a deploy without it).
 * @param {{ name?: string, type?: string, id?: string, database_id?: string }[]} bindings
 * @param {{ worker: string, database: string }} target
 * @param {string} databaseId
 * @returns {string[]}
 */
function bindingProblems(
  bindings,
  { worker, database },
  databaseId,
) {
  const problems = []
  const db = bindings.find((binding) => binding.name === 'DB' && binding.type === 'd1')
  if ((db?.database_id || db?.id) !== databaseId) {
    problems.push(`${worker} does not have the database ${database} bound as DB`)
  }
  if (!bindings.some((binding) => binding.name === 'CAPTURE_REPLAY_SECRET' && binding.type === 'secret_text')) {
    problems.push(`${worker} has no secret CAPTURE_REPLAY_SECRET, so it refuses every push`)
  }
  return problems
}

/**
 * @param {string} token
 * @param {string} accountId
 * @param {{ worker: string, database: string }} target
 * @param {string} commit
 * @returns {Promise<string | null>} what is wrong, or null when the Worker runs the commit as it should
 */
export async function findProblem(
  token,
  accountId,
  target,
  commit,
) {
  const { worker } = target
  const script = `/accounts/${accountId}/workers/scripts/${worker}`
  const read = (path) => cf(token, path, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })

  // Cloudflare lists the deployment now serving first.
  const current = (await read(`${script}/deployments`))?.deployments?.[0]
  if (!current) return `${worker} has no deployment`

  const versions = current.versions ?? []
  if (versions.length !== 1 || versions[0].percentage !== 100) {
    const shares = versions.map((v) => `${String(v.version_id).slice(0, 8)} at ${v.percentage}%`).join(', ')
    return `${worker} is not running one version alone (${shares || 'no version listed'})`
  }

  const version = await read(`${script}/versions/${versions[0].version_id}`)
  const message = version?.annotations?.['workers/message']
  if (message !== commit) {
    const running = message ? `a version of ${message}` : 'a version that names no commit'
    return `${worker} is running ${running}, not ${commit}`
  }
  const databaseId = await findDatabaseId(token, accountId, target.database)
  return bindingProblems(version.resources?.bindings ?? [], target, databaseId).join('; ') || null
}

/**
 * @param {{
 *   env?: Record<string, string | undefined>,
 *   token?: () => string | null,
 *   git?: (args: string[]) => string,
 *   log?: (line: string) => void,
 * }} [deps]
 * @returns {Promise<number>} the exit code
 */
export async function main(deps = {}) {
  const { env = process.env, token = resolveCloudflareToken, git = runGit, log = console.log } = deps
  const fail = (text) => log(`::error::${text}`)
  // In the ship job this runs after everything it could report on.
  const sayWhereThingsStand = () => {
    if (env.GITHUB_ACTIONS) {
      log('Both Pages projects and both capture deploy steps had already run. The check changes nothing.')
    }
  }
  let commit
  let apiToken
  try {
    commit = shippedCommit(env, git)
    apiToken = token()
    if (!apiToken) throw new Error('CLOUDFLARE_API_TOKEN is not set, and there is no wrangler login')
  } catch (error) {
    fail(`Could not check the capture Workers. ${error instanceof Error ? error.message : String(error)}`)
    sayWhereThingsStand()
    return 1
  }
  const accountId = env.CLOUDFLARE_ACCOUNT_ID || ACCOUNT_ID

  let failed = 0
  // Both are read even when the first is wrong, so one run says everything that needs doing.
  for (const environment of CAPTURE_ENVIRONMENTS) {
    let worker = `The ${environment} capture Worker`
    let problem
    try {
      const target = captureTarget(environment, env)
      worker = target.worker
      problem = await findProblem(apiToken, accountId, target, commit)
    } catch (error) {
      problem = `${worker} could not be checked: ${error instanceof Error ? error.message : String(error)}`
    }
    if (problem) {
      failed = 1
      fail(problem)
    } else log(`${worker}: running ${commit}`)
  }
  if (failed) {
    sayWhereThingsStand()
    log('See docs/CAPTURE-WORKER.md, "When the deploy or its check fails".')
  }
  return failed
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main()
}
