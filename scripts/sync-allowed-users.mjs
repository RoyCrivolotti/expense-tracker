#!/usr/bin/env node
/**
 * Sync config/allowed-emails.json to:
 * - expense-tracker Pages ALLOWED_EMAILS (production + preview)
 * - Cloudflare Access allow policy on the roy-admin application (both hostnames)
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID ?? '800abdfb2ec1687266f66fd349c41d6a'
const TOKEN = process.env.CLOUDFLARE_API_TOKEN
const PAGES_PROJECT = 'expense-tracker'
const ACCESS_APP_NAME = 'roy-admin'
const DB_ID = '3dcefc85-e172-4fd0-a623-f2f15120c9d9'

function loadEmails() {
  const raw = JSON.parse(readFileSync(join(ROOT, 'config/allowed-emails.json'), 'utf8'))
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error('allowed-emails.json must be a non-empty array')
  }
  return [...new Set(raw.map((e) => String(e).trim().toLowerCase()))]
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

async function syncPagesEnv(emails) {
  const value = emails.join(',')
  const project = await cf(`/accounts/${ACCOUNT_ID}/pages/projects/${PAGES_PROJECT}`)
  const configs = project.deployment_configs ?? {}
  const patch = { deployment_configs: {} }
  for (const env of ['production', 'preview']) {
    const base = configs[env] ?? {}
    patch.deployment_configs[env] = {
      ...base,
      d1_databases: { DB: { id: DB_ID } },
      env_vars: {
        ...(base.env_vars ?? {}),
        ALLOWED_EMAILS: { type: 'plain_text', value },
      },
    }
  }
  await cf(`/accounts/${ACCOUNT_ID}/pages/projects/${PAGES_PROJECT}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
  console.log(`Pages ${PAGES_PROJECT} ALLOWED_EMAILS → ${value}`)
}

function emailFromRule(rule) {
  return rule.email?.email?.trim().toLowerCase() ?? null
}

function withEmailIncludes(include, emails) {
  const other = (include ?? []).filter((rule) => !emailFromRule(rule))
  const emailRules = emails.map((email) => ({ email: { email } }))
  return [...other, ...emailRules]
}

function policyBody(policy, emails) {
  return {
    decision: policy.decision,
    name: policy.name,
    include: withEmailIncludes(policy.include, emails),
    exclude: policy.exclude ?? [],
    require: policy.require ?? [],
    precedence: policy.precedence,
  }
}

async function putPolicy(appId, policy, emails) {
  const body = policyBody(policy, emails)
  const appPath = `/accounts/${ACCOUNT_ID}/access/apps/${appId}/policies/${policy.id}`
  const accountPath = `/accounts/${ACCOUNT_ID}/access/policies/${policy.id}`
  try {
    await cf(appPath, { method: 'PUT', body: JSON.stringify(body) })
  } catch (err) {
    if (!String(err.message).includes('reusable')) throw err
    await cf(accountPath, { method: 'PUT', body: JSON.stringify(body) })
  }
}

async function syncAccessPolicy(emails) {
  const apps = await cf(`/accounts/${ACCOUNT_ID}/access/apps?per_page=100`)
  const app = apps.find((a) => a.name === ACCESS_APP_NAME)
  if (!app) throw new Error(`Access app "${ACCESS_APP_NAME}" not found`)

  const policies = await cf(`/accounts/${ACCOUNT_ID}/access/apps/${app.id}/policies?per_page=100`)
  const allowPolicies = policies.filter((p) => p.decision === 'allow')
  if (allowPolicies.length === 0) throw new Error('No Allow policy on Access app')

  for (const policy of allowPolicies) {
    await putPolicy(app.id, policy, emails)
    console.log(`Access policy "${policy.name}" → ${emails.join(', ')}`)
  }
}

async function main() {
  if (!TOKEN) throw new Error('CLOUDFLARE_API_TOKEN is required')
  const emails = loadEmails()
  await syncPagesEnv(emails)
  await syncAccessPolicy(emails)
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
