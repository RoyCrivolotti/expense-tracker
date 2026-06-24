#!/usr/bin/env node
/**
 * Create/sync roy-admin and roy-admin-staging Cloudflare Access apps from
 * config/staging-access.json. Requires CLOUDFLARE_API_TOKEN with Access Edit.
 */
import {
  ACCOUNT_ID,
  cf,
  ensureGoogleAllowPolicies,
  findAccessApp,
  requireToken,
  syncAccessHostnames,
} from './access-api.mjs'
import { loadStagingAccessConfig } from './staging-access-config.mjs'

function printManualSteps(config, err) {
  console.error(`
Could not update Access via API (${err?.message ?? 'auth error'}).

Create or edit apps manually in Zero Trust → Access → Applications:

  ${config.prodApp} (prod only):
${config.prodHostnames.map((h) => `    • ${h}`).join('\n')}

  ${config.stagingApp} (staging):
${config.stagingHostnames.map((h) => `    • ${h}`).join('\n')}

Use the same Google Allow policy on both apps. Token needs Zero Trust → Access → Edit.
`)
}

async function ensureAccessApp(token, name, hostnames) {
  let app = await findAccessApp(token, name)
  if (!app) {
    const primary = hostnames[0]
    if (!primary) throw new Error(`${name}: no hostnames configured`)
    app = await cf(token, `/accounts/${ACCOUNT_ID}/access/apps`, {
      method: 'POST',
      body: JSON.stringify({
        name,
        domain: primary,
        type: 'self_hosted',
        session_duration: '24h',
        auto_redirect_to_identity: false,
      }),
    })
    console.log(`Created Access app "${name}"`)
    await ensureGoogleAllowPolicies(token, app.id)
    app = await findAccessApp(token, name)
    if (!app) throw new Error(`Failed to reload Access app "${name}"`)
  }
  return syncAccessHostnames(token, app, hostnames)
}

async function main() {
  const config = loadStagingAccessConfig()
  const token = requireToken()

  try {
    await ensureAccessApp(token, config.stagingApp, config.stagingHostnames)
    await ensureAccessApp(token, config.prodApp, config.prodHostnames)
    console.log('Access apps synced.')
  } catch (err) {
    printManualSteps(config, err)
    throw err
  }
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
