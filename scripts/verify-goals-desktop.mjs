#!/usr/bin/env node
/**
 * Playwright check of the Goals Plan page on a wide screen, on the demo instance: one column with
 * no scroll of its own, the levers bar in reach (held to the bottom edge while its place is below
 * the fold, under the header once scrolled past), the inputs panel folding in and out, the
 * scenario menu, the stars that move an input to the bar and back, the order Tab goes in and that
 * nothing it reaches is under the bar.
 *
 * jsdom lays nothing out, so the unit tests cannot say any of this. Manual, like
 * verify:goals-nav: it needs a browser and takes a few minutes, so it is not part of
 * `npm run verify` or CI.
 *
 * Starts its own dev server on CAPTURE_PORT (5173 unless set), with DOCS_CAPTURE=1 so it has the
 * seeded demo data and nothing real. `ENGINES=chromium,webkit` (the default is chromium) also
 * runs it in Safari's engine. Exits 1 and says what was measured if anything fails.
 */
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PORT = process.env.CAPTURE_PORT ?? '5173'
const BASE = `http://localhost:${PORT}`
const ENGINES = (process.env.ENGINES ?? 'chromium').split(',')

/** The widths the page is meant for, from the narrowest laptop to a large monitor. */
const SCREENS = [
  { name: '1024x768', width: 1024, height: 768 },
  { name: '1280x800', width: 1280, height: 800 },
  { name: '1440x900', width: 1440, height: 900 },
  { name: '1728x1117', width: 1728, height: 1117 },
  { name: '1920x1080', width: 1920, height: 1080 },
]

/** The width from which the bar is one row and held to the bottom edge (planDesktop.module.css). */
const ONE_ROW_FROM = 1200

const failures = []

/** `detail` is only read when the check fails, and says what was measured instead. */
function check(where, what, ok, detail = '') {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${where}: ${what}${ok ? '' : ` (${detail})`}`)
  if (!ok) failures.push(`${where}: ${what} (${detail})`)
}

function startDev() {
  return spawn('npm', ['run', 'dev', '--', '--host', 'localhost', '--port', PORT, '--strictPort'], {
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
    dev.kill('SIGTERM')
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

/** A fresh page on the demo instance, on Goals' Plan. The rail's labels are hidden below 1024px, so it is found by place there. */
async function openPlan(browser, { width, height }, { scheme = 'dark', zoom = null, touch = false } = {}) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    colorScheme: scheme,
    reducedMotion: 'reduce',
    hasTouch: touch,
    isMobile: touch,
  })
  const page = await context.newPage()
  page.on('pageerror', (e) => failures.push(`page error: ${e.message}`))
  await page.addInitScript(() => localStorage.setItem('exp-onboarding-skipped', '1'))
  await page.goto(`${BASE}/`)
  await page.waitForSelector('text=Recent activity', { timeout: 20000 })
  if (zoom) await page.addStyleTag({ content: `html { font-size: ${zoom}; }` })
  await page.locator('[class*="rail"] button').nth(3).click()
  await page.waitForSelector('text=Invested portfolio projection', { timeout: 20000 })
  await settled(page)
  await page.waitForTimeout(400)
  return { page, context }
}

const near = (a, b, tolerance = 1) => Math.abs(a - b) <= tolerance
const px = (n) => `${Math.round(n * 10) / 10}px`

/** Where the page's blocks are, measured in the page. */
function measure(page) {
  return page.evaluate(() => {
    const box = (el) => {
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height }
    }
    const bar = document.querySelector('[class*="leversBar"]')
    const labels = [...(bar?.querySelectorAll('[class*="leverLabel"]') ?? [])]
    return {
      iw: window.innerWidth,
      ih: window.innerHeight,
      y: window.scrollY,
      pageScrollWidth: document.documentElement.scrollWidth,
      header: box(document.querySelector('header')),
      page: box(document.querySelector('[data-goals-plan-wide]')),
      bar: box(bar),
      barTop: bar ? getComputedStyle(bar).top : null,
      barBottom: bar ? getComputedStyle(bar).bottom : null,
      labelTops: labels.map((l) => Math.round(l.getBoundingClientRect().top)),
      scrollHeight: document.documentElement.scrollHeight,
    }
  })
}

/** Any element in the Plan page that scrolls on its own (a table in a card is allowed to scroll sideways). */
function nestedScrollers(page) {
  return page.evaluate(() => {
    const found = []
    for (const el of document.querySelectorAll('[data-goals-plan-wide] *')) {
      const cs = getComputedStyle(el)
      if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 1) {
        found.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)}`)
      }
    }
    return found
  })
}

async function checkLayout(page, screen, where) {
  const m = await measure(page)
  check(where, '(a) nothing in the page scrolls on its own', (await nestedScrollers(page)).length === 0, (await nestedScrollers(page)).join(', '))
  check(where, '(b) the page does not scroll sideways', m.pageScrollWidth <= m.iw, `scrollWidth ${m.pageScrollWidth}, window ${m.iw}`)
  const expected = Math.min(1168, m.iw - (m.iw >= 1024 ? 240 : 72) - 32)
  check(where, '(c) the page is as wide as the column beside the rail allows, up to 76rem', m.page.width >= expected - 40, `page ${px(m.page.width)}, wanted about ${expected}`)
  check(where, '(d) the chart is wider than the 588px it had beside the side panel', m.page.width - 36 > 640, px(m.page.width))
  if (screen.width >= 1250) {
    // The five levers and the result block, which has a label of its own.
    const row = new Set(m.labelTops)
    check(where, '(e) the five levers and the result are on one row', row.size === 1 && m.labelTops.length === 6, `tops ${m.labelTops.join(', ')}`)
  }
  if (screen.width >= ONE_ROW_FROM) {
    check(where, '(f) the bar is on screen on first load, held to the bottom edge', m.bar.bottom <= m.ih + 0.5 && m.bar.top >= 0, `bar ${px(m.bar.top)} to ${px(m.bar.bottom)} in ${m.ih}px`)
    check(where, '(f) the bar is not so tall it leaves little of the chart', m.bar.height < 140, px(m.bar.height))
  }
}

async function checkSticky(page, where) {
  await scrollTo(page, 1400)
  const m = await measure(page)
  const wantTop = m.header.bottom + 3
  check(where, '(g) once the page has scrolled past it the bar sticks under the header with 3px of air', near(m.bar.top, wantTop, 1.5), `bar top ${px(m.bar.top)}, header bottom ${px(m.header.bottom)}`)
  const covered = await page.evaluate(() => {
    const bar = document.querySelector('[class*="leversBar"]')
    const r = bar.getBoundingClientRect()
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    return !bar.contains(hit)
  })
  check(where, '(g) nothing is drawn over the stuck bar', !covered)
  await scrollTo(page, 0)
}

async function checkPanel(page, where) {
  const before = (await measure(page)).scrollHeight
  const button = page.getByRole('button', { name: 'All inputs' })
  check(where, '(h) the inputs panel is closed to begin with', (await button.getAttribute('aria-expanded')) === 'false')
  await button.click()
  const region = page.getByRole('region', { name: 'All inputs' })
  await region.waitFor({ timeout: 5000 })
  await page.waitForTimeout(300)
  const open = await region.boundingBox()
  const grown = (await measure(page)).scrollHeight
  check(where, '(h) the panel opens in columns under the bar and makes the page longer', open !== null && open.height > 200 && grown > before + 150, `panel ${px(open?.height ?? 0)}, page ${before} to ${grown}`)
  const columns = await page.evaluate(() => {
    const tops = [...document.querySelectorAll('[role="region"] [class*="columns"] > *')].map((c) => Math.round(c.getBoundingClientRect().top))
    return new Set(tops).size
  })
  check(where, '(h) the panel has its columns across the page where there is room', (await page.viewportSize()).width < 1250 || columns === 1, `${columns} rows of columns`)
  await button.click()
  await region.waitFor({ state: 'detached', timeout: 5000 })
  await page.waitForTimeout(200)
  check(where, '(h) the panel closes and the page goes back to its length', near((await measure(page)).scrollHeight, before, 3), `page ${before}, then ${(await measure(page)).scrollHeight}`)
}

/** Stars: out of the bar and back to the panel, in from the panel, and the way back to the five. */
async function checkStars(page, where) {
  const bar = page.getByRole('group', { name: 'Key inputs' })
  const count = () => bar.locator('[class*="leverLabel"]').count()
  check(where, '(m) the bar starts with five levers, each with a star to take it out', (await count()) === 5 && (await bar.getByRole('button', { name: /^Remove .* from the bar$/ }).count()) === 5)

  await page.getByRole('button', { name: 'Remove Horizon from the bar' }).click()
  await page.waitForTimeout(300)
  check(where, '(m) taking an input out of the bar leaves four', (await count()) === 4)

  await page.getByRole('button', { name: 'All inputs' }).click()
  await page.getByRole('region', { name: 'All inputs' }).waitFor({ timeout: 5000 })
  check(where, '(m) the input is back in the panel', (await page.getByLabel('Horizon (years)', { exact: true }).count()) === 1)
  const star = page.getByRole('button', { name: 'Add House price to the bar' })
  const box = await star.boundingBox()
  const field = await page.getByLabel('House price', { exact: true }).boundingBox()
  check(where, '(m) the star hangs clear of its input, to the left', box !== null && field !== null && box.x + box.width <= field.x && box.width >= 12, JSON.stringify({ box, field: field && { x: field.x } }))
  await star.click()
  await page.waitForTimeout(300)
  check(where, '(m) starring an input puts it in the bar, which is full again', (await count()) === 5 && (await bar.getByLabel('House price', { exact: true }).count()) === 1)
  const live = await page.getByRole('button', { name: /^Add .* to the bar$/ }).evaluateAll((els) => els.filter((e) => !e.disabled).length)
  check(where, '(m) a full bar leaves no star open to press', live === 0, `${live} open`)

  await page.getByRole('button', { name: 'Reset to defaults' }).click()
  await page.waitForTimeout(300)
  check(where, '(m) Reset puts the five back', (await count()) === 5 && (await bar.getByLabel('Horizon (years)', { exact: true }).count()) === 1)
  await page.getByRole('button', { name: 'All inputs' }).click()
  await page.getByRole('region', { name: 'All inputs' }).waitFor({ state: 'detached', timeout: 5000 })
}

async function checkMenu(page, where) {
  const trigger = page.getByRole('button', { name: 'Scenario options' })
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: 'Scenario options' })
  await dialog.waitFor({ timeout: 5000 })
  const box = await dialog.boundingBox()
  const vp = page.viewportSize()
  check(where, '(i) the scenario menu opens inside the window', box !== null && box.x >= 0 && box.x + box.width <= vp.width && box.y >= 0 && box.y + box.height <= vp.height, JSON.stringify(box))
  await page.waitForTimeout(150)
  check(where, '(i) the menu puts focus inside itself', await dialog.evaluate((el) => el.contains(document.activeElement)))
  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'detached', timeout: 5000 })
  check(where, '(i) Escape closes the menu and gives focus back to its button', await trigger.evaluate((el) => el === document.activeElement))
}

async function checkEdit(page, where) {
  const monthly = page.getByLabel('Monthly investing', { exact: true })
  const before = await monthly.inputValue()
  await monthly.fill('750')
  await monthly.press('Enter')
  await page.getByText('Unsaved changes').waitFor({ timeout: 5000 })
  check(where, '(j) typing over a lever marks the scenario as edited', true)
  await page.getByRole('button', { name: /^Discard changes$/ }).click()
  await page.waitForTimeout(300)
  check(where, '(j) Discard puts the lever back and clears the mark', (await monthly.inputValue()) === before && (await page.getByText('Unsaved changes').count()) === 0, `value ${await monthly.inputValue()}`)

  const result = page.locator('[class*="leverResult"]')
  const resultBefore = await result.textContent()
  const slider = page.getByLabel('Real return (%/yr, after inflation) slider')
  await slider.focus()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(500)
  check(where, '(j) moving a slider with the keyboard moves the net worth at the horizon', (await result.textContent()) !== resultBefore, `still ${resultBefore}`)
  await page.getByRole('button', { name: 'Discard changes' }).click()
}

async function checkHover(page, where) {
  const svg = page.locator('svg[role="img"], svg').filter({ has: page.locator('path') }).first()
  const box = await svg.boundingBox()
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5)
  await page.waitForTimeout(300)
  const header = await page.getByText(/^Year \d+$/).first().isVisible().catch(() => false)
  check(where, '(k) hovering the chart shows the values for a year in the legend', header)
  await page.mouse.move(0, 0)
}

/** Tab through the page from the view switch: the order is top to bottom, and nothing is under the bar. */
async function checkTabWalk(page, where, open, engine) {
  if (open) await page.getByRole('button', { name: 'All inputs' }).click()
  await page.getByRole('tab', { name: 'Plan', exact: true }).focus()
  const stops = []
  for (let i = 0; i < 90; i++) {
    await page.keyboard.press('Tab')
    await page.waitForTimeout(25)
    const stop = await page.evaluate(() => {
      const el = document.activeElement
      if (!el || el === document.body) return null
      const r = el.getBoundingClientRect()
      const bar = document.querySelector('[class*="leversBar"]')
      const header = document.querySelector('header')
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      const covered = hit !== null && !el.contains(hit) && !hit.contains(el)
      return {
        name: (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 40),
        y: r.top + window.scrollY,
        covered,
        inBar: bar?.contains(el) ?? false,
        columnId: (() => {
          const col = el.closest('[class*="detailColumn"], [class*="columns"] > *')
          return col ? [...document.querySelectorAll('[class*="detailColumn"], [class*="columns"] > *')].indexOf(col) : -1
        })(),
        underHeader: r.top < header.getBoundingClientRect().bottom - 1,
        inView: r.bottom > 0 && r.top < window.innerHeight,
      }
    })
    if (!stop) break
    stops.push(stop)
  }
  check(where, `(l) Tab from the view switch reaches the scenario tabs first${open ? ' (inputs open)' : ''}`, stops[0]?.name.startsWith('Path'), `it reached "${stops[0]?.name}"`)
  // Safari's Tab does not stop at every kind of control, so it is held to fewer.
  const least = engine === 'webkit' ? (open ? 20 : 10) : open ? 40 : 18
  check(where, `(l) Tab visits the whole page (${stops.length} stops)`, stops.length >= least, `${stops.length} stops, at least ${least} wanted`)
  const covered = stops.filter((s) => (s.covered && !s.inBar) || (s.underHeader && !s.inBar))
  check(where, '(l) no control Tab reaches is under the bar or the header', covered.length === 0, covered.map((s) => `"${s.name}"`).join('; '))
  const hiddenOffscreen = stops.filter((s) => !s.inView)
  check(where, '(l) every control Tab reaches is scrolled into view', hiddenOffscreen.length === 0, hiddenOffscreen.map((s) => `"${s.name}"`).join('; '))
  // The detail charts and the panel are columns, read one column and then the next, so a stop may
  // go back up when it crosses from one column to another; anywhere else it only goes down.
  const outOfOrder = stops.findIndex((s, i) => {
    const prev = stops[i - 1]
    if (!prev || s.inBar || prev.inBar) return false
    if (s.columnId !== prev.columnId && s.columnId !== -1 && prev.columnId !== -1) return false
    return s.y < prev.y - 2
  })
  check(where, '(l) no Tab stop sits above the one before it, but across columns', outOfOrder === -1, `"${stops[outOfOrder]?.name}" is above "${stops[outOfOrder - 1]?.name}"`)
}

async function checkScreen(browser, screen, engine) {
  const where = `${engine} ${screen.name}`
  const { page, context } = await openPlan(browser, screen)
  await checkLayout(page, screen, where)
  if (screen.width >= 1280) {
    await checkSticky(page, where)
    await checkHover(page, where)
    await checkMenu(page, where)
    await checkPanel(page, where)
    await checkStars(page, where)
    await checkEdit(page, where)
  }
  await context.close()
}

async function checkTabs(browser, engine) {
  for (const open of [false, true]) {
    const { page, context } = await openPlan(browser, { width: 1440, height: 900 })
    await checkTabWalk(page, `${engine} 1440x900`, open, engine)
    await context.close()
  }
}

async function checkThemesAndZoom(browser, engine) {
  const light = await openPlan(browser, { width: 1440, height: 900 }, { scheme: 'light' })
  const m = await measure(light.page)
  check(`${engine} light`, 'the page lays out the same in the light theme', m.pageScrollWidth <= m.iw && m.bar.bottom <= m.ih)
  await light.context.close()
  const big = await openPlan(browser, { width: 1440, height: 900 }, { zoom: '150%' })
  const z = await measure(big.page)
  check(`${engine} 150% text`, 'large text does not push the page sideways', z.pageScrollWidth <= z.iw, `scrollWidth ${z.pageScrollWidth}, window ${z.iw}`)
  check(`${engine} 150% text`, 'large text leaves the chart some of the screen above the bar', z.bar.top > 300 || z.bar.height < z.ih * 0.4, `bar ${px(z.bar.top)} to ${px(z.bar.bottom)}`)
  await big.context.close()
}

/** 899px is the phone's layout and 900px the wide one, with no width in between that shows both. */
async function checkBreakpoint(browser, engine) {
  for (const [width, wide] of [[899, false], [900, true]]) {
    const { page, context } = await openPlan(browser, { width, height: 800 })
    const has = await page.evaluate(() => document.querySelector('[data-goals-plan-wide]') !== null)
    const m = await measure(page)
    check(`${engine} ${width}px`, wide ? 'has the wide page' : 'has the phone layout', has === wide)
    check(`${engine} ${width}px`, 'does not scroll sideways', m.pageScrollWidth <= m.iw, `scrollWidth ${m.pageScrollWidth}`)
    await context.close()
  }
}

/** An iPad on its side takes the wide page, on a touch screen: vertical swipes on the chart must reach the page. */
async function checkTouch(browser, engine) {
  const { page, context } = await openPlan(browser, { width: 1133, height: 744 }, { touch: true })
  const action = await page.evaluate(() => getComputedStyle(document.querySelector('[class*="hero"] svg')).touchAction)
  check(`${engine} touch`, 'the chart leaves vertical swipes to the page', action === 'pan-y', `touch-action: ${action}`)
  await context.close()
}

async function checkOtherViews(browser, engine) {
  const { page, context } = await openPlan(browser, { width: 1440, height: 900 })
  for (const name of ['Progress', 'Assumptions']) {
    await page.getByRole('tab', { name, exact: true }).click()
    await page.waitForTimeout(500)
    const wide = await page.evaluate(() => document.querySelector('[data-goals-plan-wide]') !== null)
    const width = await page.evaluate(() => document.querySelector('main')?.getBoundingClientRect().width ?? 0)
    check(`${engine} ${name}`, 'keeps the narrower page it was laid out for', !wide && width < 1000, `main is ${px(width)}`)
  }
  await context.close()
}

async function main() {
  if (await answers()) throw new Error(`Something already answers on ${BASE}; set CAPTURE_PORT to a free port.`)
  const dev = startDev()
  try {
    await waitForServer()
    const playwright = await import('playwright')
    for (const engine of ENGINES) {
      console.log(`\n${engine}`)
      const browser = await playwright[engine].launch()
      try {
        for (const screen of SCREENS) await checkScreen(browser, screen, engine)
        await checkTabs(browser, engine)
        await checkThemesAndZoom(browser, engine)
        await checkBreakpoint(browser, engine)
        await checkTouch(browser, engine)
        await checkOtherViews(browser, engine)
      } finally {
        await browser.close()
      }
    }
  } finally {
    stopDev(dev)
  }
  console.log(failures.length === 0 ? '\nAll checks passed.' : `\n${failures.length} check(s) failed:\n${failures.map((f) => ` - ${f}`).join('\n')}`)
  process.exit(failures.length === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
