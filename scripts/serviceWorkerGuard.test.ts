import { execFile } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { generateSW, type GenerateSWOptions } from 'workbox-build'
import { afterAll, describe, expect, it } from 'vitest'
import { PREVIOUS_OPTIONS } from './offlineStart/previousWorker.mjs'
import { isShellNavigation } from './pwaNavigation'
import { SHELL_URL, workboxOptions } from './pwaWorkbox'

// `check-service-worker.mjs` runs the built worker in a VM, and a worker that fails while it loads leaves an unhandled
// rejection, which vitest would report as a failure of the run. So each worker is checked by the script, as a process.
const CHECK = join(import.meta.dirname, 'check-service-worker.mjs')
const run = promisify(execFile)
const SLOW = 60_000

const made: string[] = []
afterAll(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true })
})

/** A small site and the worker `options` generate for it. */
async function site(options: Partial<GenerateSWOptions>): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), 'sw-guard-'))
  made.push(dir)
  mkdirSync(join(dir, 'assets'))
  writeFileSync(join(dir, 'index.html'), '<!doctype html><script type="module" src="/assets/app.js"></script>')
  writeFileSync(join(dir, 'assets', 'app.js'), 'console.log(1)')
  writeFileSync(join(dir, 'manifest.webmanifest'), '{}')
  await generateSW({
    skipWaiting: true,
    clientsClaim: true,
    cleanupOutdatedCaches: true,
    ...(options as GenerateSWOptions),
    globDirectory: dir,
    swDest: join(dir, 'sw.js'),
  })
  return dir
}

async function check(dir: string): Promise<{ failed: boolean; report: string }> {
  try {
    await run(process.execPath, [CHECK, dir])
    return { failed: false, report: '' }
  } catch (error) {
    return { failed: true, report: String((error as { stderr?: string }).stderr) }
  }
}

describe('the check of the built service worker', () => {
  it('passes the worker the app is built with', async () => {
    expect(await check(await site(workboxOptions))).toEqual({ failed: false, report: '' })
  }, SLOW)

  it.each([
    [
      'the shell answers `/` before the network does (the default directory index)',
      { directoryIndex: undefined },
      'a navigation to / while the network answers: expected "NETWORK", got "SHELL"',
    ],
    [
      'every navigation is answered with the shell (the default fallback route)',
      { navigateFallback: SHELL_URL },
      'a navigation to a deep link while the network answers: expected "NETWORK", got "SHELL"',
    ],
    [
      'nothing answers a navigation when the network fails',
      { runtimeCaching: [{ urlPattern: isShellNavigation, handler: 'NetworkOnly' as const }] },
      'a navigation to / while the network fails: expected "SHELL"',
    ],
    [
      'the shell is not precached',
      { globPatterns: ['**/*.{js,css,svg,png,ico,webmanifest,woff2}'] },
      'the shell (index.html) is not precached with a revision',
    ],
    [
      'an API URL opened in a tab is answered with the shell',
      {
        runtimeCaching: [
          { urlPattern: ({ request }: { request: { mode: string } }) => request.mode === 'navigate', handler: 'NetworkOnly' as const, options: { precacheFallback: { fallbackURL: SHELL_URL } } },
        ],
      },
      'an API URL opened in a tab while the network fails: expected no answer from the worker, got "SHELL"',
    ],
    [
      'the app’s own requests for its data are answered by the worker',
      {
        runtimeCaching: [
          { urlPattern: ({ url }: { url: { pathname: string } }) => url.pathname.startsWith('/api/'), handler: 'NetworkOnly' as const },
        ],
      },
      'a request of the app for its data while the network fails: expected no answer from the worker',
    ],
  ])('fails a worker where %s', async (_what, change, expected) => {
    const options = { ...workboxOptions, ...change } as Partial<GenerateSWOptions>
    if ('directoryIndex' in change) delete options.directoryIndex
    const { failed, report } = await check(await site(options))
    expect(failed).toBe(true)
    expect(report).toContain(expected)
  }, SLOW)

  it('fails the worker the app shipped before, which throws while it is evaluated and answers no navigation', async () => {
    const { failed, report } = await check(await site(PREVIOUS_OPTIONS as Partial<GenerateSWOptions>))
    expect(failed).toBe(true)
    expect(report).toContain('evaluating the worker raised: non-precached-url')
    expect(report).toContain('a navigation to / while the network fails: expected "SHELL", got no answer from the worker')
  }, SLOW)

  it('says to build first when there is no worker', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sw-guard-'))
    made.push(dir)
    const { failed, report } = await check(dir)
    expect(failed).toBe(true)
    expect(report).toContain('does not exist; run the build first')
  }, SLOW)
})
