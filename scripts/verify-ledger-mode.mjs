#!/usr/bin/env node
/**
 * Playwright check that the app shows the same thing with the ledger read in parts as it does reading the
 * whole dataset, on the demo instance, in Chromium and WebKit, at a phone width and a desktop width.
 *
 * For each of them it opens the app with the ledger mode off and on and compares the text of the Dashboard, of
 * Analytics (Overview, Spending and Cash) for the newest month and for an older one, of Goals (the view it
 * opens on and Progress), of Transactions and of the card statements in Settings. Then it opens it in shadow mode, which
 * reads both and compares them in the page, and requires the page to have found no difference.
 *
 * jsdom lays nothing out and has no second engine; this is the run against real browsers. Manual, like
 * verify:goals-tabs: it needs both browsers installed and takes a few minutes, so it is not part of
 * `npm run verify` or CI.
 *
 * Starts its own dev server on CAPTURE_PORT (5173 unless set), with DOCS_CAPTURE=1 so it has the seeded demo
 * data and nothing real. `ENGINES=chromium` limits the browsers. Exits 1 and says what differed if anything did.
 */
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, webkit } from 'playwright'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PORT = process.env.CAPTURE_PORT ?? '5173'
const BASE = `http://localhost:${PORT}`
const TODAY = new Date('2026-10-15T12:00:00')
const OLDER_BY = 4

const ENGINES = { chromium, webkit }
const WANTED = (process.env.ENGINES ?? 'chromium,webkit').split(',')
const SIZES = [
  { name: '375x812', viewport: { width: 375, height: 812 } },
  { name: '1280x800', viewport: { width: 1280, height: 800 } },
]

const failures = []

function check(where, what, ok, detail = '') {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${where}: ${what}${ok ? '' : ` (${detail})`}`)
  if (!ok) failures.push(`${where}: ${what} (${detail})`)
}

async function waitForServer(ms = 60000) {
  const start = Date.now()
  while (Date.now() - start < ms) {
    try {
      if ((await fetch(BASE)).ok) return
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 400))
  }
  throw new Error('Dev server did not start')
}

async function settle(page) {
  await page.waitForFunction(() => {
    const pane = document.querySelector('[class*="tabPane"]')
    return !pane || parseFloat(getComputedStyle(pane).opacity) > 0.95
  })
  await page.waitForTimeout(450)
}

/** The navigation renders each tab twice (sidebar and bottom bar); one is visible. Settings carries a badge. */
async function press(page, name) {
  for (const match of [name, new RegExp(`${name}$`)]) {
    for (const button of await page.getByRole('button', { name: match, exact: typeof match === 'string' }).all()) {
      if (await button.isVisible()) return button.click()
    }
  }
  throw new Error(`no visible button ${name}`)
}

const paneText = (page) => page.evaluate(() => document.querySelector('[class*="tabPane"]')?.innerText ?? '')

/** The text of every screen compared, keyed by screen. */
async function screens(page) {
  const out = {}
  const grab = async (name) => {
    await settle(page)
    out[name] = await paneText(page)
  }
  await grab('dashboard')
  await press(page, 'Analytics')
  await page.waitForSelector('text=Spending baseline', { timeout: 20000 })
  for (const [label, back] of [['newest', 0], ['older', OLDER_BY]]) {
    for (let i = 0; i < back; i++) {
      await page.getByRole('button', { name: 'Previous month' }).click()
      await page.waitForTimeout(150)
    }
    for (const view of ['Overview', 'Spending', 'Cash']) {
      await page.getByRole('tab', { name: view }).first().click()
      await grab(`analytics ${view} (${label} month)`)
    }
  }
  await press(page, 'Goals')
  await grab('goals (the view it opens on)')
  await page.getByRole('tab', { name: 'Progress' }).first().click()
  await grab('goals Progress')
  await press(page, 'Transactions')
  await page.waitForSelector('input[placeholder*="Search description"]', { timeout: 20000 })
  await grab('transactions')
  // The same list over every date, and searched: in ledger mode these are pages read from the server, which
  // the demo's rows fit in one of, so they must read as the whole list does.
  await page.getByRole('button', { name: 'Filters', exact: true }).click()
  await page.getByRole('dialog').getByText('All', { exact: true }).click()
  await page.locator('[role=dialog] [aria-label="Close"]').first().click()
  await page.waitForTimeout(700)
  await grab('transactions (all dates)')
  await page.getByPlaceholder(/Search description/).fill('shop')
  await page.waitForTimeout(900)
  await grab('transactions (all dates, searched)')
  await press(page, 'Settings')
  await page.getByRole('tab', { name: 'Setup' }).first().click()
  const text = (await paneText(page)).split('Card statements')[1] ?? ''
  out['settings card statements'] = text
  return out
}

async function open(browser, size, mode) {
  const context = await browser.newContext({ viewport: size.viewport, colorScheme: 'light' })
  await context.clock.setFixedTime(TODAY)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${BASE}/?ledger=${mode}`)
  await page.waitForSelector('text=Recent activity', { timeout: 30000 })
  return { context, page, errors }
}

/** Where two texts first differ, with a little around it, for a failure to say what it saw. */
function firstDifference(a, b) {
  let at = 0
  while (at < a.length && at < b.length && a[at] === b[at]) at++
  const near = (text) => JSON.stringify(text.slice(Math.max(0, at - 40), at + 60))
  return `at character ${at}: ${near(a)} against ${near(b)}`
}

async function compareModes(engine, browser, size) {
  const where = `${engine} ${size.name}`
  const off = await open(browser, size, 'off')
  const before = await screens(off.page)
  await off.context.close()
  const on = await open(browser, size, 'on')
  const after = await screens(on.page)
  const usedLedger = await on.page.evaluate(() => window.localStorage.getItem('expenses-ledger-mode'))
  await on.context.close()
  check(where, 'the ledger mode was on for the second run', usedLedger === 'on', String(usedLedger))
  for (const name of Object.keys(before)) {
    check(where, `${name} reads the same`, before[name] === after[name] && before[name].length > 20, firstDifference(before[name], after[name]))
  }
  check(where, 'no page error, off or on', off.errors.length + on.errors.length === 0, [...off.errors, ...on.errors].join('; '))
}

async function shadow(engine, browser, size) {
  const where = `${engine} ${size.name}`
  const { context, page, errors } = await open(browser, size, 'shadow')
  await page.waitForFunction(() => window.__ledgerShadow?.checks >= 1, null, { timeout: 30000 })
  const report = await page.evaluate(() => window.__ledgerShadow)
  check(where, 'shadow mode compared the ledger with the whole dataset and found nothing', report.differences.length === 0, report.differences.join('; '))
  check(where, 'no page error in shadow mode', errors.length === 0, errors.join('; '))
  await context.close()
}

const server = spawn('npm', ['run', 'dev', '--', '--host', 'localhost', '--port', PORT, '--strictPort'], {
  cwd: ROOT,
  env: { ...process.env, DOCS_CAPTURE: '1' },
  stdio: 'ignore',
  detached: true,
})

try {
  await waitForServer()
  for (const engine of WANTED) {
    const browser = await ENGINES[engine].launch()
    for (const size of SIZES) {
      console.log(`${engine} ${size.name}`)
      await compareModes(engine, browser, size)
      await shadow(engine, browser, size)
    }
    await browser.close()
  }
} finally {
  try {
    process.kill(-server.pid, 'SIGTERM')
  } catch {
    server.kill('SIGTERM')
  }
}

if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed:\n${failures.map((f) => `  - ${f}`).join('\n')}`)
  process.exit(1)
}
console.log('\nverify-ledger-mode OK')
