#!/usr/bin/env node
/**
 * Sync config/backup-alerts.json to expense-tracker Pages env vars
 * (BACKUP_ALERT_TO, BACKUP_ALERT_FROM, BACKUP_ALERT_FROM_NAME).
 */
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { resolveCloudflareToken } from './cloudflare-auth.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID ?? '800abdfb2ec1687266f66fd349c41d6a'
const TOKEN = resolveCloudflareToken()
const PAGES_PROJECT = 'expense-tracker'

function loadAlertConfig() {
  const filePath = join(ROOT, 'config/backup-alerts.json')
  if (!existsSync(filePath)) {
    throw new Error(
      'config/backup-alerts.json missing — copy backup-alerts.example.json and set your addresses',
    )
  }
  const raw = JSON.parse(readFileSync(filePath, 'utf8'))
  const to = Array.isArray(raw.to) ? raw.to.map((e) => String(e).trim().toLowerCase()) : []
  if (to.length === 0) throw new Error('backup-alerts.json "to" must be a non-empty array')
  const fromAddress = String(raw.fromAddress ?? '').trim()
  if (!fromAddress) throw new Error('backup-alerts.json "fromAddress" is required')
  const fromName = String(raw.fromName ?? 'Expense tracker backups').trim()
  return { to, fromAddress, fromName }
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

async function syncPagesEnv({ to, fromAddress, fromName }) {
  const project = await cf(`/accounts/${ACCOUNT_ID}/pages/projects/${PAGES_PROJECT}`)
  const configs = project.deployment_configs ?? {}
  const patch = { deployment_configs: {} }
  for (const env of ['production', 'preview']) {
    const base = configs[env] ?? {}
    patch.deployment_configs[env] = {
      ...base,
      env_vars: {
        ...(base.env_vars ?? {}),
        BACKUP_ALERT_TO: { type: 'plain_text', value: to.join(',') },
        BACKUP_ALERT_FROM: { type: 'plain_text', value: fromAddress },
        BACKUP_ALERT_FROM_NAME: { type: 'plain_text', value: fromName },
      },
    }
  }
  await cf(`/accounts/${ACCOUNT_ID}/pages/projects/${PAGES_PROJECT}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
  console.log(`Pages ${PAGES_PROJECT} backup alert env → ${to.join(', ')} from ${fromAddress}`)
}

async function main() {
  if (!TOKEN) throw new Error('No Cloudflare token — set CLOUDFLARE_API_TOKEN or run wrangler login')
  const config = loadAlertConfig()
  await syncPagesEnv(config)
  console.log('')
  console.log('Also required (one-time): enable Email Sending on your domain and bind EMAIL on this Pages project.')
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
