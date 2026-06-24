#!/usr/bin/env node
/**
 * Register staging custom domains on Pages projects and print DreamHost CNAME rows.
 * Requires a Cloudflare API token with Pages Edit.
 */
import { requireToken } from './access-api.mjs'
import { ensurePagesDomain } from './pages-api.mjs'
import { loadStagingAccessConfig } from './staging-access-config.mjs'

function dreamHostLabel(domain) {
  const parts = domain.split('.')
  if (parts.length <= 2) return '@'
  return parts.slice(0, parts.length - 2).join('.')
}

async function main() {
  const config = loadStagingAccessConfig()
  const token = requireToken()
  const rows = []

  for (const entry of Object.values(config.pagesProjects)) {
    await ensurePagesDomain(token, entry.project, entry.customDomain)
    rows.push({
      name: dreamHostLabel(entry.customDomain),
      domain: entry.customDomain,
      target: `${entry.project}.pages.dev`,
    })
  }

  console.log('\nDreamHost DNS — add these CNAME records:\n')
  console.log('| Name | Type | Target |')
  console.log('| --- | --- | --- |')
  for (const row of rows) {
    console.log(`| \`${row.name}\` | CNAME | \`${row.target}\` |`)
  }
  console.log('\nRegister domains in Pages first (done above), then add CNAMEs. Allow a few minutes for SSL.')
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
