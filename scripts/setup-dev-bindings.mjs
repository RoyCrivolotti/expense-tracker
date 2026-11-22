#!/usr/bin/env node
/**
 * Bind roy-expenses-stg Pages production to roy-expenses-dev D1.
 * Legacy preview bindings on expense-tracker are unchanged.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ACCOUNT_ID, cf, requireToken } from './access-api.mjs'
import { findPagesProject } from './pages-api.mjs'
import { loadStagingAccessConfig } from './staging-access-config.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

function loadDevD1Id() {
  const fromEnv = process.env.DEV_D1_DATABASE_ID?.trim()
  if (fromEnv) return fromEnv
  const filePath = join(ROOT, 'config/dev.json')
  if (!existsSync(filePath)) {
    throw new Error('config/dev.json missing — copy dev.example.json after creating roy-expenses-dev')
  }
  const raw = JSON.parse(readFileSync(filePath, 'utf8'))
  const id = String(raw.d1DatabaseId ?? '').trim()
  if (!id || id.includes('REPLACE')) throw new Error('config/dev.json "d1DatabaseId" must be set')
  return id
}

function loadOwnerEmail() {
  const fromEnv = process.env.OWNER_EMAIL?.trim().toLowerCase()
  if (fromEnv) return fromEnv
  const filePath = join(ROOT, 'config/access.json')
  if (!existsSync(filePath)) throw new Error('config/access.json missing')
  const raw = JSON.parse(readFileSync(filePath, 'utf8'))
  const email = String(raw.ownerEmail ?? '')
    .trim()
    .toLowerCase()
  if (!email) throw new Error('access.json ownerEmail required')
  return email
}

async function main() {
  const token = requireToken()
  const config = loadStagingAccessConfig()
  const projectName = config.pagesProjects.expenses.project
  const project = await findPagesProject(token, projectName)
  if (!project) {
    throw new Error(`Pages project ${projectName} missing — run npm run setup:staging-project first`)
  }

  const d1DatabaseId = loadDevD1Id()
  const ownerEmail = loadOwnerEmail()
  const configs = project.deployment_configs ?? {}
  const production = { ...(configs.production ?? {}) }
  if (production.r2_buckets?.BACKUPS) {
    production.r2_buckets = { ...production.r2_buckets, BACKUPS: null }
  }
  production.d1_databases = { DB: { id: d1DatabaseId } }
  production.env_vars = {
    ...(production.env_vars ?? {}),
    OWNER_EMAIL: { type: 'plain_text', value: ownerEmail },
  }

  await cf(token, `/accounts/${ACCOUNT_ID}/pages/projects/${projectName}`, {
    method: 'PATCH',
    body: JSON.stringify({
      deployment_configs: {
        production,
        preview: configs.preview ?? {},
      },
    }),
  })
  console.log(`Pages ${projectName} production → ${d1DatabaseId} (roy-expenses-dev)`)
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
