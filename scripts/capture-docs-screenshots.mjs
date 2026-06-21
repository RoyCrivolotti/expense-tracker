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
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

async function waitForAccessAdmin(page) {
  await page.waitForSelector('text=Access management', { timeout: 15000 })
  await page.waitForSelector('text=Revoke all', { timeout: 15000 })
  await page.waitForSelector('text=Financial documents', { timeout: 15000 })
}

async function capture() {
  const { chromium } = await import('playwright')
  mkdirSync(OUT, { recursive: true })
  const browser = await chromium.launch()
  const desktopDark = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    colorScheme: 'dark',
  })
  const mobileDark = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    colorScheme: 'dark',
  })
  const desktopLight = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    colorScheme: 'light',
  })

  const d = await desktopDark.newPage()
  await applyTheme(d, 'dark')
  await d.goto(`${BASE}/`)
  await d.waitForSelector('text=Recent activity', { timeout: 15000 })
  await d.screenshot({ path: join(OUT, 'dashboard-desktop.png') })

  await d.getByRole('button', { name: 'Analytics' }).click()
  await d.waitForSelector('text=Analytics', { timeout: 15000 })
  await d.waitForTimeout(400)
  await d.screenshot({ path: join(OUT, 'analytics-desktop.png') })

  const light = await desktopLight.newPage()
  await applyTheme(light, 'light')
  await light.goto(`${BASE}/`)
  await light.waitForSelector('text=Recent activity', { timeout: 15000 })
  await light.screenshot({ path: join(OUT, 'dashboard-desktop-light.png') })

  const m = await mobileDark.newPage()
  await applyTheme(m, 'dark')
  await m.goto(`${BASE}/`)
  await m.waitForSelector('text=Recent activity', { timeout: 15000 })
  await m.screenshot({ path: join(OUT, 'dashboard-mobile.png') })

  await m.getByRole('button', { name: 'Settings' }).click()
  await m.waitForSelector('text=Manage access', { timeout: 15000 })
  await m.screenshot({ path: join(OUT, 'settings-mobile.png') })

  await m.goto(`${BASE}/access/admin`)
  await waitForAccessAdmin(m)
  await m.screenshot({ path: join(OUT, 'access-admin-mobile.png') })

  await d.goto(`${BASE}/access/admin`)
  await waitForAccessAdmin(d)
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
