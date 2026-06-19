#!/usr/bin/env node
/** Remove BACKUPS R2 binding when R2 is not yet enabled (unblocks Pages deploy). */
import { resolveCloudflareToken } from './cloudflare-auth.mjs'

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID ?? '800abdfb2ec1687266f66fd349c41d6a'
const TOKEN = resolveCloudflareToken()
const PAGES_PROJECT = 'expense-tracker'
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

async function main() {
  if (!TOKEN) {
    throw new Error('No Cloudflare token — set CLOUDFLARE_API_TOKEN or run wrangler login')
  }
  const project = await cf(`/accounts/${ACCOUNT_ID}/pages/projects/${PAGES_PROJECT}`)
  const configs = project.deployment_configs ?? {}
  const patch = { deployment_configs: {} }
  for (const env of ['production', 'preview']) {
    const base = { ...(configs[env] ?? {}) }
    if (base.r2_buckets?.BACKUPS) {
      base.r2_buckets = { ...base.r2_buckets, BACKUPS: null }
    }
    base.d1_databases = { DB: { id: DB_ID } }
    patch.deployment_configs[env] = base
  }
  await cf(`/accounts/${ACCOUNT_ID}/pages/projects/${PAGES_PROJECT}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
  console.log(`Removed BACKUPS R2 binding from ${PAGES_PROJECT} (production + preview)`)
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
