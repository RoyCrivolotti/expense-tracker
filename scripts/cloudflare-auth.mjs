#!/usr/bin/env node
/**
 * Resolve a Cloudflare API token for local ops scripts.
 * Prefers CLOUDFLARE_API_TOKEN; falls back to wrangler OAuth token on disk.
 */
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const WRANGLER_CONFIGS = [
  join(homedir(), 'Library/Preferences/.wrangler/config/default.toml'),
  join(homedir(), '.config/.wrangler/config/default.toml'),
]

export function resolveCloudflareToken() {
  const fromEnv = process.env.CLOUDFLARE_API_TOKEN?.trim()
  if (fromEnv) return fromEnv

  for (const path of WRANGLER_CONFIGS) {
    if (!existsSync(path)) continue
    const match = /oauth_token\s*=\s*"([^"]+)"/.exec(readFileSync(path, 'utf8'))
    if (match?.[1]) return match[1]
  }
  return null
}
