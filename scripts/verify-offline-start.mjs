#!/usr/bin/env node
/**
 * Playwright check that the installed app opens without a network, and that the update from the service worker it
 * shipped with before cannot strand anyone. Chromium and WebKit, against the production build in `dist` (run
 * `npm run build` first), served the way Cloudflare Pages serves it (`offlineStart/site.mjs`).
 *
 * The unit tests and `check-service-worker.mjs` run the worker's code; only a browser installs one, updates one and
 * answers a navigation with it. Manual and in `verify-offline-start.yml`, like the other `verify:*` scripts. Exits 1 and
 * says what was observed if anything fails.
 *
 * ENGINES=chromium,webkit (default), DIST=<build directory> (default `dist`).
 */
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, webkit } from 'playwright'
import { buildPreviousSite } from './offlineStart/previousWorker.mjs'
import { startLogin, startSite } from './offlineStart/site.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = process.env.DIST ?? join(ROOT, 'dist')
const ENGINES = (process.env.ENGINES ?? 'chromium,webkit').split(',')
const LAUNCH = { chromium, webkit }

const failures = []

/** `detail` is only read when the check fails, and says what was observed instead. */
function check(where, what, ok, detail = '') {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${where}: ${what}${ok ? '' : ` (${detail})`}`)
  if (!ok) failures.push(`${where}: ${what} (${detail})`)
}

async function until(condition, ms = 20_000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (await condition()) return true
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  return false
}

/** Waits until the worker is installed, active and controlling the page. */
async function controlled(page) {
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller))
}

/** The paths in the precache. */
const precached = (page) =>
  page.evaluate(async () => {
    const paths = []
    for (const name of (await caches.keys()).filter((key) => key.startsWith('workbox-precache'))) {
      for (const request of await (await caches.open(name)).keys()) paths.push(new URL(request.url).pathname)
    }
    return paths
  })

async function visit(page, origin, path) {
  try {
    const response = await page.goto(`${origin}${path}`, { timeout: 10_000 })
    await page.locator('#root > *').first().waitFor({ timeout: 5_000 }).catch(() => undefined)
    return {
      ok: true,
      status: response?.status(),
      fromWorker: response?.fromServiceWorker(),
      title: await page.title(),
      rendered: await page.locator('#root > *').count(),
    }
  } catch (error) {
    return { ok: false, error: String(error).split('\n')[0] }
  }
}

const opens = (r) => r.ok && r.status === 200 && r.fromWorker === true && r.title === 'Expenses' && r.rendered > 0

/** The device loses its network: the server refuses connections, and where the browser can say so, it is offline. */
async function goOffline(site, context, engine) {
  await site.takeDown()
  if (engine === 'chromium') await context.setOffline(true)
}

async function comeBack(site, context, engine) {
  if (engine === 'chromium') await context.setOffline(false)
  await site.bringUp()
}

async function opensOffline(where, page, origin, paths) {
  const failed = []
  page.on('requestfailed', (request) => failed.push(new URL(request.url()).pathname))
  for (const path of paths) {
    const result = await visit(page, origin, path)
    check(where, `offline, ${path} opens the app from the worker`, opens(result), JSON.stringify(result))
  }
  check(where, 'offline, no script or style of the app failed to load', !failed.some((path) => path.startsWith('/assets/')), failed.join(', '))
}

async function launchNetworkFirst(where, page, site, path) {
  const mark = site.state.requests.length
  await visit(page, site.origin, path)
  const asked = site.state.requests.slice(mark).map((request) => request.path)
  check(where, `online, ${path} reaches the server (the network answers first)`, asked.includes(path.split('?')[0]), asked.join(', '))
}

/** The app is visited once, so that its worker installs, and then there is no network. */
async function firstVisitThenNoNetwork(browser, engine) {
  const where = `${engine}, first visit then no network`
  const site = await startSite({ root: DIST })
  const context = await browser.newContext()
  const page = await context.newPage()
  try {
    await page.goto(`${site.origin}/`)
    await controlled(page)
    check(where, 'the shell is precached', (await precached(page)).includes('/index.html'), (await precached(page)).join(', '))
    await launchNetworkFirst(where, page, site, '/')
    await launchNetworkFirst(where, page, site, '/settings?tab=data')

    await goOffline(site, context, engine)
    await opensOffline(where, page, site.origin, ['/', '/settings', '/goals?range=12m', '/access/admin', '/index.html'])
    for (const path of ['/api/expenses/attachments/7', '/cdn-cgi/access/logout']) {
      const result = await visit(page, site.origin, path)
      check(where, `offline, ${path} is an error and not the shell`, !result.ok, JSON.stringify(result))
    }

    await comeBack(site, context, engine)
    await launchNetworkFirst(where, page, site, '/')
  } finally {
    await context.close()
    await site.close()
  }
}

/** The worker that is deployed now, installed in a page that is then served the new build. */
async function installPrevious(browser, site, dir) {
  site.state.root = await buildPreviousSite(dir)
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto(`${site.origin}/`)
  await controlled(page)
  return { context, page }
}

const updated = async (page) => {
  const paths = await precached(page)
  return paths.includes('/index.html') && !paths.includes('/assets/app-previous.js')
}

/** The registered worker is asked to look for a new script, as the browser does on a navigation. */
const checkForUpdate = (page) => page.evaluate(() => navigator.serviceWorker.getRegistration().then((registration) => registration?.update())).catch(() => undefined)

async function updateFromDeployed(browser, engine, tmp) {
  const where = `${engine}, the update from the deployed worker`
  const site = await startSite({ root: DIST })
  const { context, page } = await installPrevious(browser, site, join(tmp, `previous-${engine}`))
  try {
    check(where, 'the deployed worker precaches no shell', !(await precached(page)).includes('/index.html'), (await precached(page)).join(', '))
    await goOffline(site, context, engine)
    const before = await visit(page, site.origin, '/')
    check(where, 'and it cannot open the app offline (the defect the update is for)', !before.ok, JSON.stringify(before))
    await comeBack(site, context, engine)

    site.state.root = DIST
    await visit(page, site.origin, '/')
    await checkForUpdate(page)
    check(where, 'the new worker replaces it: shell precached, its own entries gone', await until(() => updated(page)), (await precached(page)).join(', '))
    await controlled(page)
    await goOffline(site, context, engine)
    await opensOffline(where, page, site.origin, ['/', '/settings'])
  } finally {
    await context.close()
    await site.close()
  }
}

/** A deploy whose shell cannot be fetched leaves the worker that is installed in place, and the next deploy installs. */
async function updateThatCannotInstall(browser, engine, tmp) {
  const where = `${engine}, an update that cannot install`
  const site = await startSite({ root: DIST })
  const { context, page } = await installPrevious(browser, site, join(tmp, `previous-fails-${engine}`))
  try {
    site.state.root = DIST
    site.state.failing.set('/index.html', 500)
    await visit(page, site.origin, '/')
    await checkForUpdate(page)
    await new Promise((resolve) => setTimeout(resolve, 3_000))
    const paths = await precached(page)
    check(where, 'the installed worker keeps its precache', paths.includes('/assets/app-previous.js') && !paths.includes('/index.html'), paths.join(', '))
    const state = await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => ({ active: r?.active?.state, waiting: Boolean(r?.waiting), controlled: Boolean(navigator.serviceWorker.controller) })))
    check(where, 'and is still the active worker, with nothing waiting', state.active === 'activated' && !state.waiting && state.controlled, JSON.stringify(state))
    const online = await visit(page, site.origin, '/settings')
    check(where, 'the app still opens while the network works', online.ok && online.status === 200 && online.title === 'Expenses', JSON.stringify(online))

    site.state.failing.clear()
    await checkForUpdate(page)
    check(where, 'the next deploy installs', await until(() => updated(page)), (await precached(page)).join(', '))
    await controlled(page)
    await goOffline(site, context, engine)
    await opensOffline(where, page, site.origin, ['/'])
  } finally {
    await context.close()
    await site.close()
  }
}

/** Behind Access, a session that has ended is a redirect to the sign-in page, and the worker must pass it on. */
async function behindAccess(browser, engine) {
  const where = `${engine}, behind Access`
  const login = await startLogin()
  const site = await startSite({ root: DIST, access: login.origin })
  const context = await browser.newContext()
  await context.addCookies([{ name: 'CF_Authorization', value: 'ok', url: site.origin }])
  const page = await context.newPage()
  try {
    await page.goto(`${site.origin}/`)
    await controlled(page)
    check(where, 'with a session the app opens', (await page.title()) === 'Expenses', await page.title())

    await context.clearCookies()
    await page.goto(`${site.origin}/`)
    check(where, 'without one, a launch reaches Access, not the shell', page.url().startsWith(login.origin) && (await page.title()) === 'Sign in', `${page.url()} ${await page.title()}`)
    await page.goto(`${site.origin}/settings`)
    check(where, 'and so does a deep link', page.url().startsWith(login.origin), page.url())

    login.state.returnTo = site.origin
    await page.locator('#go').click()
    await page.waitForURL(`${site.origin}/`, { timeout: 10_000 }).catch(() => undefined)
    await page.locator('#root > *').first().waitFor({ timeout: 5_000 }).catch(() => undefined)
    check(where, 'signing in brings the person back to the app', page.url() === `${site.origin}/` && (await page.title()) === 'Expenses', `${page.url()} ${await page.title()}`)

    await goOffline(site, context, engine)
    await login.close()
    const offline = await visit(page, site.origin, '/')
    check(where, 'with no network at all the shell opens', opens(offline), JSON.stringify(offline))
  } finally {
    await context.close().catch(() => undefined)
    await site.close().catch(() => undefined)
    await login.close().catch(() => undefined)
  }
}

if (!existsSync(join(DIST, 'sw.js'))) {
  console.error(`${join(DIST, 'sw.js')} does not exist: run \`npm run build\` first`)
  process.exit(1)
}

const tmp = mkdtempSync(join(tmpdir(), 'offline-start-'))
try {
  for (const engine of ENGINES) {
    console.log(engine)
    const browser = await LAUNCH[engine].launch()
    try {
      await firstVisitThenNoNetwork(browser, engine)
      await updateFromDeployed(browser, engine, tmp)
      await updateThatCannotInstall(browser, engine, tmp)
      await behindAccess(browser, engine)
    } finally {
      await browser.close()
    }
  }
} finally {
  rmSync(tmp, { recursive: true, force: true })
}

if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed:\n${failures.map((failure) => `  - ${failure}`).join('\n')}`)
  process.exit(1)
}
console.log('\nevery check passed')
