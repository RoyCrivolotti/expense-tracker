#!/usr/bin/env node
/**
 * Add the stable Pages preview hostname to roy-admin Cloudflare Access.
 * Default: dev.expense-tracker-3hq.pages.dev (branch dev deploy).
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveCloudflareToken } from './cloudflare-auth.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID ?? '800abdfb2ec1687266f66fd349c41d6a'
const TOKEN = resolveCloudflareToken()
const ACCESS_APP_NAME = 'roy-admin'
const DEFAULT_HOST = 'dev.expense-tracker-3hq.pages.dev'

function previewHostname() {
  if (process.env.DEV_PREVIEW_HOSTNAME?.trim()) return process.env.DEV_PREVIEW_HOSTNAME.trim()
  const filePath = join(ROOT, 'config/dev.json')
  if (existsSync(filePath)) {
    const raw = JSON.parse(readFileSync(filePath, 'utf8'))
    if (raw.previewHostname?.trim()) return raw.previewHostname.trim()
  }
  return DEFAULT_HOST
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
  if (!TOKEN) throw new Error('CLOUDFLARE_API_TOKEN required')
  const host = previewHostname()
  const apps = await cf(`/accounts/${ACCOUNT_ID}/access/apps?per_page=100`)
  const app = apps.find((a) => a.name === ACCESS_APP_NAME)
  if (!app) throw new Error(`Access app "${ACCESS_APP_NAME}" not found`)

  const domains = new Set(app.domains ?? [])
  if (domains.has(host)) {
    console.log(`Access app already includes ${host}`)
    return
  }
  domains.add(host)

  await cf(`/accounts/${ACCOUNT_ID}/access/apps/${app.id}`, {
    method: 'PUT',
    body: JSON.stringify({
      ...app,
      domains: [...domains],
    }),
  })
  console.log(`Added ${host} to ${ACCESS_APP_NAME} Access app`)
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
