#!/usr/bin/env node
/**
 * Bind expense-tracker Pages preview deployments to roy-expenses-dev D1.
 * Production bindings are unchanged. Preview has no R2 BACKUPS binding.
 *
 * Prereq: wrangler d1 create roy-expenses-dev — copy id into config/dev.json
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveCloudflareToken } from './cloudflare-auth.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID ?? '800abdfb2ec1687266f66fd349c41d6a'
const TOKEN = resolveCloudflareToken()
const PAGES_PROJECT = 'expense-tracker'

function loadDevConfig() {
  const fromEnv = process.env.DEV_D1_DATABASE_ID?.trim()
  if (fromEnv) return { d1DatabaseId: fromEnv }

  const filePath = join(ROOT, 'config/dev.json')
  if (!existsSync(filePath)) {
    throw new Error('config/dev.json missing — copy dev.example.json after creating roy-expenses-dev')
  }
  const raw = JSON.parse(readFileSync(filePath, 'utf8'))
  const d1DatabaseId = String(raw.d1DatabaseId ?? '').trim()
  if (!d1DatabaseId || d1DatabaseId.includes('REPLACE')) {
    throw new Error('config/dev.json "d1DatabaseId" must be set')
  }
  return { d1DatabaseId }
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

async function main() {
  if (!TOKEN) throw new Error('No Cloudflare token')
  const { d1DatabaseId } = loadDevConfig()
  const project = await cf(`/accounts/${ACCOUNT_ID}/pages/projects/${PAGES_PROJECT}`)
  const configs = project.deployment_configs ?? {}
  const previewBase = { ...(configs.preview ?? {}) }
  if (previewBase.r2_buckets?.BACKUPS) {
    previewBase.r2_buckets = { ...previewBase.r2_buckets, BACKUPS: null }
  }
  previewBase.d1_databases = { DB: { id: d1DatabaseId } }

  await cf(`/accounts/${ACCOUNT_ID}/pages/projects/${PAGES_PROJECT}`, {
    method: 'PATCH',
    body: JSON.stringify({
      deployment_configs: {
        production: configs.production ?? {},
        preview: previewBase,
      },
    }),
  })
  console.log(`Pages ${PAGES_PROJECT} preview DB → ${d1DatabaseId} (roy-expenses-dev)`)
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
