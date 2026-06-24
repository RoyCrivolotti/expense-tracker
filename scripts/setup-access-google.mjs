#!/usr/bin/env node
/**
 * Switch an Access app's Allow policy to Google sign-in (authentication only).
 * Requires CLOUDFLARE_API_TOKEN with Zero Trust / Access edit scope.
 *
 * Usage: npm run setup:access-google [-- --app roy-admin-staging]
 */
import { ensureGoogleAllowPolicies, findAccessApp, requireToken } from './access-api.mjs'

function appNameFromArgs() {
  const idx = process.argv.indexOf('--app')
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1]
  return process.env.ACCESS_APP_NAME?.trim() || 'roy-admin'
}

async function main() {
  const token = requireToken()
  const name = appNameFromArgs()
  const app = await findAccessApp(token, name)
  if (!app) throw new Error(`Access app "${name}" not found`)
  await ensureGoogleAllowPolicies(token, app.id)
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
