#!/usr/bin/env node
/**
 * Sync config/access.json + OWNER_EMAIL to expense-tracker Pages env vars.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveCloudflareToken } from './cloudflare-auth.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID ?? '800abdfb2ec1687266f66fd349c41d6a'
const TOKEN = resolveCloudflareToken()
const PAGES_PROJECT = 'expense-tracker'

function loadAccessConfig() {
  const fromEnv = process.env.OWNER_EMAIL?.trim().toLowerCase()
  if (fromEnv) return { ownerEmail: fromEnv }

  const filePath = join(ROOT, 'config/access.json')
  if (!existsSync(filePath)) {
    throw new Error('config/access.json missing — copy access.example.json')
  }
  const raw = JSON.parse(readFileSync(filePath, 'utf8'))
  const ownerEmail = String(raw.ownerEmail ?? '').trim().toLowerCase()
  if (!ownerEmail) throw new Error('access.json "ownerEmail" is required')
  return { ownerEmail }
}

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

async function syncPagesEnv(config) {
  const project = await cf(`/accounts/${ACCOUNT_ID}/pages/projects/${PAGES_PROJECT}`)
  const configs = project.deployment_configs ?? {}
  const patch = { deployment_configs: {} }
  const vars = {
    OWNER_EMAIL: { type: 'plain_text', value: config.ownerEmail },
  }

  for (const env of ['production', 'preview']) {
    const base = configs[env] ?? {}
    patch.deployment_configs[env] = {
      ...base,
      env_vars: { ...(base.env_vars ?? {}), ...vars },
    }
  }

  await cf(`/accounts/${ACCOUNT_ID}/pages/projects/${PAGES_PROJECT}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
  console.log(`Pages ${PAGES_PROJECT} access env → owner ${config.ownerEmail}`)
}

async function main() {
  if (!TOKEN) throw new Error('No Cloudflare token')
  await syncPagesEnv(loadAccessConfig())
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
