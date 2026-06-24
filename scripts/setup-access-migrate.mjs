#!/usr/bin/env node
/**
 * Remove legacy staging hostnames from the prod roy-admin Access app.
 * Requires CLOUDFLARE_API_TOKEN with Zero Trust → Access → Edit.
 */
import { ACCOUNT_ID, cf, findAccessApp, requireToken } from './access-api.mjs'
import { loadStagingAccessConfig } from './staging-access-config.mjs'

function printManualSteps(config, remove) {
  console.error(`
Could not update Access via API. Remove these from ${config.prodApp} manually:

${remove.map((h) => `  • ${h}`).join('\n')}
`)
}

async function main() {
  const config = loadStagingAccessConfig()
  const token = requireToken()
  const toRemove = new Set([
    ...(config.legacyStagingHostnames ?? []),
    ...(config.stagingHostnames ?? []),
    ...(config.publicStagingHostnames ?? []),
  ])

  let app
  try {
    app = await findAccessApp(token, config.prodApp)
  } catch (err) {
    printManualSteps(config, [...toRemove])
    throw err
  }
  if (!app) throw new Error(`Access app "${config.prodApp}" not found`)

  const prodSet = new Set(config.prodHostnames)
  const before = app.domains ?? []
  const after = before.filter((d) => prodSet.has(d) || !toRemove.has(d))
  const removed = before.filter((d) => !after.includes(d))

  if (removed.length === 0) {
    console.log(`${config.prodApp}: no legacy staging hostnames to remove`)
    return
  }

  try {
    await cf(token, `/accounts/${ACCOUNT_ID}/access/apps/${app.id}`, {
      method: 'PUT',
      body: JSON.stringify({ ...app, domains: after }),
    })
  } catch (err) {
    printManualSteps(config, removed)
    throw err
  }
  console.log(`${config.prodApp}: removed ${removed.join(', ')}`)
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
