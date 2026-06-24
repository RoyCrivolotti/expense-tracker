#!/usr/bin/env node
/**
 * Capture README screenshots from local dev (CSV mode + mocked access admin API).
 * Requires: npm install -D playwright && npx playwright install chromium
 */
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'docs/screenshots/gallery')
const BASE = 'http://127.0.0.1:5173'

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
  return spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '5173'], {
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
  for (let i = 0; i < 12; i++) {
    if (await page.getByText(pattern).isVisible()) return
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
  await setFiltersExpanded(page, false)
  await page.waitForTimeout(300)
  await page.screenshot({ path: join(OUT, filename) })
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
  await page.getByRole('button', { name: 'Goals' }).click()
  await page.waitForSelector('text=Invested portfolio projection', { timeout: 15000 })
  await page.waitForSelector('text=Scenarios', { timeout: 15000 })
  await page.getByRole('button', { name: 'Path A', exact: true }).waitFor({ timeout: 15000 })
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
  { label: 'Saving', file: 'savings' },
]

async function captureGoalsMobile(page) {
  await goToGoals(page)
  await page.screenshot({ path: join(OUT, 'goals-mobile.png') })

  await page.getByText('What do these terms mean?').click()
  await page.waitForTimeout(250)
  await page.screenshot({ path: join(OUT, 'goals-mobile-explainer.png') })
  await page.getByText('What do these terms mean?').click()

  await page.getByRole('button', { name: 'Path B', exact: true }).scrollIntoViewIfNeeded()
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

  await d.getByRole('button', { name: 'Analytics' }).click()
  await d.waitForSelector('text=Monthly summary', { timeout: 15000 })
  await d.waitForTimeout(400)
  await d.screenshot({ path: join(OUT, 'analytics-desktop.png') })

  await captureGoalsDesktop(d)

  await d.getByRole('button', { name: 'Settings' }).click()
  await d.waitForSelector('text=Manage access', { timeout: 15000 })
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

  await captureGoalsMobile(m)

  await m.getByRole('button', { name: 'Settings' }).click()
  await m.waitForSelector('text=Manage access', { timeout: 15000 })
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
