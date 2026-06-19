#!/usr/bin/env node
/**
 * One-time / idempotent setup for scheduled D1 → R2 backups:
 * 1. Create R2 bucket roy-expenses-backups (wrangler)
 * 2. Bind BACKUPS on expense-tracker Pages (production + preview)
 *
 * Cron trigger for functions/scheduled.ts must be added in the dashboard
 * (Workers & Pages → expense-tracker → Settings → Functions → Cron triggers:
 * 0 4 * * *). No public API for Pages Function cron as of 2026-06.
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
  } catch (err) {
    const out = String(err.stderr ?? err.stdout ?? err.message)
    if (out.includes('already exists') || out.includes('AlreadyExists')) {
      console.log(`R2 bucket ${BUCKET} already exists`)
      return
    }
    if (out.includes('10042') || out.includes('enable R2')) {
      console.warn(
        'R2 is not enabled on this account — enable it in the Cloudflare dashboard first, then re-run.',
      )
      return
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
  ensureBucket()
  await syncBackupsBinding()
  console.log('')
  console.log('Manual step: add cron trigger on the expense-tracker Pages project:')
  console.log('  Dashboard → Workers & Pages → expense-tracker → Settings → Functions')
  console.log('  Cron triggers → Add → schedule 0 4 * * * (04:00 UTC daily)')
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
