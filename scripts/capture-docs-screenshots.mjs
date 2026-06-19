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
const OUT = join(ROOT, 'docs/screenshots')
const BASE = 'http://127.0.0.1:5173'

/** Match initExpenseTheme — dark only for README shots. */
async function applyDarkTheme(page) {
  await page.addInitScript(() => {
    localStorage.setItem('exp-theme', 'dark')
    document.documentElement.setAttribute('data-exp-theme', 'dark')
  })
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
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

async function capture() {
  const { chromium } = await import('playwright')
  mkdirSync(OUT, { recursive: true })
  const browser = await chromium.launch()
  const contextOpts = { colorScheme: 'dark' }
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 800 }, ...contextOpts })
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    ...contextOpts,
  })

  const d = await desktop.newPage()
  await applyDarkTheme(d)
  await d.goto(`${BASE}/`)
  await d.waitForSelector('text=Recent activity', { timeout: 15000 })
  await d.screenshot({ path: join(OUT, 'dashboard-desktop.png') })

  await d.getByRole('button', { name: 'Analytics' }).click()
  await d.waitForSelector('text=Analytics', { timeout: 15000 })
  await d.waitForTimeout(400)
  await d.screenshot({ path: join(OUT, 'analytics-desktop.png') })

  const m = await mobile.newPage()
  await applyDarkTheme(m)
  await m.goto(`${BASE}/`)
  await m.waitForSelector('text=Recent activity', { timeout: 15000 })
  await m.screenshot({ path: join(OUT, 'dashboard-mobile.png') })

  await m.getByRole('button', { name: 'Settings' }).click()
  await m.waitForSelector('text=Manage access', { timeout: 15000 })
  await m.screenshot({ path: join(OUT, 'settings-mobile.png') })

  await m.goto(`${BASE}/access/admin`)
  await m.waitForSelector('text=Access management', { timeout: 15000 })
  await m.screenshot({ path: join(OUT, 'access-admin-mobile.png') })

  await d.goto(`${BASE}/access/admin`)
  await d.waitForSelector('text=Access management', { timeout: 15000 })
  await d.screenshot({ path: join(OUT, 'access-admin-desktop.png') })

  await browser.close()
}

const dev = startDev()
try {
  await waitForServer()
  await capture()
  console.log(`Screenshots written to ${OUT}`)
} finally {
  dev.kill('SIGTERM')
}
