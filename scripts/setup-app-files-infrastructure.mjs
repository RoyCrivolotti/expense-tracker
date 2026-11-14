#!/usr/bin/env node
/**
 * Setup for the app-files bucket: deployment files the app serves that are not user data (today the capture
 * Shortcut, under `shortcuts/`). Nothing sweeps, lists or expires this bucket, and it must never hold receipts or
 * anything else tied to a person.
 *
 * 1. Create the private R2 bucket (no public access, no custom domain, which is how a new bucket starts).
 * 2. Add the APP_FILES binding to the Pages project's production and preview configs, keeping every other binding.
 *
 * Dry run unless `--apply` is passed: the dry run reads the project and prints what would change, and writes nothing.
 * Needs CLOUDFLARE_ACCOUNT_ID, and a token with Pages and R2 edit rights (CLOUDFLARE_API_TOKEN or a wrangler login).
 *
 *   node scripts/setup-app-files-infrastructure.mjs            # show the plan
 *   node scripts/setup-app-files-infrastructure.mjs --apply    # do it
 */
import { execFileSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { resolveCloudflareToken } from './cloudflare-auth.mjs'

export const PAGES_PROJECT = 'expense-tracker'
export const BUCKET = 'expense-tracker-app-files'
export const BINDING = 'APP_FILES'
const ENVIRONMENTS = ['production', 'preview']
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

export function parseArgs(argv) {
  let apply = false
  for (const arg of argv) {
    if (arg === '--apply') apply = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  return { apply }
}

/**
 * The PATCH body that adds the binding. Each environment sends its whole existing config (D1, variables, other
 * bindings) with `r2_buckets` extended, as the receipts script does, so nothing is lost if the API replaces rather
 * than merges. An existing APP_FILES pointing at another bucket is an error, never overwritten.
 */
export function planBinding(project) {
  const configs = project.deployment_configs ?? {}
  const patch = { deployment_configs: {} }
  const changes = []
  for (const env of ENVIRONMENTS) {
    const base = configs[env] ?? {}
    const existing = base.r2_buckets ?? {}
    const current = existing[BINDING]?.name
    if (current && current !== BUCKET) {
      throw new Error(`${env} already binds ${BINDING} to a different bucket; leaving it alone`)
    }
    if (current === BUCKET) {
      changes.push({ env, change: 'already bound' })
      continue
    }
    patch.deployment_configs[env] = { ...base, r2_buckets: { ...existing, [BINDING]: { name: BUCKET } } }
    changes.push({ env, change: 'bind', keeps: Object.keys(existing).sort() })
  }
  return { patch: Object.keys(patch.deployment_configs).length ? patch : null, changes }
}

export function cloudflareApi(token, accountId, fetchImpl = fetch) {
  return async function cf(path, init = {}) {
    const res = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${accountId}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init.headers },
    })
    const data = await res.json()
    if (!data.success) {
      throw new Error(`${path}: ${data.errors?.map((e) => e.message).join('; ') ?? res.statusText}`)
    }
    return data.result
  }
}

function createBucket(accountId) {
  try {
    execFileSync('npx', ['wrangler', 'r2', 'bucket', 'create', BUCKET], {
      cwd: ROOT,
      stdio: 'pipe',
      env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: accountId },
    })
    return 'created'
  } catch (err) {
    const out = String(err.stderr ?? err.stdout ?? err.message)
    if (out.includes('already exists') || out.includes('AlreadyExists')) return 'exists'
    throw err
  }
}

export async function main(argv, deps = {}) {
  const { apply } = parseArgs(argv)
  const log = deps.log ?? console.log
  const accountId = deps.accountId ?? process.env.CLOUDFLARE_ACCOUNT_ID
  if (!accountId) throw new Error('Set CLOUDFLARE_ACCOUNT_ID')
  const token = deps.token ?? resolveCloudflareToken()
  if (!token) throw new Error('No Cloudflare token: set CLOUDFLARE_API_TOKEN or run wrangler login')
  const api = deps.api ?? cloudflareApi(token, accountId)
  const makeBucket = deps.createBucket ?? createBucket

  const project = await api(`/pages/projects/${PAGES_PROJECT}`)
  const { patch, changes } = planBinding(project)
  for (const c of changes) {
    log(`${c.env}: ${c.change === 'bind' ? `bind ${BINDING} to ${BUCKET}, keeping ${c.keeps.join(', ') || 'no other R2 bindings'}` : c.change}`)
  }
  if (!apply) {
    log(`Dry run. The bucket ${BUCKET} would be created if missing. Nothing was changed; pass --apply to do it.`)
    return { applied: false, patch }
  }
  log(`R2 bucket ${BUCKET} ${makeBucket(accountId)}`)
  if (patch) await api(`/pages/projects/${PAGES_PROJECT}`, { method: 'PATCH', body: JSON.stringify(patch) })
  log('Next: redeploy so the binding reaches the running Functions, then upload the file (docs/CAPTURE.md).')
  return { applied: true, patch }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err.message)
    process.exitCode = 1
  })
}
