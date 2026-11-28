/**
 * `npm run lint` with ESLint's cache, for `npm run verify` on a laptop: a second run with nothing
 * changed takes a couple of seconds instead of most of a minute.
 *
 * The cache re-checks a file only when that file changes, and some rules read types from other
 * files, so a change to a shared type can leave a stale pass for a file that uses it. CI never
 * uses the cache: under CI or GitHub Actions this runs the same command as `npm run lint`, and
 * ci.yml runs `npm run lint` itself. Clear it (`rm -rf node_modules/.cache/eslint`) after
 * changing a type or export other files use, or after switching branches; see docs/TESTING.md.
 */
import { spawnSync } from 'node:child_process'

export const CACHE_LOCATION = 'node_modules/.cache/eslint/'

/**
 * @param {NodeJS.ProcessEnv} env
 * @returns {string[]}
 */
export function lintArgs(env) {
  const args = ['.', '--max-warnings', '0']
  if (env.CI || env.GITHUB_ACTIONS) return args
  // `content`, not the default `metadata`: a checkout or rebase rewrites files' times without
  // changing them, which would make every file look changed.
  return [...args, '--cache', '--cache-strategy', 'content', '--cache-location', CACHE_LOCATION]
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = spawnSync('eslint', lintArgs(process.env), { stdio: 'inherit' })
  process.exit(result.status ?? 1)
}
