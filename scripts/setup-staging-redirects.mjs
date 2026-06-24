#!/usr/bin/env node
/**
 * Sync account-level Bulk Redirects for legacy staging pages.dev URLs.
 * Requires CLOUDFLARE_API_TOKEN with Account Filter Lists + Bulk URL Redirects edit.
 */
import { ACCOUNT_ID, cf, requireToken } from './access-api.mjs'
import { loadStagingAccessConfig } from './staging-access-config.mjs'

const LIST_NAME = 'roy-staging-legacy'
const RULE_REF = 'roy_staging_legacy_redirects'
const REDIRECT_PHASE = 'http_request_redirect'

function redirectItems(config) {
  return config.legacyRedirects.map(({ hostname, target }) => ({
    redirect: {
      source_url: `https://${hostname}/`,
      target_url: target,
      status_code: 301,
      preserve_path_suffix: true,
      subpath_matching: true,
    },
  }))
}

function printManualSteps(config, err) {
  console.error(`
Could not update Bulk Redirects via API (${err?.message ?? 'auth error'}).

Create manually in Cloudflare dashboard → Bulk Redirects:

  1. List "${LIST_NAME}" (kind: redirect)
  2. Add items:
${config.legacyRedirects
  .map(({ hostname, target }) => `     • https://${hostname}/ → ${target} (301, preserve path)`)
  .join('\n')}
  3. Bulk Redirect rule: http.request.full_uri in $${LIST_NAME}

Token needs Account Filter Lists Edit + Bulk URL Redirects Edit.
`)
}

async function findRedirectList(token) {
  const lists = await cf(token, `/accounts/${ACCOUNT_ID}/rules/lists`)
  return lists.find((list) => list.name === LIST_NAME && list.kind === 'redirect') ?? null
}

async function ensureRedirectList(token) {
  const existing = await findRedirectList(token)
  if (existing) return existing
  const created = await cf(token, `/accounts/${ACCOUNT_ID}/rules/lists`, {
    method: 'POST',
    body: JSON.stringify({
      name: LIST_NAME,
      description: 'Legacy staging pages.dev → stg-*.crivolotti.com',
      kind: 'redirect',
    }),
  })
  console.log(`Created redirect list "${LIST_NAME}"`)
  return created
}

async function waitForBulkOp(token, operationId) {
  for (let i = 0; i < 30; i += 1) {
    const op = await cf(
      token,
      `/accounts/${ACCOUNT_ID}/rules/lists/bulk_operations/${operationId}`,
    )
    if (op.status === 'completed') return
    if (op.status === 'failed') throw new Error(`Bulk list operation failed: ${operationId}`)
    await new Promise((r) => setTimeout(r, 1000))
  }
  throw new Error(`Bulk list operation timed out: ${operationId}`)
}

async function listExistingSources(token, listId) {
  const items = await cf(
    token,
    `/accounts/${ACCOUNT_ID}/rules/lists/${listId}/items?per_page=100`,
  )
  const rows = Array.isArray(items) ? items : []
  return new Set(rows.map((item) => item.redirect?.source_url).filter(Boolean))
}

async function syncListItems(token, listId, config) {
  const desired = redirectItems(config)
  const existing = await listExistingSources(token, listId)
  const missing = desired.filter((item) => !existing.has(item.redirect.source_url))
  if (missing.length === 0) {
    console.log('Redirect list items already up to date.')
    return
  }
  const result = await cf(token, `/accounts/${ACCOUNT_ID}/rules/lists/${listId}/items`, {
    method: 'POST',
    body: JSON.stringify(missing),
  })
  if (result?.operation_id) await waitForBulkOp(token, result.operation_id)
  console.log(`Added ${missing.length} redirect(s) to "${LIST_NAME}".`)
}

function bulkRedirectRule() {
  return {
    ref: RULE_REF,
    expression: `http.request.full_uri in $${LIST_NAME}`,
    description: 'Route legacy staging pages.dev URLs to stg custom domains.',
    action: 'redirect',
    enabled: true,
    action_parameters: {
      from_list: { name: LIST_NAME, key: 'http.request.full_uri' },
    },
  }
}

async function getRedirectEntrypoint(token) {
  try {
    return await cf(
      token,
      `/accounts/${ACCOUNT_ID}/rulesets/phases/${REDIRECT_PHASE}/entrypoint`,
    )
  } catch {
    return null
  }
}

async function ensureBulkRedirectRule(token) {
  const rule = bulkRedirectRule()
  const entrypoint = await getRedirectEntrypoint(token)

  if (!entrypoint) {
    await cf(token, `/accounts/${ACCOUNT_ID}/rulesets`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'Staging legacy redirects',
        kind: 'root',
        phase: REDIRECT_PHASE,
        rules: [rule],
      }),
    })
    console.log('Created http_request_redirect entrypoint with staging legacy rule.')
    return
  }

  const hasRule = (entrypoint.rules ?? []).some(
    (r) => r.ref === RULE_REF || r.action_parameters?.from_list?.name === LIST_NAME,
  )
  if (hasRule) {
    console.log('Bulk Redirect rule already references list.')
    return
  }

  await cf(token, `/accounts/${ACCOUNT_ID}/rulesets/${entrypoint.id}`, {
    method: 'PUT',
    body: JSON.stringify({
      name: entrypoint.name,
      kind: entrypoint.kind,
      phase: entrypoint.phase,
      rules: [...(entrypoint.rules ?? []), rule],
    }),
  })
  console.log('Added staging legacy rule to existing redirect entrypoint.')
}

async function main() {
  const config = loadStagingAccessConfig()
  if (!config.legacyRedirects?.length) {
    throw new Error('config/staging-access.json: legacyRedirects is empty')
  }
  const token = requireToken()

  try {
    const list = await ensureRedirectList(token)
    await syncListItems(token, list.id, config)
    await ensureBulkRedirectRule(token)
    console.log('Staging legacy redirects synced.')
  } catch (err) {
    printManualSteps(config, err)
    throw err
  }
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
