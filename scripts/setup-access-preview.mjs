#!/usr/bin/env node
/**
 * Add staging hostnames to the roy-admin Cloudflare Access application.
 * Requires CLOUDFLARE_API_TOKEN with Zero Trust → Access → Edit (wrangler OAuth lacks this).
 *
 * Default hostnames: dev expense preview + staging admin hub.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveCloudflareToken } from './cloudflare-auth.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID ?? '800abdfb2ec1687266f66fd349c41d6a'
const TOKEN = resolveCloudflareToken()
const ACCESS_APP_NAME = 'roy-admin'

const DEFAULT_HOSTS = [
  'dev.expense-tracker-3hq.pages.dev',
  'roy-private.pages.dev',
]

function stagingHostnames() {
  const fromEnv = process.env.STAGING_ACCESS_HOSTS?.trim()
  if (fromEnv) return fromEnv.split(',').map((h) => h.trim()).filter(Boolean)

  const filePath = join(ROOT, 'config/dev.json')
  if (existsSync(filePath)) {
    const raw = JSON.parse(readFileSync(filePath, 'utf8'))
    const fromFile = raw.stagingAccessHostnames
    if (Array.isArray(fromFile) && fromFile.length > 0) {
      return fromFile.map((h) => String(h).trim()).filter(Boolean)
    }
    if (raw.previewHostname?.trim()) return [raw.previewHostname.trim()]
  }
  return DEFAULT_HOSTS
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

function printManualSteps(hosts) {
  console.error(`
Could not update Access via API (token needs Zero Trust → Access → Edit).

Add these hostnames manually:
  Zero Trust → Access → Applications → roy-admin → Edit → Public hostname

${hosts.map((h) => `  • ${h}`).join('\n')}

Then sign in with Google at each URL once. Without this step the app shows
"Couldn't check access: Not authenticated" because Access never injects the email header.
`)
}

async function main() {
  if (!TOKEN) throw new Error('CLOUDFLARE_API_TOKEN required')
  const hosts = stagingHostnames()
  let apps
  try {
    apps = await cf(`/accounts/${ACCOUNT_ID}/access/apps?per_page=100`)
  } catch (err) {
    printManualSteps(hosts)
    throw err
  }

  const app = apps.find((a) => a.name === ACCESS_APP_NAME)
  if (!app) throw new Error(`Access app "${ACCESS_APP_NAME}" not found`)

  const domains = new Set(app.domains ?? [])
  const added = []
  for (const host of hosts) {
    if (!domains.has(host)) {
      domains.add(host)
      added.push(host)
    }
  }

  if (added.length === 0) {
    console.log(`Access app already includes: ${hosts.join(', ')}`)
    return
  }

  try {
    await cf(`/accounts/${ACCOUNT_ID}/access/apps/${app.id}`, {
      method: 'PUT',
      body: JSON.stringify({ ...app, domains: [...domains] }),
    })
  } catch (err) {
    printManualSteps(added)
    throw err
  }
  console.log(`Added to ${ACCESS_APP_NAME} Access: ${added.join(', ')}`)
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
