#!/usr/bin/env node
/**
 * One-time / idempotent setup for receipt storage:
 * 1. Create R2 bucket receipts (wrangler)
 * 2. Bind RECEIPTS on the expense-tracker Pages project
 *
 * A sibling of setup-backup-infrastructure.mjs rather than an edit to it: that
 * script hardcodes one BUCKET and one binding name, and the two have different
 * lifecycles — receipts are user data written on demand, backups are machine
 * data written by a cron. Both PATCH `r2_buckets` with a spread, so running
 * either one leaves the other's binding intact.
 *
 * Unlike BACKUPS, this binds preview as well as production: the staging Pages
 * project is where receipt upload gets verified on a real phone, and the
 * headless browser cannot exercise a camera capture.
 */
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { resolveCloudflareToken } from './cloudflare-auth.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID ?? '800abdfb2ec1687266f66fd349c41d6a'
const TOKEN = resolveCloudflareToken()
const PAGES_PROJECT = 'expense-tracker'
const BUCKET = 'receipts'

async function cf(path, init = {}) {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  })
  const data = await res.json()
  if (!data.success) {
    const msg = data.errors?.map((e) => e.message).join('; ') ?? res.statusText
    throw new Error(`${path}: ${msg}`)
  }
  return data.result
}

function ensureBucket() {
  try {
    execSync(`npx wrangler r2 bucket create ${BUCKET}`, {
      cwd: ROOT,
      stdio: 'pipe',
      env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: ACCOUNT_ID },
    })
    console.log(`R2 bucket ${BUCKET} created`)
    return true
  } catch (err) {
    const out = String(err.stderr ?? err.stdout ?? err.message)
    if (out.includes('already exists') || out.includes('AlreadyExists')) {
      console.log(`R2 bucket ${BUCKET} already exists`)
      return true
    }
    if (out.includes('10042') || out.includes('enable R2')) {
      console.warn(
        'R2 is not enabled on this account — enable it in the Cloudflare dashboard first, then re-run.',
      )
      return false
    }
    throw err
  }
}

async function syncReceiptsBinding() {
  const project = await cf(`/accounts/${ACCOUNT_ID}/pages/projects/${PAGES_PROJECT}`)
  const configs = project.deployment_configs ?? {}
  const patch = { deployment_configs: {} }
  for (const env of ['production', 'preview']) {
    const base = configs[env] ?? {}
    patch.deployment_configs[env] = {
      ...base,
      r2_buckets: { ...(base.r2_buckets ?? {}), RECEIPTS: { name: BUCKET } },
    }
  }
  await cf(`/accounts/${ACCOUNT_ID}/pages/projects/${PAGES_PROJECT}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
  console.log(`Pages ${PAGES_PROJECT} RECEIPTS → ${BUCKET} (production + preview)`)
}

async function main() {
  if (!TOKEN) {
    throw new Error('No Cloudflare token — set CLOUDFLARE_API_TOKEN or run wrangler login')
  }
  if (!ensureBucket()) {
    console.warn('Skipping RECEIPTS binding until the R2 bucket exists.')
    return
  }
  await syncReceiptsBinding()
  console.log('')
  console.log('Next: redeploy so the binding reaches the running Functions (npm run deploy).')
}

main().catch((err) => {
  console.error(err.message)
  process.exitCode = 1
})
