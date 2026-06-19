#!/usr/bin/env node
/**
 * One-time / idempotent setup for scheduled D1 → R2 backups:
 * 1. Create R2 bucket roy-expenses-backups (wrangler)
 * 2. Bind BACKUPS on expense-tracker Pages (production + preview)
 *
 * Cron runs on the expense-backup-cron Worker — deploy with npm run deploy:backup-cron.
 */
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { resolveCloudflareToken } from './cloudflare-auth.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID ?? '800abdfb2ec1687266f66fd349c41d6a'
const TOKEN = resolveCloudflareToken()
const PAGES_PROJECT = 'expense-tracker'
const BUCKET = 'roy-expenses-backups'
const DB_ID = '3dcefc85-e172-4fd0-a623-f2f15120c9d9'

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

async function syncBackupsBinding() {
  const project = await cf(`/accounts/${ACCOUNT_ID}/pages/projects/${PAGES_PROJECT}`)
  const configs = project.deployment_configs ?? {}
  const patch = { deployment_configs: {} }
  for (const env of ['production', 'preview']) {
    const base = configs[env] ?? {}
    patch.deployment_configs[env] = {
      ...base,
      d1_databases: { DB: { id: DB_ID } },
      r2_buckets: {
        ...(base.r2_buckets ?? {}),
        BACKUPS: { name: BUCKET },
      },
    }
  }
  await cf(`/accounts/${ACCOUNT_ID}/pages/projects/${PAGES_PROJECT}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
  console.log(`Pages ${PAGES_PROJECT} BACKUPS → ${BUCKET} (production + preview)`)
}

async function main() {
  if (!TOKEN) {
    throw new Error(
      'No Cloudflare token — set CLOUDFLARE_API_TOKEN or run wrangler login',
    )
  }
  const bucketReady = ensureBucket()
  if (!bucketReady) {
    console.warn('Skipping BACKUPS binding until R2 bucket exists.')
    return
  }
  await syncBackupsBinding()
  console.log('')
  console.log('Next: npm run deploy:backup-cron  (Worker cron 0 4 * * * UTC)')
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
