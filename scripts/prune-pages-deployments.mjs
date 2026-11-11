#!/usr/bin/env node
/**
 * Delete old deployments of a Cloudflare Pages project, keeping the ones that still matter.
 *
 *   node scripts/prune-pages-deployments.mjs --project <name>             dry run: print what would go
 *   node scripts/prune-pages-deployments.mjs --project <name> --delete    delete it
 *
 * `--max-delete <n>` raises or lowers the limit on how many one run may delete (default MAX_DELETE).
 * <name> must be listed in config/prune-projects.json.
 *
 * Needs CLOUDFLARE_API_TOKEN with Account > Cloudflare Pages > Edit (the token the deploy uses).
 *
 * Why this exists. Pages keeps every deployment forever, and an old deployment is not inert: its own
 * `<id>.<project>.pages.dev` address keeps serving the code it was built from, with the project's current
 * bindings. Pruning bounds how much old code stays reachable.
 *
 * What is kept: the newest KEEP_PRODUCTION production and KEEP_PREVIEW preview deployments, plus anything
 * that is protected whatever its age (see `planPrune`). Everything else is deleted.
 *
 * Never delete from a partial picture: any unexpected response, an incomplete listing, or a current
 * production deployment that is missing from the listing stops the run before the first delete. So does a
 * plan that would delete more than MAX_DELETE (or --max-delete): a surprise that large is not pruning, and
 * half a deletion is worse than none. The log carries counts and dates only, never a deployment id.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { ACCOUNT_ID, requireToken } from './access-api.mjs'

export const KEEP_PRODUCTION = 10
export const KEEP_PREVIEW = 5
/** A run that would delete more than this stops without deleting, unless --max-delete says otherwise. */
export const MAX_DELETE = 300

/** The Pages projects this script will touch, from the same file the workflow reads. */
export const PROJECTS = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'config', 'prune-projects.json'), 'utf8'),
)

const PAGE_SIZE = 25
const MAX_PAGES = 1000
const REQUEST_TIMEOUT_MS = 30_000
const FINISHED_STAGE_STATUSES = new Set(['success', 'failure', 'canceled', 'skipped'])
const ENVIRONMENTS = ['production', 'preview']

/** Cloudflare API caller. Error text keeps the status and Cloudflare's message, never a path's ids. */
export function cloudflareApi(token, fetchImpl = fetch) {
  return async function api(method, path, query = {}) {
    const url = new URL(`https://api.cloudflare.com/client/v4${path}`)
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value))
    const label = `${method} ${path.replace(/\/accounts\/[^/]+/, '/accounts/:account').replace(/\/deployments\/[^/?]+/, '/deployments/:id')}`
    const res = await fetchImpl(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    let body
    try {
      body = await res.json()
    } catch {
      throw new Error(`${label}: HTTP ${res.status}, and the response was not JSON`)
    }
    if (!res.ok || body?.success !== true) {
      const errors = Array.isArray(body?.errors) ? body.errors.map((e) => `${e?.code}: ${e?.message}`).join('; ') : ''
      throw new Error(`${label}: HTTP ${res.status} (${errors || 'no error detail'})`)
    }
    return body
  }
}

const projectPath = (project) => `/accounts/${ACCOUNT_ID}/pages/projects/${encodeURIComponent(project)}`

function parseDeployment(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || raw.id === '') {
    throw new Error('A deployment in the listing has no id')
  }
  const createdOn = Date.parse(raw.created_on)
  if (Number.isNaN(createdOn)) throw new Error('A deployment in the listing has no readable creation date')
  if (!ENVIRONMENTS.includes(raw.environment)) {
    throw new Error(`A deployment in the listing has an unknown environment: ${JSON.stringify(raw.environment)}`)
  }
  const aliases = raw.aliases ?? []
  if (!Array.isArray(aliases) || aliases.some((a) => typeof a !== 'string')) {
    throw new Error('A deployment in the listing has aliases in a shape this script does not know')
  }
  return {
    id: raw.id,
    createdOn,
    environment: raw.environment,
    aliases,
    stageName: raw.latest_stage?.name ?? null,
    stageStatus: raw.latest_stage?.status ?? null,
  }
}

/** Cloudflare does not always send `total_pages`; then it follows from the total and the page size it used. */
function pageCount(info) {
  if (info.total_pages !== undefined && info.total_pages !== null) {
    if (!Number.isInteger(info.total_pages)) throw new Error('The deployment listing came back in a shape this script does not know')
    return info.total_pages
  }
  const perPage = info.per_page ?? PAGE_SIZE
  if (!Number.isInteger(perPage) || perPage < 1) throw new Error('The deployment listing came back in a shape this script does not know')
  return Math.ceil(info.total_count / perPage)
}

/**
 * Every deployment of the project, or an error. Pages are walked until Cloudflare's own total is reached;
 * a short or repeated page throws, because the keep rules mean nothing over a listing with holes.
 */
export async function listDeployments(api, project) {
  const byId = new Map()
  let totalPages = 1
  let totalCount = 0
  for (let page = 1; page <= totalPages; page++) {
    if (page > MAX_PAGES) throw new Error(`The deployment listing has more than ${MAX_PAGES} pages`)
    const body = await api('GET', `${projectPath(project)}/deployments`, { page, per_page: PAGE_SIZE })
    const info = body.result_info
    if (!Array.isArray(body.result) || !Number.isInteger(info?.total_count)) {
      throw new Error('The deployment listing came back in a shape this script does not know')
    }
    totalCount = info.total_count
    totalPages = pageCount(info)
    for (const raw of body.result) {
      const deployment = parseDeployment(raw)
      if (byId.has(deployment.id)) throw new Error('The deployment listing repeated a deployment, so it moved while being read')
      byId.set(deployment.id, deployment)
    }
  }
  if (byId.size !== totalCount) {
    throw new Error(`The deployment listing is incomplete: read ${byId.size} of ${totalCount}`)
  }
  return [...byId.values()]
}

/** The current production deployment's id and the project's custom domains, or an error. */
export async function readProject(api, project) {
  const projectBody = await api('GET', projectPath(project))
  const domainsBody = await api('GET', `${projectPath(project)}/domains`)
  const result = projectBody.result
  if (!result || typeof result !== 'object' || !Array.isArray(domainsBody.result)) {
    throw new Error('The project came back in a shape this script does not know')
  }
  const canonicalId = result.canonical_deployment?.id ?? null
  if (canonicalId !== null && typeof canonicalId !== 'string') {
    throw new Error('The project names its production deployment in a shape this script does not know')
  }
  const domains = domainsBody.result.map((d) => d?.name)
  if (domains.some((name) => typeof name !== 'string')) {
    throw new Error('The project lists its custom domains in a shape this script does not know')
  }
  return { canonicalId, domains: domains.map((name) => name.toLowerCase()) }
}

function aliasHost(alias) {
  try {
    return new URL(alias.includes('://') ? alias : `https://${alias}`).hostname.toLowerCase()
  } catch {
    return alias.toLowerCase()
  }
}

/**
 * An alias under `pages.dev` is a branch preview address, which the newest-N rule already covers. Any
 * other host is a custom domain, so a deployment it serves is live traffic.
 */
function servesCustomDomain(deployment, domains) {
  return deployment.aliases.some((alias) => {
    const host = aliasHost(alias)
    return domains.includes(host) || !host.endsWith('.pages.dev')
  })
}

const isSuccessful = (d) => d.stageName === 'deploy' && d.stageStatus === 'success'
const isFinished = (d) => FINISHED_STAGE_STATUSES.has(d.stageStatus)

/**
 * Split `deployments` into what stays and what goes.
 *
 * Kept, in addition to the newest `keepProduction` production and `keepPreview` preview deployments
 * (by creation date):
 *   - the current production deployment (`canonicalId`),
 *   - the latest successful deployment of each environment, so a rollback target always exists,
 *   - a deployment a custom domain points at,
 *   - a deployment that has not finished building.
 *
 * `force` is set on a deletion only for a deployment with a branch alias: Cloudflare refuses to delete
 * those without it, and nothing else needs it.
 */
export function planPrune({ deployments, canonicalId, domains = /** @type {string[]} */ ([]), keepProduction = KEEP_PRODUCTION, keepPreview = KEEP_PREVIEW }) {
  const byNewest = [...deployments].sort((a, b) => b.createdOn - a.createdOn || a.id.localeCompare(b.id))
  if (canonicalId !== null && !byNewest.some((d) => d.id === canonicalId)) {
    throw new Error('The current production deployment is not in the listing, so the listing cannot be trusted')
  }
  if (canonicalId === null && byNewest.some((d) => d.environment === 'production')) {
    throw new Error('The project reports no current production deployment, so nothing can be safely pruned')
  }

  const keepCount = { production: keepProduction, preview: keepPreview }
  const seen = { production: 0, preview: 0 }
  const successSeen = { production: false, preview: false }
  const keep = []
  const remove = []

  for (const deployment of byNewest) {
    const env = deployment.environment
    const reasons = []
    if (seen[env]++ < keepCount[env]) reasons.push('newest')
    if (deployment.id === canonicalId) reasons.push('current production')
    if (!successSeen[env] && isSuccessful(deployment)) {
      successSeen[env] = true
      reasons.push('latest successful')
    }
    if (servesCustomDomain(deployment, domains)) reasons.push('custom domain')
    if (!isFinished(deployment)) reasons.push('still building')

    if (reasons.length > 0) keep.push({ deployment, reasons })
    else remove.push({ deployment, force: deployment.aliases.length > 0 })
  }
  return { keep, remove }
}

const day = (ms) => new Date(ms).toISOString().slice(0, 10)

function countBy(items, key) {
  const counts = {}
  for (const item of items) counts[key(item)] = (counts[key(item)] ?? 0) + 1
  return counts
}

const describeCounts = (counts) =>
  ENVIRONMENTS.map((env) => `${counts[env] ?? 0} ${env}`).join(', ')

/** Counts and dates for the log. No ids. */
export function summarize(project, plan) {
  const lines = [`${project}: ${plan.keep.length + plan.remove.length} deployments (${describeCounts(countBy([...plan.keep, ...plan.remove], (x) => x.deployment.environment))})`]
  const reasons = countBy(plan.keep.flatMap((k) => k.reasons), (reason) => reason)
  lines.push(`  keeping ${plan.keep.length} (${describeCounts(countBy(plan.keep, (x) => x.deployment.environment))}); by rule: ${
    Object.entries(reasons).map(([reason, n]) => `${reason} ${n}`).join(', ') || 'none'
  }`)
  if (plan.remove.length === 0) {
    lines.push('  nothing to delete')
    return lines
  }
  const dates = plan.remove.map((r) => r.deployment.createdOn)
  lines.push(`  deleting ${plan.remove.length} (${describeCounts(countBy(plan.remove, (x) => x.deployment.environment))}), created ${day(Math.min(...dates))} to ${day(Math.max(...dates))}`)
  const forced = plan.remove.filter((r) => r.force).length
  if (forced > 0) lines.push(`  ${forced} of them have a branch alias and are deleted with force`)
  return lines
}

/** Plan and, when `apply` is set, carry out the pruning of one project. */
export async function pruneProject({ api, project, apply, maxDelete = MAX_DELETE, log = console.log }) {
  const { canonicalId, domains } = await readProject(api, project)
  const deployments = await listDeployments(api, project)
  const plan = planPrune({ deployments, canonicalId, domains })
  for (const line of summarize(project, plan)) log(line)

  const overCap = plan.remove.length > maxDelete
  if (!apply) {
    if (overCap) log(`  a real run would stop: ${plan.remove.length} is over the limit of ${maxDelete} (--max-delete)`)
    log('  dry run: nothing was deleted. Pass --delete to delete.')
    return plan
  }
  if (overCap) {
    throw new Error(`${project}: ${plan.remove.length} deployments would be deleted, over the limit of ${maxDelete}. Nothing was deleted. Run it by hand with a dry run, then pass --max-delete if that many is right.`)
  }
  for (const [index, { deployment, force }] of plan.remove.entries()) {
    try {
      await api('DELETE', `${projectPath(project)}/deployments/${deployment.id}`, force ? { force: 'true' } : {})
    } catch (err) {
      throw new Error(`Stopped after deleting ${index} of ${plan.remove.length}: ${err.message}`, { cause: err })
    }
    if ((index + 1) % 25 === 0 && index + 1 < plan.remove.length) log(`  deleted ${index + 1} of ${plan.remove.length}`)
  }
  log(`  deleted ${plan.remove.length}`)
  return plan
}

export function parseArgs(argv) {
  let project
  let apply = false
  let maxDelete = MAX_DELETE
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--project') project = argv[++i]
    else if (argv[i] === '--delete') apply = true
    else if (argv[i] === '--max-delete') {
      const value = argv[++i]
      if (!/^\d+$/.test(value ?? '')) throw new Error('--max-delete takes a whole number')
      maxDelete = Number(value)
    } else throw new Error(`Unknown argument: ${argv[i]}`)
  }
  if (!project || !PROJECTS.includes(project)) {
    throw new Error(`Usage: prune-pages-deployments.mjs --project <${PROJECTS.join(' | ')}> [--delete] [--max-delete <n>]`)
  }
  return { project, apply, maxDelete }
}

/** @param {{ token?: string | (() => string), fetchImpl?: typeof fetch, log?: (line: string) => void }} [deps] */
export async function main(argv, deps = {}) {
  const { token = requireToken, fetchImpl = fetch, log = console.log } = deps
  const { project, apply, maxDelete } = parseArgs(argv)
  const api = cloudflareApi(typeof token === 'function' ? token() : token, fetchImpl)
  await pruneProject({ api, project, apply, maxDelete, log })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err.message)
    process.exit(1)
  })
}
