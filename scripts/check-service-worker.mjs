#!/usr/bin/env node
/**
 * Fails the build when the generated service worker would not start the app without a network: see
 * `serviceWorkerGuard.mjs`. Run after `npm run build`.
 */
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { problemsOfWorker } from './serviceWorkerGuard.mjs'

const dist = process.argv[2] ?? join(fileURLToPath(new URL('..', import.meta.url)), 'dist')
const problems = await problemsOfWorker(dist)
if (problems.length > 0) {
  console.error(`service worker check failed:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`)
  process.exit(1)
}
console.log('service worker check OK (shell precached, evaluates cleanly, network first, shell when the network fails)')
