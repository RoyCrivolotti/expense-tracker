#!/usr/bin/env node
/** Playwright regression: Goals secondary chart tabs must not overlap at mobile width. */
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BASE = 'http://127.0.0.1:5173'

function startDev() {
  return spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '5173'], {
    cwd: ROOT,
    env: { ...process.env, DOCS_CAPTURE: '1' },
    stdio: 'ignore',
    detached: true,
  })
}

function stopDev(dev) {
  if (!dev?.pid) return
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

async function waitForServer(ms = 30000) {
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

export async function assertGoalsSecondaryTabsNoOverlap(page) {
  const result = await page.evaluate(() => {
    const group = document.querySelector('[aria-label="Secondary chart view"]')
    if (!group) return { ok: false, reason: 'missing Secondary chart view radiogroup' }
    const btns = [...group.querySelectorAll('[role="radio"]')]
    if (btns.length < 2) return { ok: false, reason: 'expected at least two chart tabs' }
    const boxes = btns.map((b) => ({
      label: b.textContent ?? '',
      rect: b.getBoundingClientRect(),
      flex: getComputedStyle(b).flex,
    }))
    for (let i = 1; i < boxes.length; i++) {
      if (boxes[i].rect.left < boxes[i - 1].rect.right - 1) {
        return {
          ok: false,
          reason: `overlap: "${boxes[i - 1].label}" ends at ${boxes[i - 1].rect.right}, "${boxes[i].label}" starts at ${boxes[i].rect.left}`,
        }
      }
    }
    const firstFlex = boxes[0]?.flex ?? ''
    if (firstFlex.includes('1 1') || firstFlex === '1') {
      return { ok: false, reason: `tabs use flex-grow (${firstFlex}); expected fixed-width chips` }
    }
    return { ok: true, tabCount: boxes.length }
  })
  if (!result.ok) throw new Error(`Goals mobile tab layout: ${result.reason}`)
  return result
}

async function main() {
  const dev = startDev()
  try {
    await waitForServer()
    const { chromium } = await import('playwright')
    const browser = await chromium.launch()
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      reducedMotion: 'reduce',
    })
    await page.goto(`${BASE}/`)
    await page.waitForSelector('text=Recent activity', { timeout: 15000 })
    await page.getByRole('button', { name: 'Goals' }).click()
    await page.waitForSelector('[aria-label="Secondary chart view"]', { timeout: 15000 })
    const result = await assertGoalsSecondaryTabsNoOverlap(page)
    await browser.close()
    console.log(`Goals mobile tabs OK (${result.tabCount} tabs, no overlap)`)
  } finally {
    stopDev(dev)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err.message ?? err)
    process.exit(1)
  })
}
