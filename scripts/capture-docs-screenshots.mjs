#!/usr/bin/env node
/**
 * Capture README screenshots from local dev (CSV mode + mocked access admin API).
 * Requires: npm install -D playwright && npx playwright install chromium
 */
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertGoalsSecondaryTabsNoOverlap } from './verify-goals-mobile-tabs.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'docs/screenshots/gallery')
// Overridable because parallel worktrees each want their own dev server, and
// 5173 is routinely taken by whichever one started first.
const PORT = process.env.CAPTURE_PORT ?? '5173'
const BASE = `http://127.0.0.1:${PORT}`

async function applyTheme(page, theme) {
  await page.addInitScript((selected) => {
    localStorage.setItem('exp-theme', selected)
    if (selected === 'system') document.documentElement.removeAttribute('data-exp-theme')
    else document.documentElement.setAttribute('data-exp-theme', selected)
  }, theme)
}

async function waitForServer(ms = 30000) {
  const start = Date.now()
  while (Date.now() - start < ms) {
    try {
      const res = await fetch(BASE)
      if (res.ok) return
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 400))
  }
  throw new Error('Dev server did not start')
}

function startDev() {
  return spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', PORT], {
    cwd: ROOT,
    env: { ...process.env, DOCS_CAPTURE: '1' },
    stdio: 'ignore',
    detached: true,
  })
}

function stopDev(dev) {
  if (!dev.pid) return
  try {
    process.kill(-dev.pid, 'SIGTERM')
  } catch {
    try {
      dev.kill('SIGTERM')
    } catch {
      /* already exited */
    }
  }
}

/**
 * Settings opens on the System sub-tab, so "Manage access" is not on screen until the
 * Account preferences tab is selected. Before #85 split Settings into sub-tabs it was
 * on the one page, which is why this used to be a bare waitForSelector.
 */
async function openAccountSettings(page) {
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByRole('radio', { name: 'Account preferences' }).click()
  await page.waitForSelector('text=Manage access', { timeout: 15000 })
}

async function waitForAccessAdmin(page) {
  await page.waitForSelector('text=Access management', { timeout: 15000 })
  await page.waitForSelector('text=Revoke all', { timeout: 15000 })
  await page.waitForSelector('text=Financial documents', { timeout: 15000 })
}

async function waitForDashboard(page) {
  await page.waitForSelector('text=Recent activity', { timeout: 15000 })
  // Tab panes fade in over 120ms; shooting on selector match alone captures a greyed frame.
  await page.waitForFunction(() => {
    const pane = document.querySelector('[class*="tabPane"]')
    if (!pane) return true
    return parseFloat(getComputedStyle(pane).opacity) > 0.95
  })
  await page.waitForTimeout(150)
}

async function goToTransactions(page) {
  await page.getByRole('button', { name: 'Transactions' }).click()
  await page.waitForSelector('input[placeholder*="Search description"]', { timeout: 15000 })
}

async function filtersExpanded(page) {
  return page.getByRole('button', { name: /Filters/ }).getAttribute('aria-expanded')
}

async function setFiltersExpanded(page, open) {
  const btn = page.getByRole('button', { name: /Filters/ })
  const expanded = await filtersExpanded(page)
  const want = open ? 'true' : 'false'
  if (expanded !== want) {
    await btn.click()
    await page.waitForTimeout(200)
  }
}

async function setMonthLabel(page, monthName) {
  const pattern = new RegExp(`${monthName} 2026`)
  const headerMonth = page.getByRole('banner').getByText(pattern)
  for (let i = 0; i < 12; i++) {
    if (await headerMonth.isVisible()) return
    await page.getByRole('button', { name: 'Previous month' }).click()
    await page.waitForTimeout(150)
  }
  throw new Error(`Could not navigate to month: ${monthName}`)
}

async function captureTransactionsDefault(page, filename) {
  await page.goto(`${BASE}/`)
  await page.waitForSelector('text=Recent activity', { timeout: 15000 })
  await goToTransactions(page)
  await page.waitForSelector('text=Upcoming', { timeout: 15000 })
  await setMonthLabel(page, 'May')
  await setFiltersExpanded(page, false)
  await page.waitForSelector('text=Travel Card statement', { timeout: 15000 })
  await page.waitForTimeout(300)
  await page.screenshot({ path: join(OUT, filename) })
}

/**
 * Expand every <details> on the page.
 *
 * The Flagged card and each flag group inside it are collapsed <details>.
 * Chrome hides a closed one's content with content-visibility, so its buttons
 * fail Playwright's visibility check *and* drop out of the accessibility tree —
 * getByRole matches nothing even though getBoundingClientRect reports a real box.
 */
async function expandDetails(page) {
  await page.evaluate(() => {
    for (const d of document.querySelectorAll('details')) d.open = true
  })
  await page.waitForTimeout(250)
}

/** The report view's dismiss reads "Back"; Modal's reads "Close". */
async function closeOverlay(page) {
  for (const name of ['Back', 'Close']) {
    const button = page.getByRole('button', { name, exact: true }).first()
    if (await button.isVisible().catch(() => false)) {
      await button.click()
      await page.waitForTimeout(350)
      return
    }
  }
  throw new Error('No Back/Close control found on the open overlay')
}

async function captureFlagsAndReports(page, suffix) {
  await goToTransactions(page)
  await page.waitForSelector('text=Flagged', { timeout: 15000 })
  await expandDetails(page)
  await page.locator('text=Manage flags').scrollIntoViewIfNeeded()
  await page.waitForTimeout(300)
  await page.screenshot({ path: join(OUT, `flagged-card-${suffix}.png`) })

  await page.getByRole('button', { name: 'Expense report' }).first().click()
  await page.waitForSelector('text=EXPENSE REPORT', { timeout: 15000 })
  await page.waitForTimeout(400)
  await page.screenshot({ path: join(OUT, `expense-report-${suffix}.png`) })
  await closeOverlay(page)

  await expandDetails(page)
  await page.getByRole('button', { name: 'Record reimbursement' }).first().click()
  await page.waitForSelector('text=Tick what this payment covers', { timeout: 15000 })
  await page.waitForTimeout(400)
  await page.screenshot({ path: join(OUT, `record-reimbursement-${suffix}.png`) })
  await closeOverlay(page)

  await expandDetails(page)
  await page.getByRole('button', { name: 'Past reports' }).first().click()
  await page.waitForTimeout(500)
  await page.screenshot({ path: join(OUT, `past-reports-${suffix}.png`) })
  await closeOverlay(page)
}

async function captureAnalyticsDesktop(page) {
  await page.getByRole('button', { name: 'Analytics' }).click()
  await page.waitForSelector('text=Monthly summary', { timeout: 15000 })
  await page.waitForTimeout(400)
  await page.screenshot({ path: join(OUT, 'analytics-desktop.png') })
  await page.locator('text=Cash reconciliation').scrollIntoViewIfNeeded()
  await page.waitForTimeout(350)
  await page.screenshot({ path: join(OUT, 'analytics-cash-desktop.png') })
}

async function captureTransactionsMobile(m) {
  await captureTransactionsDefault(m, 'transactions-mobile.png')

  await setFiltersExpanded(m, true)
  await m.waitForTimeout(300)
  await m.screenshot({ path: join(OUT, 'transactions-mobile-filters.png') })

  await m.locator('select').first().selectOption({ label: 'Groceries' })
  await setFiltersExpanded(m, false)
  await m.waitForSelector('text=Clear filters', { timeout: 15000 })
  await m.waitForTimeout(300)
  await m.screenshot({ path: join(OUT, 'transactions-mobile-active.png') })

  await m.getByRole('button', { name: 'Clear filters' }).click()
  await setMonthLabel(m, 'May')
  await setFiltersExpanded(m, false)
  await m.waitForSelector('button[aria-label="Go to latest budget month"]', { timeout: 15000 })
  await m.waitForTimeout(300)
  await m.screenshot({ path: join(OUT, 'transactions-mobile-past.png') })
}

async function goToGoals(page) {
  await page.goto(`${BASE}/`)
  await page.waitForSelector('text=Recent activity', { timeout: 15000 })
  await page.getByRole('button', { name: 'Goals', exact: true }).click()
  await page.waitForSelector('text=Invested portfolio projection', { timeout: 15000 })
  await page.waitForSelector('text=Scenarios', { timeout: 15000 })
  await page.getByRole('button', { name: 'Path A: Invest only', exact: true }).waitFor({ timeout: 15000 })
  await page.waitForTimeout(500)
}

async function captureGoalsDesktop(page) {
  await goToGoals(page)
  await page.screenshot({ path: join(OUT, 'goals-desktop.png') })

  await page.getByText('What do these terms mean?').click()
  await page.waitForTimeout(250)
  await page.screenshot({ path: join(OUT, 'goals-desktop-explainer.png') })
  await page.getByText('What do these terms mean?').click()

  await page.locator('text=Net worth composition').scrollIntoViewIfNeeded()
  await page.waitForTimeout(350)
  await page.screenshot({ path: join(OUT, 'goals-desktop-charts.png') })

  await goToGoals(page)
  await page.screenshot({ path: join(OUT, 'goals-desktop-full.png'), fullPage: true })
}

const GOALS_MOBILE_VIEWS = [
  { label: 'Composition', file: 'composition' },
  { label: 'Milestones', file: 'milestones' },
  { label: 'FIRE', file: 'fire' },
  { label: 'Rent vs buy', file: 'rent' },
  { label: 'Investing', file: 'savings' },
]

async function captureGoalsMobile(page) {
  await goToGoals(page)
  await assertGoalsSecondaryTabsNoOverlap(page)
  await page.screenshot({ path: join(OUT, 'goals-mobile.png') })

  await page.getByText('What do these terms mean?').click()
  await page.waitForTimeout(250)
  await page.screenshot({ path: join(OUT, 'goals-mobile-explainer.png') })
  await page.getByText('What do these terms mean?').click()

  await page.getByRole('button', { name: 'Path B: House now', exact: true }).scrollIntoViewIfNeeded()
  await page.waitForTimeout(350)
  await page.screenshot({ path: join(OUT, 'goals-mobile-scenarios.png') })

  for (const view of GOALS_MOBILE_VIEWS) {
    await page.getByRole('radio', { name: view.label }).click()
    await page.waitForTimeout(450)
    await page.screenshot({ path: join(OUT, `goals-mobile-${view.file}.png`) })
  }
}

async function capture() {
  const { chromium } = await import('playwright')
  mkdirSync(OUT, { recursive: true })
  const browser = await chromium.launch()
  const desktopDark = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    colorScheme: 'dark',
    reducedMotion: 'reduce',
  })
  const mobileDark = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    colorScheme: 'dark',
    reducedMotion: 'reduce',
  })
  const desktopLight = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    colorScheme: 'light',
    reducedMotion: 'reduce',
  })

  const d = await desktopDark.newPage()
  await applyTheme(d, 'dark')
  await d.goto(`${BASE}/`)
  await waitForDashboard(d)
  await d.screenshot({ path: join(OUT, 'dashboard-desktop.png') })

  await captureTransactionsDefault(d, 'transactions-desktop.png')

  await captureFlagsAndReports(d, 'desktop')

  await captureAnalyticsDesktop(d)

  await captureGoalsDesktop(d)

  await openAccountSettings(d)
  await d.waitForTimeout(300)
  await d.screenshot({ path: join(OUT, 'settings-desktop.png') })

  await d.goto(`${BASE}/access/admin`)
  await waitForAccessAdmin(d)
  await d.screenshot({ path: join(OUT, 'access-admin-desktop.png') })

  const light = await desktopLight.newPage()
  await applyTheme(light, 'light')
  await light.goto(`${BASE}/`)
  await waitForDashboard(light)
  await light.screenshot({ path: join(OUT, 'dashboard-desktop-light.png') })

  const m = await mobileDark.newPage()
  await applyTheme(m, 'dark')
  await captureTransactionsMobile(m)

  await m.goto(`${BASE}/`)
  await waitForDashboard(m)
  await m.screenshot({ path: join(OUT, 'dashboard-mobile.png') })

  await m.getByRole('button', { name: 'Analytics' }).click()
  await m.waitForSelector('text=Budget vs actual', { timeout: 15000 })
  await m.waitForTimeout(300)
  await m.screenshot({ path: join(OUT, 'analytics-mobile.png') })
  await m.getByRole('radio', { name: 'Cash' }).click()
  await m.waitForSelector('text=Carryover', { timeout: 15000 })
  await m.waitForTimeout(350)
  await m.screenshot({ path: join(OUT, 'analytics-cash-mobile.png') })

  await captureFlagsAndReports(m, 'mobile')

  await captureGoalsMobile(m)

  await openAccountSettings(m)
  await m.screenshot({ path: join(OUT, 'settings-mobile.png') })

  await m.goto(`${BASE}/access/admin`)
  await waitForAccessAdmin(m)
  await m.screenshot({ path: join(OUT, 'access-admin-mobile.png') })

  await browser.close()
}

const dev = startDev()
try {
  await waitForServer()
  await capture()
  console.log(`Screenshots written to ${OUT}`)
} finally {
  stopDev(dev)
}
