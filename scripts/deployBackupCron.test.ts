// @vitest-environment node
// scripts/deploy-backup-cron.mjs, run as CI runs it, with a stand-in for npx on the PATH. Nothing is deployed.
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const SCRIPT = join(import.meta.dirname, 'deploy-backup-cron.mjs')
const SUBDOMAIN = 'made-up-subdomain'
const DEPLOYED = [
  'Uploaded expense-backup-cron (2.95 sec)',
  `  https://expense-backup-cron.${SUBDOMAIN}.workers.dev`,
  '  schedule: 0 4 * * *',
].join('\n')
const WARNING = `Could not reach ${SUBDOMAIN.toUpperCase()}.WORKERS.DEV, retrying`
/** What wrangler 4 prints when Cloudflare refuses the token: all of `whoami` on stdout, the error on stderr. */
const WHOAMI = [
  'Getting User settings...',
  'You are logged in with an User API Token, associated with the email someone@example.com.',
  "│ Someone's own account │ an-id │",
].join('\n')
const REFUSAL = 'Authentication error [code: 10000]'

let bin: string
beforeEach(() => {
  bin = mkdtempSync(join(tmpdir(), 'fake-npx-'))
  writeFileSync(
    join(bin, 'npx'),
    '#!/bin/sh\nprintf \'%s\\n\' "$FAKE_STDOUT"\nif [ -n "$FAKE_PADDING" ]; then head -c "$FAKE_PADDING" /dev/zero; fi\nprintf \'%s\\n\' "$FAKE_STDERR" >&2\nexit "$FAKE_STATUS"\n',
  )
  chmodSync(join(bin, 'npx'), 0o755)
})
afterEach(() => rmSync(bin, { recursive: true, force: true }))

function deploy(
  status: number,
  stdout: string,
  stderr: string,
  inCi = true,
  extra: Record<string, string> = {},
) {
  const result = spawnSync(process.execPath, [SCRIPT], {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    env: {
      ...process.env,
      PATH: `${bin}${delimiter}${process.env.PATH}`,
      GITHUB_ACTIONS: inCi ? 'true' : '',
      FAKE_STATUS: String(status),
      FAKE_STDOUT: stdout,
      FAKE_STDERR: stderr,
      ...extra,
    },
  })
  return { code: result.status, output: `${result.stdout}${result.stderr}` }
}

describe('deploy-backup-cron.mjs', () => {
  it.each([
    ['a deploy', 0, true, 0],
    ['a failed deploy', 1, true, 1],
    ['a failed deploy by hand', 1, false, 1],
  ])('hides the address and keeps every other line after %s', (_what, status, inCi, expected) => {
    const { code, output } = deploy(status, DEPLOYED, WARNING, inCi)

    expect(code).toBe(expected)
    expect(output.toLowerCase()).not.toContain(SUBDOMAIN)
    expect(output).toContain('Uploaded expense-backup-cron (2.95 sec)')
    expect(output).toContain('  https://<address hidden>\n  schedule: 0 4 * * *')
    expect(output).toContain('Could not reach <address hidden>, retrying')
  })

  it.each([
    ['skips in CI', true, 0],
    ['fails by hand', false, 1],
  ])("prints the error and leaves out whoami's account details when it %s", (_what, inCi, expected) => {
    const { code, output } = deploy(1, WHOAMI, REFUSAL, inCi)

    expect(code).toBe(expected)
    expect(output).toContain(`(wrangler's account details are left out)\n${REFUSAL}\n`)
    expect(output.includes('skipped in CI')).toBe(inCi)
    expect(output).not.toMatch(/someone|an-id/i)
  })

  it('lets wrangler print more than a megabyte', () => {
    const { code, output } = deploy(0, DEPLOYED, '', true, { FAKE_PADDING: String(2 * 1024 * 1024) })

    // Past the limit wrangler is killed, and the script fails.
    expect(code).toBe(0)
    expect(output).toContain('Uploaded expense-backup-cron')
  })

  it('says why when wrangler cannot be started', () => {
    rmSync(join(bin, 'npx'))
    symlinkSync(process.execPath, join(bin, 'node'))

    const { code, output } = deploy(0, '', '', true, { PATH: bin })

    expect(code).toBe(1)
    expect(output).toContain('spawnSync npx ENOENT')
  })
})
