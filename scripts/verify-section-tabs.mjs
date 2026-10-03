#!/usr/bin/env node
/**
 * Playwright check of the Analytics and Settings section tabs, and of keyboard focus staying
 * clear of what is pinned over the page, on the demo instance.
 *
 * jsdom lays nothing out, so the unit tests fake every position this depends on. This is the
 * run against real layout. Manual, like verify:goals-nav: it needs a browser and takes a few
 * minutes, so it is not part of `npm run verify` or CI.
 *
 * Starts its own dev server on CAPTURE_PORT (5173 unless set), with DOCS_CAPTURE=1 so it has
 * the seeded demo data and nothing real. Exits 1 and says what was measured if anything fails.
 */
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PORT = process.env.CAPTURE_PORT ?? '5173'
const BASE = `http://127.0.0.1:${PORT}`

const PHONES = [
  { name: '375x812', width: 375, height: 812 },
  { name: '320x568', width: 320, height: 568 },
]
const DESKTOP = { name: '1100x800', width: 1100, height: 800 }

/** The air a landed section's content is left under the bar, in px (PINNED_AIR_PX). */
const AIR = 8

/** What a section bar is called, and the sections it has. Analytics' only exists on a phone. */
const BARS = {
  Analytics: { label: 'Analytics section', sections: ['Summary', 'Totals', 'Cash', 'Year'] },
  Settings: { label: 'Settings section', sections: ['Preferences', 'Setup', 'Account', 'Data'] },
}

const failures = []

/** `detail` is only read when the check fails, and says what was measured instead. */
function check(where, what, ok, detail = '') {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${where}: ${what}${ok ? '' : ` (${detail})`}`)
  if (!ok) failures.push(`${where}: ${what} (${detail})`)
}

const near = (a, b, tolerance = 1) => Math.abs(a - b) <= tolerance
const px = (n) => `${Math.round(n * 10) / 10}px`

function startDev() {
  return spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', PORT, '--strictPort'], {
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

async function answers() {
  try {
    return (await fetch(BASE)).ok
  } catch {
    return false
  }
}

async function waitForServer(ms = 30000) {
  const start = Date.now()
  while (Date.now() - start < ms) {
    if (await answers()) return
    await new Promise((r) => setTimeout(r, 400))
  }
  throw new Error('Dev server did not start')
}

/** Resolves once the page has not scrolled for 200ms, so a measurement is of where it came to rest. */
function settled(page) {
  return page.evaluate(
    () =>
      new Promise((resolve) => {
        let last = window.scrollY
        let still = 0
        const poll = () => {
          if (window.scrollY === last) still += 1
          else {
            still = 0
            last = window.scrollY
          }
          if (still >= 12) resolve(window.scrollY)
          else requestAnimationFrame(poll)
        }
        requestAnimationFrame(poll)
      }),
  )
}

async function scrollTo(page, y) {
  await page.evaluate((top) => window.scrollTo(0, top), y)
  return settled(page)
}

/** A fresh page on the demo instance, on one of the app's tabs. */
async function openApp(browser, { width, height }, tabName = null) {
  const phone = width < 768
  const context = await browser.newContext({
    viewport: { width, height },
    screen: { width, height },
    deviceScaleFactor: 2,
    isMobile: phone,
    hasTouch: phone,
    colorScheme: 'light',
    // Smooth scrolls would be measured mid-flight; what matters here is where they end.
    reducedMotion: 'reduce',
  })
  const page = await context.newPage()
  page.on('pageerror', (e) => failures.push(`page error: ${e.message}`))
  await page.goto(`${BASE}/`)
  await page.waitForSelector('text=Recent activity', { timeout: 15000 })
  if (tabName) {
    // The Settings button carries a badge when there are pending access requests.
    await page.getByRole('button', { name: new RegExp(`^(\\d+ pending access requests )?${tabName}$`) }).click()
    await page.waitForTimeout(400)
  }
  return { page, context }
}

const tab = (page, bar, name) =>
  page.getByRole('tablist', { name: BARS[bar].label }).getByRole('tab', { name, exact: true })

async function pick(page, bar, name) {
  await tab(page, bar, name).click()
  await page.waitForTimeout(250)
  await settled(page)
}

/** Where the bar, the header and the content of the open section are. */
function measure(page, bar) {
  return page.evaluate((label) => {
    const group = document.querySelector(`[role="tablist"][aria-label="${label}"]`)
    const row = group.parentElement
    const anchor = document.querySelector('[role="tabpanel"] > [id$="-content"]')
    const fade = getComputedStyle(row, '::after')
    return {
      y: window.scrollY,
      max: document.documentElement.scrollHeight - window.innerHeight,
      header: document.querySelector('header').getBoundingClientRect().height,
      rowTop: row.getBoundingClientRect().top,
      rowBottom: row.getBoundingClientRect().bottom,
      rowHeight: row.getBoundingClientRect().height,
      stickyTop: parseFloat(getComputedStyle(row).top),
      fade: fade.content !== 'none' && parseFloat(fade.height) > 0,
      anchorTop: anchor ? anchor.getBoundingClientRect().top : null,
      overflow: document.documentElement.scrollWidth - window.innerWidth,
    }
  }, BARS[bar].label)
}

/**
 * The bar sticks under the header (tucked 1px beneath it), is 44px high on a phone, fades what
 * scrolls under it, and a section tapped from down the page lands its content 8px under it
 * and comes back where it was left.
 */
async function checkBar(browser, tabName, first, second) {
  const where = `375x812 ${tabName} ${first}`
  const { page, context } = await openApp(browser, PHONES[0], tabName)
  if (first !== BARS[tabName].sections[0]) await pick(page, tabName, first)
  let m = await measure(page, tabName)
  await scrollTo(page, Math.floor(m.max / 2))
  m = await measure(page, tabName)
  check(where, '(a) the bar sticks to the header height less the 1px tuck', near(m.rowTop, m.header - 1, 0.5) && near(m.stickyTop, m.header - 1, 0.5), `bar is ${px(m.rowTop)} down, its sticky top is ${px(m.stickyTop)}, the header is ${px(m.header)} tall`)
  check(where, '(a) the bar is 44px high', near(m.rowHeight, 44, 0.5), px(m.rowHeight))
  check(where, '(a) what scrolls under the bar fades out', m.fade, 'no ::after under the bar')

  const leftAt = m.y
  await pick(page, tabName, second)
  m = await measure(page, tabName)
  check(where, `(b) ${second} lands its content ${AIR}px under the bar`, m.anchorTop !== null && near(m.anchorTop, m.rowBottom + AIR), `content ${m.anchorTop === null ? 'n/a' : px(m.anchorTop)}, bar bottom ${px(m.rowBottom)}`)
  await pick(page, tabName, first)
  m = await measure(page, tabName)
  check(where, `(b) going back to ${first} puts it where it was left`, near(m.y, leftAt), `left at ${px(leftAt)}, came back to ${px(m.y)}`)
  await pick(page, tabName, first)
  m = await measure(page, tabName)
  check(where, '(b) tapping the section already selected goes to the top of its content', m.anchorTop !== null && near(m.anchorTop, m.rowBottom + AIR), `content ${m.anchorTop === null ? 'n/a' : px(m.anchorTop)}, bar bottom ${px(m.rowBottom)}`)
  await context.close()
}

/**
 * A tab row answers to Left and Right, not Up and Down: with a tab focused, Down scrolls the
 * page as it would anywhere else and the section stays, while Right still moves to the next one.
 */
async function checkTabKeys(browser, tabName, first, second) {
  const where = `375x812 ${tabName} bar`
  const { page, context } = await openApp(browser, PHONES[0], tabName)
  const selected = () => page.evaluate((label) => document.querySelector(`[role="tablist"][aria-label="${label}"] [aria-selected="true"]`).textContent, BARS[tabName].label)
  await tab(page, tabName, first).focus()
  const y = await page.evaluate(() => window.scrollY)
  await page.keyboard.press('ArrowDown')
  await page.waitForTimeout(250)
  const moved = await settled(page)
  check(where, '(f) ArrowDown on a tab scrolls the page and keeps the section', moved > y && (await selected()) === first, `section ${await selected()}, scrolled from ${px(y)} to ${px(moved)}`)
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(250)
  check(where, `(f) ArrowRight moves to ${second}`, (await selected()) === second, `section ${await selected()}`)
  await context.close()
}

/**
 * Every label shown whole inside its segment and the bar, with no sideways scroll. Each segment
 * has an unpainted tap area that reaches past its edges (a ::before), which would count as
 * overflow, so it is switched off for the measurement.
 */
async function checkLabels(browser, phone, tabName) {
  const where = `${phone.name} ${tabName} bar`
  const { page, context } = await openApp(browser, phone, tabName)
  await page.addStyleTag({ content: '[role="tablist"] [role="tab"]::before { display: none !important; }' })
  const result = await page.evaluate((label) => {
    const group = document.querySelector(`[role="tablist"][aria-label="${label}"]`)
    const bar = group.getBoundingClientRect()
    return {
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      segments: [...group.querySelectorAll('[role="tab"]')].map((seg) => {
        const range = document.createRange()
        range.selectNodeContents(seg)
        const text = range.getBoundingClientRect()
        const box = seg.getBoundingClientRect()
        return {
          label: seg.textContent,
          scrollWidth: seg.scrollWidth,
          clientWidth: seg.clientWidth,
          inSegment: text.left >= box.left - 0.5 && text.right <= box.right + 0.5,
          inBar: text.left >= bar.left - 0.5 && text.right <= bar.right + 0.5,
          lines: Math.round(text.height / parseFloat(getComputedStyle(seg).lineHeight || '1')),
        }
      }),
    }
  }, BARS[tabName].label)
  for (const s of result.segments) {
    check(where, `(c) "${s.label}" is shown whole`, s.scrollWidth <= s.clientWidth && s.inSegment && s.inBar && s.lines <= 1, `scrollWidth ${s.scrollWidth} against clientWidth ${s.clientWidth}, in its segment ${s.inSegment}, in the bar ${s.inBar}, ${s.lines} line(s)`)
  }
  check(where, '(c) the page does not scroll sideways', result.overflow <= 0, `${result.overflow}px too wide`)
  await context.close()
}

/** On a mouse the Settings bar is as high as the other segmented controls, and still sticks. */
async function checkDesktop(browser) {
  const where = `${DESKTOP.name} Settings`
  const { page, context } = await openApp(browser, DESKTOP, 'Settings')
  await pick(page, 'Settings', 'Setup')
  let m = await measure(page, 'Settings')
  await scrollTo(page, Math.floor(m.max / 2))
  m = await measure(page, 'Settings')
  check(where, '(d) the bar sticks to the header height less the 1px tuck', near(m.rowTop, m.header - 1, 0.5), `bar is ${px(m.rowTop)} down, the header is ${px(m.header)} tall`)
  check(where, '(d) the bar is 36px high', near(m.rowHeight, 36, 0.5), px(m.rowHeight))
  await context.close()
}

/**
 * Walks focus through the page with the keyboard and, at each stop, asks what is at a 5x5 grid of
 * points over the focused control. One that the header, a section bar, the Transactions bar or a
 * day heading, or the bottom bar covers all over is a control the viewer cannot see.
 */
async function walkFocus(page, direction, max) {
  const coveredBy = () =>
    page.evaluate(() => {
      const el = document.activeElement
      if (!el || el === document.body) return { gone: true }
      const r = el.getBoundingClientRect()
      const x0 = Math.max(r.left, 0)
      const x1 = Math.min(r.right, window.innerWidth)
      const y0 = Math.max(r.top, 0)
      const y1 = Math.min(r.bottom, window.innerHeight)
      const name = (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 40)
      const layers = [
        ['header', document.querySelector('header')],
        ['section bar', document.querySelector('[role="tablist"]')?.parentElement],
        ['result bar', document.getElementById('txn-results')],
        ['bottom bar', document.querySelector('nav[aria-label="Sections"]')],
        ...[...document.querySelectorAll('[data-day-header]')].map((d) => ['day heading', d]),
      ]
      if (x1 <= x0 || y1 <= y0) return { name, visible: 0, by: 'off screen' }
      let visible = 0
      const by = new Set()
      for (let i = 0; i < 5; i++) {
        for (let j = 0; j < 5; j++) {
          const hit = document.elementFromPoint(x0 + ((i + 0.5) / 5) * (x1 - x0), y0 + ((j + 0.5) / 5) * (y1 - y0))
          if (hit && (el === hit || el.contains(hit))) visible++
          else for (const [label, layer] of layers) if (layer && hit && layer.contains(hit)) by.add(label)
        }
      }
      // Covered by something that is not pinned (the floating add button) is a different matter.
      return { name, visible, by: [...by].join(' and ') }
    })

  await page.evaluate((dir) => {
    const all = [...document.querySelectorAll('button, a[href], input, select, textarea, summary, [tabindex="0"]')].filter(
      (el) => !el.disabled && el.tabIndex >= 0 && el.getBoundingClientRect().width > 0,
    )
    window.scrollTo(0, dir === 'back' ? document.documentElement.scrollHeight : 0)
    ;(dir === 'back' ? all[all.length - 1] : all[0]).focus({ preventScroll: true })
  }, direction)

  const stops = []
  for (let i = 0; i < max; i++) {
    await page.keyboard.press(direction === 'back' ? 'Shift+Tab' : 'Tab')
    await page.waitForTimeout(45)
    const stop = await coveredBy()
    if (stop.gone) break
    stops.push(stop)
  }
  return stops
}

async function checkFocus(page, where, max = 200) {
  for (const [direction, keys] of [['back', 'Shift+Tab'], ['forward', 'Tab']]) {
    const stops = await walkFocus(page, direction, max)
    const hidden = stops.filter((s) => s.visible === 0 && s.by !== '')
    check(
      where,
      `(e) no control the ${keys} walk reaches is covered by what is pinned (${stops.length} stops)`,
      stops.length > 0 && hidden.length === 0,
      stops.length === 0 ? 'it visited nothing' : hidden.map((s) => `"${s.name}" under ${s.by}`).join('; '),
    )
  }
}

async function checkFocusEverywhere(browser, viewport) {
  const phone = viewport.width < 768
  for (const tabName of ['Dashboard', 'Transactions', 'Analytics', 'Settings']) {
    const { page, context } = await openApp(browser, viewport, tabName === 'Dashboard' ? null : tabName)
    const where = `${viewport.name} ${tabName}`
    const bar = tabName === 'Analytics' && !phone ? null : BARS[tabName]
    if (bar) {
      for (const section of bar.sections) {
        await pick(page, tabName, section)
        await checkFocus(page, `${where} ${section}`)
      }
    } else {
      await checkFocus(page, where, tabName === 'Transactions' ? 260 : 200)
    }
    await context.close()
  }
}

async function main() {
  if (await answers()) throw new Error(`Something already answers on ${BASE}; set CAPTURE_PORT to a free port.`)
  const dev = startDev()
  try {
    await waitForServer()
    const { chromium } = await import('playwright')
    const browser = await chromium.launch()
    try {
      console.log('\nSection bars')
      await checkBar(browser, 'Analytics', 'Summary', 'Totals')
      await checkBar(browser, 'Settings', 'Setup', 'Data')
      await checkTabKeys(browser, 'Analytics', 'Summary', 'Totals')
      await checkTabKeys(browser, 'Settings', 'Preferences', 'Setup')
      for (const phone of PHONES) {
        await checkLabels(browser, phone, 'Analytics')
        await checkLabels(browser, phone, 'Settings')
      }
      await checkDesktop(browser)
      for (const viewport of [PHONES[0], DESKTOP]) {
        console.log(`\nKeyboard focus at ${viewport.name}`)
        await checkFocusEverywhere(browser, viewport)
      }
    } finally {
      await browser.close()
    }
  } finally {
    stopDev(dev)
  }

  if (failures.length > 0) {
    console.error(`\n${failures.length} check(s) failed:`)
    for (const f of failures) console.error(`  - ${f}`)
    process.exit(1)
  }
  console.log('\nSection tabs and keyboard focus OK')
}

main().catch((err) => {
  console.error(err.message ?? err)
  process.exit(1)
})
