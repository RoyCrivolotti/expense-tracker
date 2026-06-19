#!/usr/bin/env node
/**
 * Switch roy-admin Access Allow policy to Google sign-in (authentication only).
 * Requires CLOUDFLARE_API_TOKEN with Zero Trust / Access edit scope.
 *
 * After this runs, the app allowlist is enforced in D1 — not in Access email rules.
 */
import { resolveCloudflareToken } from './cloudflare-auth.mjs'

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID ?? '800abdfb2ec1687266f66fd349c41d6a'
const TOKEN = resolveCloudflareToken()
const ACCESS_APP_NAME = 'roy-admin'

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

function googleIdpRule(idps) {
  const google = idps.find((idp) => idp.type === 'google')
  if (!google) throw new Error('Google identity provider not found on this account')
  return { identity: { id: google.id } }
}

function policyBody(policy, include) {
  return {
    decision: policy.decision,
    name: policy.name,
    include,
    exclude: policy.exclude ?? [],
    require: policy.require ?? [],
    precedence: policy.precedence,
  }
}

async function putPolicy(appId, policy, include) {
  const body = policyBody(policy, include)
  const appPath = `/accounts/${ACCOUNT_ID}/access/apps/${appId}/policies/${policy.id}`
  const accountPath = `/accounts/${ACCOUNT_ID}/access/policies/${policy.id}`
  try {
    await cf(appPath, { method: 'PUT', body: JSON.stringify(body) })
  } catch (err) {
    if (!String(err.message).includes('reusable')) throw err
    await cf(accountPath, { method: 'PUT', body: JSON.stringify(body) })
  }
}

async function main() {
  if (!TOKEN) throw new Error('CLOUDFLARE_API_TOKEN required (OAuth lacks Access API scope)')

  const idps = await cf(`/accounts/${ACCOUNT_ID}/access/identity_providers?per_page=100`)
  const googleRule = googleIdpRule(idps)

  const apps = await cf(`/accounts/${ACCOUNT_ID}/access/apps?per_page=100`)
  const app = apps.find((a) => a.name === ACCESS_APP_NAME)
  if (!app) throw new Error(`Access app "${ACCESS_APP_NAME}" not found`)

  const policies = await cf(`/accounts/${ACCOUNT_ID}/access/apps/${app.id}/policies?per_page=100`)
  const allowPolicies = policies.filter((p) => p.decision === 'allow')
  if (allowPolicies.length === 0) throw new Error('No Allow policy on Access app')

  for (const policy of allowPolicies) {
    await putPolicy(app.id, policy, [googleRule])
    console.log(`Access policy "${policy.name}" → Google sign-in only`)
  }
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
