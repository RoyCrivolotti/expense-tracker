#!/usr/bin/env node
/**
 * @deprecated Use setup-access-apps.mjs (targets roy-admin-staging from staging-access.json).
 */
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const script = join(dirname(fileURLToPath(import.meta.url)), 'setup-access-apps.mjs')
console.warn('setup-access-preview is deprecated — running setup-access-apps.mjs')
const result = spawnSync(process.execPath, [script], { stdio: 'inherit' })
process.exit(result.status ?? 1)
