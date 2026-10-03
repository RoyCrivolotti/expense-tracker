#!/usr/bin/env node
/**
 * Playwright check of the Goals Plan page on a wide screen, on the demo instance: one column with
 * no scroll of its own, the levers bar in reach (held to the bottom edge while its place is below
 * the fold, under the header once scrolled past), the inputs panel folding in and out, the
 * scenario menu, the stars that move an input to the bar and back, the order Tab goes in and that
 * nothing it reaches is under the bar, the question asked before leaving Goals with an unsaved edit,
 * the Years to milestone table (`ONLY=milestone-table` runs just that) and its timeline (`ONLY=milestone-timeline`).
 *
 * jsdom lays nothing out, so the unit tests cannot say any of this. Manual, like
 * verify:goals-nav: it needs a browser and takes a few minutes, so it is not part of
 * `npm run verify` or CI.
 *
 * Starts its own dev server on CAPTURE_PORT (5173 unless set), with DOCS_CAPTURE=1 so it has the
 * seeded demo data and nothing real. `ENGINES=chromium,webkit` (the default is chromium) also
 * runs it in Safari's engine, and `ONLY=touch-targets`, `ONLY=lever-focus` or `ONLY=toast` runs just that group (a minute or two).
 * Exits 1 and says what was measured if anything fails.
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
  { name: '1440x780', width: 1440, height: 780 },
  { name: '1440x900', width: 1440, height: 900 },
  { name: '1728x1117', width: 1728, height: 1117 },
  { name: '1920x1080', width: 1920, height: 1080 },
]

/** The width from which the five levers and the result are one row (planDesktop.module.css). */
const ONE_ROW_FROM = 1200

/**
 * The screen from which the bar is also held to the bottom edge while its place is below the fold
 * (planDesktop.module.css: 75rem wide and 50rem tall). A shorter screen would have the bar over
 * the chart's axis and the legend that carries its values.
 */
const HELD_FROM = { width: 1200, height: 800 }

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
      // The chart's legend, which carries its values on this layout, is the last of the hero to clear.
      legendBottom: box(document.querySelector('[data-goals-plan-wide] ul[class*="chips"]'))?.bottom ?? 0,
      // How much of the years-to-milestone table is out of sight to the right of its card.
      milestoneHidden: (() => {
        const scroller = document.querySelector('[data-goals-plan-wide] [class*="milestoneScroll"]')
        return scroller ? scroller.scrollWidth - scroller.clientWidth : 0
      })(),
      barPosition: bar ? getComputedStyle(bar).position : null,
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
  check(where, '(d) every milestone column of the years-to-milestone table is in sight', m.milestoneHidden <= 1, `${px(m.milestoneHidden)} scrolled out of sight`)
  if (screen.width >= 1250) {
    // The five levers and the result block, which has a label of its own.
    const row = new Set(m.labelTops)
    check(where, '(e) the five levers and the result are on one row', row.size === 1 && m.labelTops.length === 6, `tops ${m.labelTops.join(', ')}`)
  }
  if (screen.width < ONE_ROW_FROM) {
    check(where, '(g) below 75rem the bar goes by with the page instead of sticking over it', m.barPosition === 'static', `position ${m.barPosition}`)
  }
  if (screen.width >= HELD_FROM.width && screen.height >= HELD_FROM.height) {
    check(where, '(f) the bar is on screen on first load, held to the bottom edge', m.bar.bottom <= m.ih + 0.5 && m.bar.top >= 0, `bar ${px(m.bar.top)} to ${px(m.bar.bottom)} in ${m.ih}px`)
    check(where, '(f) the bar is not so tall it leaves little of the chart', m.bar.height < 140, px(m.bar.height))
    check(where, '(f) held to the bottom edge, the bar does not cover the chart or its legend', m.bar.top >= m.legendBottom, `bar top ${px(m.bar.top)}, legend ends ${px(m.legendBottom)}`)
  } else if (screen.width >= ONE_ROW_FROM) {
    check(where, '(f) on a shorter screen the bar stays in the page, so it does not cover the chart', m.barBottom === 'auto' && m.bar.top >= m.legendBottom, `bar bottom ${m.barBottom}, bar top ${px(m.bar.top)}, legend ends ${px(m.legendBottom)}`)
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

  // Focus moving about inside the stuck bar is not a reason to scroll: its controls are on screen.
  // Safari scrolled the page by the bar's height on each, taking the bar's place as covered by itself.
  const monthly = page.getByRole('textbox', { name: 'Monthly investing', exact: true })
  await monthly.focus()
  const before = await page.evaluate(() => window.scrollY)
  // Two Tabs reach the real return and its slider; a third and later would leave the bar.
  for (let i = 0; i < 2; i++) await page.keyboard.press('Tab')
  await page.waitForTimeout(150)
  const after = await page.evaluate(() => ({
    y: window.scrollY,
    inBar: document.querySelector('[class*="leversBar"]').contains(document.activeElement),
  }))
  check(where, '(g) Tab inside the stuck bar stays in the bar', after.inBar)
  check(where, '(g) Tab inside the stuck bar does not scroll the page', near(after.y, before, 1), `scrolled from ${before} to ${after.y}`)
  await page.evaluate(() => document.activeElement?.blur())
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
  check(where, '(m) a star says what it does when the pointer rests on it', (await star.getAttribute('title')) === 'Add House price to the bar')
  const hit = await star.evaluate((el) => Number.parseFloat(getComputedStyle(el, '::after').width))
  check(where, '(m) the area that takes a click on a star is 24px wide', near(hit, 24, 1), px(hit))
  const offCentre = await star.evaluate((el) => {
    const label = el.parentElement.querySelector('label, [class*="label"]')
    const range = document.createRange()
    range.selectNodeContents(label)
    const line = range.getClientRects()[0]
    const s = el.getBoundingClientRect()
    return s.top + s.height / 2 - (line.top + line.height / 2)
  })
  check(where, "(m) the star is on the middle of its label's first line", Math.abs(offCentre) <= 1, px(offCentre))
  await star.click()
  await page.waitForTimeout(300)
  check(where, '(m) starring an input puts it in the bar, which is full again', (await count()) === 5 && (await bar.getByLabel('House price', { exact: true }).count()) === 1)
  const live = await page.getByRole('button', { name: /^Add .* to the bar$/ }).evaluateAll((els) => els.filter((e) => !e.disabled).length)
  check(where, '(m) a full bar leaves no star open to press', live === 0, `${live} open`)

  await page.getByRole('button', { name: 'Reset to defaults' }).click()
  await page.waitForTimeout(300)
  check(where, '(m) Reset puts the five back', (await count()) === 5 && (await bar.getByLabel('Horizon (years)', { exact: true }).count()) === 1)

  // The panel is still open, with the five: taking one out brings "Reset to defaults" in, and
  // nothing under its row may move for it.
  const columnsTop = () => page.locator('[class*="columns"]').first().evaluate((el) => el.getBoundingClientRect().top)
  const restingTop = await columnsTop()
  // A click at the star's centre, not locator.click(): that scrolls the element clear of the page's
  // scroll padding first, which in WebKit moves the page for a star of the stuck bar (a person with
  // a mouse does not scroll), and the columns would then read as having moved.
  const horizonStar = await page.getByRole('button', { name: 'Remove Horizon from the bar' }).boundingBox()
  await page.mouse.click(horizonStar.x + horizonStar.width / 2, horizonStar.y + horizonStar.height / 2)
  await page.waitForTimeout(300)
  const movedTop = await columnsTop()
  check(where, '(m) the columns do not move when "Reset to defaults" comes in', near(movedTop, restingTop, 0.5), `${px(movedTop)} against ${px(restingTop)}`)
  await page.getByRole('button', { name: 'Reset to defaults' }).click()
  await page.waitForTimeout(300)
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
  const slider = page.getByRole('slider', { name: 'Real return (%/yr, after inflation)' })
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
  if (open) {
    await page.getByRole('button', { name: 'All inputs' }).click()
    // The panel scrolls itself into view a frame or two after it opens. Focusing the first tab
    // before that left the page where the panel put it, which read as a control hidden above.
    await page.getByRole('region', { name: 'All inputs' }).waitFor()
    await settled(page)
  }
  await page.getByRole('tab', { name: 'Plan', exact: true }).focus()
  const stops = []
  for (let i = 0; i < 90; i++) {
    await page.keyboard.press('Tab')
    await page.waitForTimeout(25)
    // Until the page has stopped scrolling to the control: a slow frame put the sample before the
    // scroll, which read as a control left below the fold.
    await settled(page)
    const stop = await page.evaluate(() => {
      const el = document.activeElement
      if (!el || el === document.body) return null
      // Each control is visited once: Tab past the last one wraps to the first in some engines, and
      // that stop is read before the page has scrolled back up to it, which says nothing about the page.
      const seen = (window.__tabWalkSeen ??= new WeakSet())
      if (seen.has(el)) return null
      seen.add(el)
      const r = el.getBoundingClientRect()
      const bar = document.querySelector('[class*="leversBar"]')
      const header = document.querySelector('header')
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      const covered = hit !== null && !el.contains(hit) && !hit.contains(el)
      return {
        name: (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 40),
        // The middle, not the top: two controls in one row can differ by a few pixels in height with a
        // font's metrics (the scenario menu button is 36px and Duplicate is not), and neither is above the other.
        y: r.top + r.height / 2 + window.scrollY,
        top: Math.round(r.top),
        scrollY: Math.round(window.scrollY),
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
  const where_ = (s) => `"${s.name}" (stop ${stops.indexOf(s) + 1} of ${stops.length}, top ${s.top}px with the page at ${s.scrollY}px)`
  check(where, '(l) no control Tab reaches is under the bar or the header', covered.length === 0, covered.map(where_).join('; '))
  const hiddenOffscreen = stops.filter((s) => !s.inView)
  check(where, '(l) every control Tab reaches is scrolled into view', hiddenOffscreen.length === 0, hiddenOffscreen.map(where_).join('; '))
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

/**
 * The bar's own controls and the panel it opens, with the page scrolled to the top (the bar held to
 * the bottom edge on a tall enough screen). The page's scroll padding is what keeps a focused
 * control clear of the bar, and it must not treat the bar's own controls as hidden behind it
 * (Chromium scrolled the page 366px for a star on 1280x800), nor leave the panel under the bar
 * when it is opened from the keyboard (the padding is lifted while focus is in the bar).
 */
async function checkBarFocus(page, where) {
  await scrollTo(page, 0)
  // A plan with a house has a second figure in the bar (the invested part of the net worth), so it
  // is the taller bar: it must still clear the legend where it is held to the bottom edge.
  const size = page.viewportSize()
  if (size.width >= HELD_FROM.width && size.height >= HELD_FROM.height) {
    await page.getByRole('tab', { name: /Path B/ }).click()
    await page.waitForTimeout(500)
    const m = await measure(page)
    check(where, '(n) with a house in the plan the held bar, a line taller, still clears the legend', m.bar.top >= m.legendBottom, `bar top ${px(m.bar.top)}, legend ends ${px(m.legendBottom)}`)
  }
  const bar = page.locator('[class*="leversBar"]')
  const scrollY = () => page.evaluate(() => Math.round(window.scrollY))

  // Only where the bar is held to the bottom edge is a star on screen at the top of the page to press.
  const view = page.viewportSize()
  if (view.width >= HELD_FROM.width && view.height >= HELD_FROM.height) {
    const star = bar.getByRole('button', { name: /^Remove .* from the bar$/ }).first()
    const starBox = await star.boundingBox()
    const before = await scrollY()
    await page.mouse.click(starBox.x + starBox.width / 2, starBox.y + starBox.height / 2)
    await page.waitForTimeout(400)
    const afterStar = await scrollY()
    check(where, '(n) pressing a star in the bar does not scroll the page', near(afterStar, before, 1), `scrolled from ${before} to ${afterStar}`)
  }

  const open = async (how) => {
    await scrollTo(page, 0)
    const button = page.getByRole('button', { name: 'All inputs' })
    if (how === 'mouse') {
      // Below the fold on a screen the bar is not held on: a click outside the window would hit nothing.
      await button.scrollIntoViewIfNeeded()
      const box = await button.boundingBox()
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    } else {
      await button.focus()
      await page.keyboard.press('Enter')
    }
    const region = page.getByRole('region', { name: 'All inputs' })
    await region.waitFor({ timeout: 5000 })
    await page.waitForTimeout(900)
    const m = await page.evaluate(() => {
      const barBox = document.querySelector('[class*="leversBar"]').getBoundingClientRect()
      const panel = document.querySelector('[role="region"][aria-label="All inputs"]').getBoundingClientRect()
      return { barBottom: Math.round(barBox.bottom), panelTop: Math.round(panel.top), barTop: Math.round(barBox.top) }
    })
    // Only where the bar is over the panel's place (stuck under the header) is there anything to be under.
    const clear = m.barTop > 100 || m.panelTop >= m.barBottom - 0.5
    check(where, `(n) the panel opened with the ${how} is not left under the bar`, clear, `panel top ${m.panelTop}, bar ${m.barTop} to ${m.barBottom}`)
    await button.focus()
    await page.keyboard.press('Enter')
    await region.waitFor({ state: 'detached', timeout: 5000 })
  }
  await open('mouse')
  await open('keyboard')
  await scrollTo(page, 0)
}

/**
 * Nothing moves under the pointer or the keyboard: the first edit adds Unsaved changes, Discard and
 * Save to the scenario row, and pointing at the chart fills the legend with values and, at a
 * purchase year, shows a breakdown. Each used to push the page down (the row wrapped by 40px at
 * 1280px, the breakdown added 144px, the legend wrapped and slid under the bar held at the bottom).
 */
async function checkStability(page, where, held) {
  const geometry = () =>
    page.evaluate(() => {
      const row = document.querySelector('[class*="scenarioRow"]').getBoundingClientRect()
      const legend = document.querySelector('[data-goals-plan-wide] ul[class*="chips"]').getBoundingClientRect()
      const bar = document.querySelector('[data-levers-bar]').getBoundingClientRect()
      return { rowHeight: row.height, rowBottom: row.bottom + scrollY, legendBottom: legend.bottom + scrollY, barTop: bar.top + scrollY, docHeight: document.documentElement.scrollHeight, scrolled: scrollY }
    })
  const rest = await geometry()
  if (held) check(where, '(r) at rest the legend clears the bar held at the bottom', rest.legendBottom <= rest.barTop + 0.5, `legend ends ${px(rest.legendBottom)}, bar starts ${px(rest.barTop)}`)

  const svg = page.locator('[data-goals-plan-wide] [role="img"]').first()
  const box = await svg.boundingBox()
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5)
  await page.waitForTimeout(250)
  const pointed = await geometry()
  check(where, '(r) pointing at the chart does not move the page', near(pointed.docHeight, rest.docHeight, 1) && near(pointed.legendBottom, rest.legendBottom, 1), `page ${rest.docHeight} to ${pointed.docHeight}, legend ${px(rest.legendBottom)} to ${px(pointed.legendBottom)}`)
  await page.mouse.move(0, 0)

  const monthly = page.getByLabel('Monthly investing', { exact: true })
  await monthly.fill('900')
  await monthly.press('Enter')
  await page.getByText('Unsaved changes').waitFor({ state: 'attached', timeout: 5000 })
  await page.waitForTimeout(300)
  const edited = await geometry()
  check(where, '(r) the first edit keeps the scenario row one line', near(edited.rowHeight, rest.rowHeight, 1) && near(edited.rowBottom, rest.rowBottom, 1), `row ${px(rest.rowHeight)} to ${px(edited.rowHeight)}`)
  if (held) check(where, '(r) with an edit the legend still clears the bar', edited.legendBottom <= edited.barTop + 0.5, `legend ends ${px(edited.legendBottom)}, bar starts ${px(edited.barTop)}`)
  await page.getByRole('button', { name: 'Discard changes' }).click()
  await page.waitForTimeout(300)

  // Path C buys its house in year 5: pointing at that year lists where the money went.
  await page.getByRole('tab', { name: /Path C/ }).click()
  await page.waitForTimeout(400)
  await page.evaluate(() => window.scrollTo(0, 0))
  const c = await geometry()
  const cBox = await svg.boundingBox()
  let shown = false
  let grew = 0
  for (let f = 0.12; f <= 0.4 && !shown; f += 0.01) {
    await page.mouse.move(cBox.x + cBox.width * f, cBox.y + cBox.height * 0.5)
    await page.waitForTimeout(80)
    shown = (await page.getByText('Down payment + fees').count()) > 0
  }
  if (shown) grew = (await geometry()).docHeight - c.docHeight
  check(where, '(r) the purchase breakdown shows at the purchase year', shown)
  check(where, '(r) the breakdown takes no room from the page', shown && Math.abs(grew) <= 1, `page grew ${grew}px`)
  if (shown) {
    const hidden = await page.evaluate(() => {
      const el = document.querySelector('[class*="floater"]')
      return el ? getComputedStyle(el).pointerEvents : 'none-found'
    })
    check(where, '(r) the breakdown lets the pointer through to the chart', hidden === 'none', hidden)
  }
  await page.mouse.move(0, 0)
}

/**
 * Hide the saved line of a scenario that is being edited, then drop the edits: the scenario is
 * drawn as the editing line again, and the legend must not also list it dimmed.
 */
async function checkLegendAfterDiscard(page, where) {
  const monthly = page.getByLabel('Monthly investing', { exact: true })
  await monthly.fill('900')
  await monthly.press('Enter')
  await page.getByText('Unsaved changes').waitFor({ timeout: 5000 })
  // Not a mouse click: after typing in the bar, Safari's engine has the page scrolled so that the
  // bar, held to the bottom edge, is over this chip at 1280x800, and the click would land on the bar.
  await page.getByRole('button', { name: /^Hide Path A: Invest only on chart$/ }).dispatchEvent('click')
  const shown = page.getByRole('button', { name: /^Show Path A: Invest only on chart$/ })
  await shown.waitFor({ timeout: 5000 })
  check(where, '(u) the saved line of an edited scenario can be hidden from the legend', (await shown.count()) === 1)
  await page.getByRole('button', { name: /^Discard changes$/ }).click()
  await page.waitForTimeout(400)
  const dimmed = await page.getByRole('button', { name: /^Show Path A: Invest only on chart$/ }).count()
  const hide = await page.getByRole('button', { name: /^Hide Path A: Invest only on chart$/ }).count()
  check(where, '(u) after Discard the legend has no dimmed saved chip beside the editing one', dimmed === 0 && hide === 0, `${dimmed} dimmed, ${hide} with a hide button`)
}

/**
 * A session that goes read-only in the middle of an edit: the edit stays, the tab stops saying
 * Edited (nothing can be saved), and one note on a line of its own under the tabs says what the
 * edit is worth.
 */
async function checkReadOnlyEdit(page, where) {
  const monthly = page.getByLabel('Monthly investing', { exact: true })
  await monthly.fill('900')
  await monthly.press('Enter')
  await page.getByText('Unsaved changes').waitFor({ timeout: 5000 })
  await page.evaluate(() => window.dispatchEvent(new Event('offline')))
  const note = page.getByText(/these changes cannot be saved/)
  await note.waitFor({ timeout: 5000 })
  await page.waitForTimeout(300)
  const m = await page.evaluate(() => {
    const rect = (el) => el.getBoundingClientRect()
    const note = [...document.querySelectorAll('p')].find((p) => /these changes cannot be saved/.test(p.textContent))
    const tabs = document.querySelector('[role="tablist"][aria-label="Scenarios"]')
    const n = rect(note)
    return {
      noteTop: n.top,
      noteRight: n.right,
      noteVisible: n.width > 0 && n.height > 0 && getComputedStyle(note).visibility === 'visible',
      tabsBottom: rect(tabs).bottom,
      edited: [...tabs.querySelectorAll('[role="tab"]')].some((t) => /Edited/.test(t.textContent)),
      scrollWidth: document.documentElement.scrollWidth,
      iw: window.innerWidth,
    }
  })
  check(where, '(v) read-only with an edit: the note is on screen under the scenario tabs', m.noteVisible && m.noteTop >= m.tabsBottom - 0.5 && m.noteRight <= m.iw, JSON.stringify(m))
  check(where, '(v) read-only with an edit: no tab says Edited, and the page does not scroll sideways', !m.edited && m.scrollWidth <= m.iw, JSON.stringify(m))
  check(where, '(v) read-only with an edit: the lever keeps the typed value', (await monthly.inputValue()) === '900')
  await page.getByRole('tab', { name: /^Path B/ }).click()
  const sheet = page.getByRole('alertdialog')
  await sheet.waitFor({ timeout: 5000 })
  check(where, '(v) read-only with an edit: the discard question does not offer to save', !/Save changes first/.test(await sheet.innerText()))
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
  if (screen.width >= 1280) {
    // A page of its own: the star press takes a lever out of the bar, which the checks above expect five of.
    const own = await openPlan(browser, screen)
    await checkBarFocus(own.page, where)
    await own.context.close()
    const calm = await openPlan(browser, screen)
    await checkStability(calm.page, where, screen.width >= HELD_FROM.width && screen.height >= HELD_FROM.height)
    await calm.context.close()
    const legend = await openPlan(browser, screen)
    await checkLegendAfterDiscard(legend.page, where)
    await legend.context.close()
    const readOnly = await openPlan(browser, screen)
    await checkReadOnlyEdit(readOnly.page, where)
    await readOnly.context.close()
  }
}

async function checkTabs(browser, engine) {
  for (const open of [false, true]) {
    const { page, context } = await openPlan(browser, { width: 1440, height: 900 })
    await checkTabWalk(page, `${engine} 1440x900`, open, engine)
    await context.close()
  }
}

/** The screens a held bar has to work on (planDesktop.module.css: from 1200x800), narrowest first. */
const LEVER_SCREENS = [
  { width: 1200, height: 800 },
  { width: 1280, height: 800 },
  { width: 1440, height: 800 },
]

/** The text fields in the bar and a value to type over each, so the figure is edited and not only focused. */
const LEVER_FIELDS = [
  { label: 'Starting invested', typed: '2000000' },
  { label: 'Monthly investing', typed: '1500' },
  { label: 'Horizon (years)', typed: '25' },
  { label: 'Real return (%/yr, after inflation)', typed: '6' },
]

/** Where the page is and how the bar sits against the legend, for the (z1) checks. */
function leverState(page) {
  return page.evaluate(() => {
    const bar = document.querySelector('[data-levers-bar]').getBoundingClientRect()
    const legend = document.querySelector('[data-goals-plan-wide] ul[class*="chips"]').getBoundingClientRect()
    return { y: Math.round(window.scrollY), barTop: bar.top, barHeight: bar.height, legendBottom: legend.bottom, active: document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.tagName }
  })
}

/** Puts the page back to rest between two flows: nothing typed, nothing focused, scrolled to the top. */
async function resetLevers(page) {
  await page.evaluate(() => document.activeElement?.blur())
  const discard = page.getByRole('button', { name: 'Discard changes' })
  if (await discard.count()) await discard.click()
  await page.waitForTimeout(250)
  await scrollTo(page, 0)
}

/**
 * (z1) Focusing or typing in a lever that is on screen in the held bar does not move the page, and
 * the legend is still clear of the bar afterwards. Chromium scrolled the page 309px for a click on
 * the unit beside a figure (it reveals a field by its place in the page, not where the bar holds
 * it), and a 15-character net worth in the result widened its column until the five levers
 * wrapped onto a second row at 1200px, which put the held bar over the legend.
 */
async function checkLeverFocus(browser, engine) {
  for (const screen of LEVER_SCREENS) {
    const where = `${engine} ${screen.width}x${screen.height}`
    const { page, context } = await openPlan(browser, screen)
    await scrollTo(page, 0)
    const rest = await leverState(page)
    const clear = (s) => s.legendBottom <= s.barTop + 0.5
    const detail = (s) => `page at ${s.y}px, bar ${px(s.barTop)} to ${px(s.barTop + s.barHeight)}, legend ends ${px(s.legendBottom)}`
    check(where, '(z1) at rest the bar is one row and the legend is clear of it', clear(rest) && rest.barHeight < 140, detail(rest))

    for (const { label, typed } of LEVER_FIELDS) {
      const field = page.getByRole('textbox', { name: label, exact: true })
      const spots = await field.evaluate((el) => {
        const r = el.getBoundingClientRect()
        const u = el.parentElement.querySelector('[class*="leverUnit"]').getBoundingClientRect()
        return { digits: [r.x + r.width / 2, r.y + r.height / 2], unit: [u.x + u.width / 2, u.y + u.height / 2] }
      })
      for (const how of ['digits', 'unit', 'fill']) {
        if (how === 'fill') {
          await field.fill(typed)
        } else {
          await page.mouse.click(...spots[how])
          await page.keyboard.press('ControlOrMeta+a')
          await page.keyboard.type(typed, { delay: 30 })
        }
        await page.keyboard.press('Enter')
        await page.waitForTimeout(350)
        const after = await leverState(page)
        check(where, `(z1) typing ${typed} in ${label} (${how === 'fill' ? 'filled' : `a click on its ${how}`}) does not move the page`, near(after.y, 0, 1), detail(after))
        check(where, `(z1) after typing in ${label} the legend is still clear of the bar`, clear(after) && near(after.barHeight, rest.barHeight, 1), detail(after))
        await resetLevers(page)
      }
    }

    // The sliders: a press on the track, the arrow keys, and Tab from the figure beside it.
    for (const name of ['Real return (%/yr, after inflation)', 'Purchase year']) {
      const slider = page.getByRole('slider', { name, exact: true }).first()
      const box = await slider.boundingBox()
      await page.mouse.click(box.x + box.width * 0.3, box.y + box.height / 2)
      await page.keyboard.press('ArrowRight')
      await page.keyboard.press('ArrowRight')
      await page.waitForTimeout(350)
      const after = await leverState(page)
      check(where, `(z1) a press and the arrow keys on the ${name} slider do not move the page`, near(after.y, 0, 1) && clear(after), detail(after))
      await resetLevers(page)
    }
    const real = page.getByRole('textbox', { name: 'Real return (%/yr, after inflation)', exact: true })
    const realBox = await real.boundingBox()
    await page.mouse.click(realBox.x + realBox.width / 2, realBox.y + realBox.height / 2)
    await page.keyboard.press('Tab')
    await page.waitForTimeout(350)
    const tabbed = await leverState(page)
    check(where, '(z1) Tab from a figure to the slider beside it does not move the page', near(tabbed.y, 0, 1) && clear(tabbed), detail(tabbed))
    await resetLevers(page)

    // A figure the result has no room for: it is the result that takes the room, not the levers.
    const wide = page.getByRole('textbox', { name: 'Monthly investing', exact: true })
    await wide.fill('5000000')
    await wide.press('Enter')
    await page.waitForTimeout(400)
    const grown = await leverState(page)
    check(where, '(z1) a 15-character net worth leaves the bar one row high and the legend clear', near(grown.barHeight, rest.barHeight, 1) && clear(grown), detail(grown))
    await resetLevers(page)

    // A star pressed from the keyboard hands focus to the next one, which must not scroll the page.
    const star = page.getByRole('button', { name: 'Remove Monthly investing from the bar' })
    await star.evaluate((el) => el.focus({ preventScroll: true }))
    await page.keyboard.press('Enter')
    await page.waitForTimeout(500)
    const starred = await leverState(page)
    check(where, '(z1) pressing a star with the keyboard does not move the page', near(starred.y, 0, 1) && clear(starred), detail(starred))
    await context.close()
  }

  // The bar is not held on a 768px screen (it needs 800): it stays in the page, 797px down, and
  // someone scrolls to it. Once it is on screen the same holds as above: a click on a figure or
  // its unit and typing leave the page where it is, with the legend clear of the bar.
  const short = { width: 1366, height: 768 }
  const { page, context } = await openPlan(browser, short)
  await scrollTo(page, 0)
  const m = await measure(page)
  check(`${engine} 1366x768`, '(z1) on a 768px screen the bar is not held to the bottom edge, and the legend is clear of it', m.barBottom === 'auto' && m.bar.top >= m.legendBottom, `bar bottom ${m.barBottom}, bar top ${px(m.bar.top)}, legend ends ${px(m.legendBottom)}`)
  for (const how of ['digits', 'unit']) {
    const at = await scrollTo(page, 200)
    const field = page.getByRole('textbox', { name: 'Monthly investing', exact: true })
    const spot = await field.evaluate((el, target) => {
      const box = target === 'unit' ? el.parentElement.querySelector('[class*="leverUnit"]') : el
      const r = box.getBoundingClientRect()
      return [r.x + r.width / 2, r.y + r.height / 2]
    }, how)
    await page.mouse.click(...spot)
    await page.keyboard.press('ControlOrMeta+a')
    await page.keyboard.type('1500', { delay: 30 })
    await page.keyboard.press('Enter')
    await page.waitForTimeout(350)
    const after = await leverState(page)
    check(`${engine} 1366x768`, `(z1) typing in a lever there (a click on its ${how}) does not move the page, and the legend is clear of the bar`, near(after.y, at, 1) && after.legendBottom <= after.barTop + 0.5, `page ${at} to ${after.y}px, bar ${px(after.barTop)}, legend ends ${px(after.legendBottom)}`)
    await resetLevers(page)
  }
  await context.close()
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

/**
 * The lines and dots on the hero chart are readable against the card in both themes: 3:1 is the
 * floor for a graphical object, and the pale presets (amber, lime, cyan, emerald) were under it in
 * the light theme. Read from what the browser drew, so it covers light-dark() as well as hex.
 */
async function checkLineColours(browser, engine) {
  for (const scheme of ['light', 'dark']) {
    const { page, context } = await openPlan(browser, { width: 1440, height: 900 }, { scheme })
    const found = await page.evaluate(() => {
      const rgb = (css) => {
        const c = document.createElement('canvas')
        c.width = c.height = 1
        const x = c.getContext('2d', { willReadFrequently: true })
        x.fillStyle = '#000'
        x.fillStyle = css
        x.fillRect(0, 0, 1, 1)
        return [...x.getImageData(0, 0, 1, 1).data].slice(0, 3)
      }
      const lum = ([r, g, b]) => {
        const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
      }
      const ratio = (a, b) => {
        const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
        return (hi + 0.05) / (lo + 0.05)
      }
      const svg = document.querySelector('[data-goals-plan-wide] svg[role="img"]')
      const card = svg.closest('[class*="card" i]')
      const ground = rgb(getComputedStyle(card).backgroundColor)
      const lines = [...svg.querySelectorAll('path')]
        .map((p) => getComputedStyle(p))
        .filter((cs) => cs.fill === 'none' && parseFloat(cs.strokeWidth) >= 2 && cs.stroke !== 'none')
        .map((cs) => ratio(rgb(cs.stroke), ground))
      const dots = [...svg.querySelectorAll('circle')].map((c) => ratio(rgb(getComputedStyle(c).fill), ground))
      return { lines, dots, ground }
    })
    const worstLine = Math.min(...found.lines)
    const worstDot = found.dots.length ? Math.min(...found.dots) : Infinity
    check(`${engine} ${scheme}`, '(s) every line on the hero chart has 3:1 against the card', found.lines.length >= 3 && worstLine >= 2.95, `${found.lines.length} lines, worst ${worstLine.toFixed(2)}:1 on ${found.ground}`)
    check(`${engine} ${scheme}`, '(s) the check-in dots have 3:1 against the card', found.dots.length > 0 && worstDot >= 2.95, `${found.dots.length} dots, worst ${worstDot.toFixed(2)}:1`)
    await context.close()
  }
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

/** What a touch target is held to (44px), less what rounding takes. */
const FINGER = 43.5

/** The boxes of every element the selector finds, as heights and widths, in the page. */
function sizesOf(page, selector) {
  return page.evaluate(
    (sel) =>
      [...document.querySelectorAll(sel)]
        .filter((el) => el.getBoundingClientRect().width > 0)
        .map((el) => {
          const r = el.getBoundingClientRect()
          return { name: (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 30), w: r.width, h: r.height }
        }),
    selector,
  )
}

/** Fails with the names of the ones under 44px, or says there were none to measure. */
async function checkSizes(page, where, what, selector, { w = false, min = FINGER } = {}) {
  const found = await sizesOf(page, selector)
  const small = found.filter((s) => s.h < min || (w && s.w < min))
  check(where, `${what} (${found.length} measured)`, found.length > 0 && small.length === 0, found.length === 0 ? `nothing matches ${selector}` : small.map((s) => `${s.name} ${px(s.w)}x${px(s.h)}`).join('; '))
}

/**
 * The wide Plan page on an iPad's screen (a coarse pointer, 1032px wide): every control a finger
 * uses is 44px, or has a tap area that is, and the way the stars, the bar and the toast behave
 * with it. The phone's layout and a fine pointer keep their sizes.
 */
async function checkTouchTargets(browser, engine) {
  const where = `${engine} iPad 1032`
  const { page, context } = await openPlan(browser, { width: 1032, height: 1376 }, { touch: true })
  check(where, '(t) the emulated screen has a coarse pointer', await page.evaluate(() => matchMedia('(pointer: coarse)').matches))

  // The bar: the whole row of a lever's digits is 44px and the slider has a 44px box that takes
  // 28px of the layout, and the bar is no taller for it than the result column beside the levers.
  await checkSizes(page, where, '(t) a lever\'s row of digits is 44px', '[class*="leverValue"]')
  await checkSizes(page, where, '(t) a slider in the bar has a 44px box', '[class*="leversBar"] input[type="range"]')
  const footprint = await page.evaluate(() => {
    const r = document.querySelector('[class*="leversBar"] input[type="range"]')
    const cs = getComputedStyle(r)
    return r.getBoundingClientRect().height + parseFloat(cs.marginTop) + parseFloat(cs.marginBottom)
  })
  check(where, '(t) a slider takes 28px of the layout, not 44', near(footprint, 28, 1), px(footprint))
  const reach = await page.evaluate(() => {
    const r = document.querySelector('[class*="leversBar"] input[type="range"]').getBoundingClientRect()
    const x = r.left + r.width / 4
    const range = (y) => document.elementFromPoint(x, y)?.matches('input[type="range"]') ?? false
    const label = document.querySelector('[class*="leversBar"] input[type="range"]').closest('[class*="leverTrack"]').previousElementSibling.getBoundingClientRect()
    const onDigits = document.elementFromPoint(label.left + 4, label.bottom - 3)
    return {
      above: range(r.top + r.height / 2 - 12),
      below: range(r.top + r.height / 2 + 18),
      digitsRow: onDigits?.closest('[class*="leverValue"]') !== null && !(onDigits instanceof HTMLInputElement && onDigits.type === 'range'),
    }
  })
  check(where, '(t) a press 12px above a slider\'s track and 18px below it is the slider\'s', reach.above && reach.below, JSON.stringify(reach))
  check(where, '(t) a press on the lower part of a lever\'s digits row is not the slider\'s', reach.digitsRow, JSON.stringify(reach))

  // The legend chips: the tap area reaches past the 26px chip.
  const chips = await page.evaluate(() =>
    [...document.querySelectorAll('[class*="chips"] button')].map((b) => {
      const r = b.getBoundingClientRect()
      const after = getComputedStyle(b, '::after')
      const above = document.elementFromPoint(r.left + r.width / 2, r.top - 7)
      return { h: r.height, hit: parseFloat(after.height), toggles: above !== null && b.contains(above) }
    }),
  )
  check(where, '(t) a legend chip is as tall as it was (26px) with a tap area of 44px', chips.length > 0 && chips.every((c) => near(c.h, 26.2, 1.5) && c.hit >= FINGER), JSON.stringify(chips.slice(0, 3)))
  check(where, '(t) a press 7px above the first line of chips is a chip\'s', chips.length > 0 && chips[0].toggles, JSON.stringify(chips[0]))

  // The save buttons, and the words beside Save while the scenario has no name.
  const monthly = page.getByLabel('Monthly investing', { exact: true })
  await monthly.fill('750')
  await monthly.press('Enter')
  await page.getByText('Unsaved changes').first().waitFor()
  await checkSizes(page, where, '(t) Save changes and Discard are 44px', '[role="group"][aria-label="Unsaved changes"] button')
  await page.getByRole('button', { name: 'Scenario options' }).click()
  const dialog = page.getByRole('dialog', { name: 'Scenario options' })
  await dialog.waitFor()
  await page.waitForTimeout(300)
  const menu = await page.evaluate(() => {
    const d = document.querySelector('[role="dialog"][aria-label="Scenario options"]')
    const swatches = [...d.querySelectorAll('[aria-label^="Use color"], [aria-label="Pick custom color"]')]
    const rects = swatches.map((s) => s.getBoundingClientRect())
    const first = swatches[0]
    const r = rects[0]
    const hit = getComputedStyle(first, '::after')
    const over = document.elementFromPoint(r.left + r.width / 2, r.top - 7)
    const under = document.elementFromPoint(r.left + r.width / 2, r.bottom + 7)
    const box = d.getBoundingClientRect()
    return {
      count: swatches.length,
      oneRow: new Set(rects.map((x) => Math.round(x.top))).size === 1,
      size: [r.width, r.height],
      hit: [parseFloat(hit.width), parseFloat(hit.height)],
      overIsSwatch: over === first || first.contains(over),
      underIsSwatch: under === first || first.contains(under),
      pitch: rects[1].left - rects[0].left,
      inside: box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight,
    }
  })
  check(where, '(t) the colour dots are 28px in one row, inside the window', menu.count === 9 && menu.oneRow && near(menu.size[0], 28, 0.5) && menu.inside, JSON.stringify(menu))
  check(where, '(t) a colour dot has a 36 by 44px tap area, with no overlap with the next', near(menu.hit[0], 36, 0.5) && near(menu.hit[1], 44, 0.5) && near(menu.pitch, 36, 0.5), JSON.stringify(menu))
  check(where, '(t) a press 7px above or below a colour dot is that dot\'s', menu.overIsSwatch && menu.underIsSwatch, JSON.stringify(menu))
  await checkSizes(page, where, '(t) the scenario menu\'s rows and name field are 44px', '[role="dialog"][aria-label="Scenario options"] button:not([aria-label^="Use color"]):not([aria-label="Pick custom color"]), [role="dialog"][aria-label="Scenario options"] input[type="text"]')
  // With no name the save says why, in words, next to the button.
  await page.getByLabel('Scenario name').fill('')
  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'detached' })
  const hint = page.getByText('Give the scenario a name to save it')
  check(where, '(t) with no name, the words say what Save needs', await hint.isVisible())
  const hintBox = await hint.boundingBox()
  check(where, '(t) the words are inside the window and the page does not scroll sideways', hintBox !== null && hintBox.x >= 0 && hintBox.x + hintBox.width <= 1032 && (await measure(page)).pageScrollWidth <= 1032, JSON.stringify(hintBox))
  check(where, '(t) Save changes is off and says why to a screen reader', (await page.getByRole('button', { name: 'Save changes' }).isDisabled()) && (await page.getByRole('button', { name: 'Save changes' }).evaluate((b) => b.getAttribute('aria-describedby') !== null)))
  await page.getByRole('button', { name: 'Discard changes' }).click()
  await page.waitForTimeout(300)

  // A star in the bar says what it did and gives the input back where it was.
  const labels = () => page.locator('[class*="leversBar"] [class*="leverLabel"]').allTextContents()
  const before = await labels()
  await page.getByRole('button', { name: 'Remove Real return from the bar' }).click()
  const toast = page.getByRole('status')
  await page.getByText('Removed Real return from the bar').waitFor({ timeout: 3000 })
  check(where, '(t) taking a star out says which input left, with Undo', /^Removed Real return from the bar\. Press Alt\+Z to undo\.Undo/.test((await toast.textContent()) ?? '') && (await labels()).length === before.length - 1)
  const undo = page.getByRole('button', { name: 'Undo' })
  check(where, '(t) the Undo button is 44px tall', (await undo.boundingBox()).height >= FINGER, px((await undo.boundingBox()).height))
  await undo.click()
  await page.waitForTimeout(300)
  check(where, '(t) Undo puts the input back where it was and takes the toast away', JSON.stringify(await labels()) === JSON.stringify(before) && (await page.getByRole('status').count()) === 0, JSON.stringify(await labels()))

  // The inputs panel.
  await page.getByRole('button', { name: 'All inputs' }).click()
  await page.getByRole('region', { name: 'All inputs' }).waitFor()
  await page.waitForTimeout(500)
  const panel = '[role="region"][aria-label="All inputs"]'
  await checkSizes(page, where, '(t) the steppers\' - and + buttons are 44px square', `${panel} [aria-label^="Decrease "], ${panel} [aria-label^="Increase "]`, { w: true })
  await checkSizes(page, where, '(t) the panel\'s fields are 44px', `${panel} input[type="text"]`)
  await checkSizes(page, where, '(t) the panel\'s sliders have a 44px box', `${panel} input[type="range"]`)
  const stars = await page.evaluate((sel) => {
    return [...document.querySelectorAll(`${sel} [class*="starrable"]`)].map((s) => {
      const star = s.querySelector('[data-star]')
      const label = s.querySelector('[class*="fieldLabel"]')
      const range = document.createRange()
      range.selectNodeContents(label)
      const line = range.getClientRects()[0]
      const r = star.getBoundingClientRect()
      return r.top + r.height / 2 - (line.top + line.height / 2)
    })
  }, panel)
  check(where, '(t) every star is on the middle of its label\'s first line, wrapped or not', stars.length > 5 && stars.every((d) => Math.abs(d) <= 1.5), JSON.stringify(stars))
  await page.getByRole('button', { name: '+ Add life event' }).scrollIntoViewIfNeeded()
  await checkSizes(page, where, '(t) + Add life event is 44px', 'button[class*="addLifeEventBtn"]')
  await page.getByRole('button', { name: '+ Add life event' }).click()
  await page.waitForTimeout(300)
  await checkSizes(page, where, '(t) the life event form\'s buttons and sign labels are 44px', '[class*="lifeEventActions"] button, [class*="lifeEventSignLabel"]')
  await page.getByLabel('Life event label').fill('Test event')
  await page.locator('[class*="lifeEventActions"] button').first().click()
  await page.waitForTimeout(300)
  await checkSizes(page, where, '(t) the life event\'s remove cross is 44px square', '[class*="lifeEventRemove"]', { w: true })
  await checkSizes(page, where, '(t) the help line under the page is 44px', 'summary')
  // Taking a star out brings Reset to defaults in, and the row it is in is already as tall as the button.
  await page.getByRole('button', { name: 'Remove Horizon from the bar' }).click()
  await page.waitForTimeout(300)
  const reset = page.getByRole('button', { name: 'Reset to defaults' })
  check(where, '(t) Reset to defaults is 44px in a row that is the same height', near((await reset.boundingBox()).height, 44, 0.5) && (await reset.evaluate((b) => Math.abs(b.parentElement.getBoundingClientRect().height - 44) <= 0.5)), px((await reset.boundingBox()).height))
  await context.close()

  // From 1376px a bar of one row is about as tall as its result column, so the lever rows cost no
  // height to speak of: the column is 94px now that its padding is tighter, and the levers 96px.
  const wide = await openPlan(browser, { width: 1376, height: 1032 }, { touch: true })
  const bar = await wide.page.evaluate(() => ({
    levers: document.querySelector('[class*="leverGrid"]').getBoundingClientRect().height,
    side: document.querySelector('[class*="leverSide"]').getBoundingClientRect().height,
  }))
  check(`${engine} iPad 1376`, '(t) in one row the levers are within 4px of the result column beside them', bar.levers <= bar.side + 4, JSON.stringify(bar))
  await wide.context.close()

  // A fine pointer and the phone's layout keep the sizes they had.
  const fine = await openPlan(browser, { width: 1280, height: 800 })
  await fine.page.getByRole('button', { name: 'All inputs' }).click()
  await fine.page.getByRole('region', { name: 'All inputs' }).waitFor()
  await fine.page.waitForTimeout(400)
  const small = await fine.page.evaluate(() => {
    const h = (sel) => Math.round(document.querySelector(sel).getBoundingClientRect().height * 10) / 10
    return { stepper: h('[aria-label^="Decrease "]'), field: h('[role="region"] input[type="text"]'), chip: h('[class*="chips"] button'), range: h('input[type="range"]'), digits: h('[class*="leverValue"]') }
  })
  check(`${engine} mouse`, '(t) with a fine pointer the controls keep their size (stepper 25.6, field 26, chip 26.2, slider 16 or 17, digits row under 40)', near(small.stepper, 25.6, 0.7) && near(small.chip, 26.2, 1.5) && near(small.range, 16.5, 1) && near(small.field, 26, 0.5) && small.digits < 40, JSON.stringify(small))
  await fine.context.close()
  const phone = await openPlan(browser, { width: 899, height: 800 }, { touch: true })
  const phoneStyle = await phone.page.evaluate(() => ({
    wide: document.querySelector('[data-goals-plan-wide]') !== null,
    coarse: matchMedia('(pointer: coarse)').matches,
    stepperSize: getComputedStyle(document.querySelector('[class*="_stack_"]')).getPropertyValue('--stepper-size').trim(),
    rangeMargin: getComputedStyle(document.querySelector('input[type="range"]')).marginTop,
  }))
  check(`${engine} phone touch`, '(t) the phone layout on a touch screen keeps the small steppers and sliders', !phoneStyle.wide && phoneStyle.coarse && phoneStyle.stepperSize === '' && phoneStyle.rangeMargin !== '-8px', JSON.stringify(phoneStyle))
  await phone.context.close()
}

/** The overlap of two boxes, in px squared. */
function overlap(a, b) {
  if (!a || !b) return 0
  const w = Math.min(a.right, b.right) - Math.max(a.left, b.left)
  const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
  return w > 0 && h > 0 ? Math.round(w * h) : 0
}

/** Screens the star Undo toast is checked on: held bar, a taller screen where it is not at the edge, and touch tablets. */
const TOAST_SCREENS = [
  { width: 1024, height: 768 },
  { width: 1200, height: 800 },
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
  { width: 1440, height: 1024 },
  { width: 1032, height: 1376, touch: true },
  { width: 1133, height: 744, touch: true },
  { width: 1366, height: 1024, touch: true },
]

/**
 * (z2) The toast that follows taking an input out of the bar covers neither the legend, nor the
 * bar and its controls, nor the rail's menu button, and its Undo can be pressed. It was centred
 * over the bar, which at 1280x800 put it over the legend chips for six seconds (10092px squared
 * of them), and at 1366x1024 on a touch screen over the bar itself.
 */
async function checkToastPlace(browser, engine) {
  for (const screen of TOAST_SCREENS) {
    const where = `${engine} ${screen.width}x${screen.height}${screen.touch ? ' touch' : ''}`
    const { page, context } = await openPlan(browser, screen, { touch: screen.touch === true })
    await scrollTo(page, 0)
    const star = page.getByRole('button', { name: 'Remove Real return from the bar' })
    // A screen the bar is not held on has it below the fold: scrolled to the middle first, as a person would.
    if ((await star.boundingBox()).y > screen.height - 40) {
      await star.evaluate((el) => el.scrollIntoView({ block: 'center' }))
      await settled(page)
    }
    const box = await star.boundingBox()
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    await page.getByText('Removed Real return from the bar').waitFor({ timeout: 3000 })
    await page.waitForTimeout(400)
    const found = await page.evaluate(() => {
      const rect = (el) => {
        if (!el) return null
        const r = el.getBoundingClientRect()
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }
      }
      const bar = document.querySelector('[data-levers-bar]')
      const undo = document.querySelector('[role="status"] button')
      const u = undo.getBoundingClientRect()
      const hit = document.elementFromPoint(u.left + u.width / 2, u.top + u.height / 2)
      return {
        toast: rect(document.querySelector('[role="status"] > div')),
        legend: rect(document.querySelector('[data-goals-plan-wide] ul[class*="chips"]')),
        key: rect(document.querySelector('[data-goals-plan-wide] [class*="chartKeys"]')),
        bar: rect(bar),
        controls: [...bar.querySelectorAll('input, button')].map(rect),
        menu: rect([...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Navigate' && b.getBoundingClientRect().left < 240)),
        links: rect(document.querySelector('[class*="railList"]')),
        undoReachable: hit === undo || undo.contains(hit),
        w: innerWidth,
        h: innerHeight,
      }
    })
    const t = found.toast
    const names = { legend: overlap(t, found.legend), 'check-in key': overlap(t, found.key), bar: overlap(t, found.bar), 'bar controls': found.controls.reduce((sum, c) => sum + overlap(t, c), 0), "rail's menu button": overlap(t, found.menu), "rail's links": overlap(t, found.links) }
    const covered = Object.entries(names).filter(([, n]) => n > 0).map(([what, n]) => `${what} ${n}px2`)
    check(where, '(z2) the Undo toast covers neither the legend, the bar and its controls, nor the rail', covered.length === 0, `${covered.join(', ')}; toast ${px(t.left)},${px(t.top)} to ${px(t.right)},${px(t.bottom)}`)
    check(where, '(z2) the toast is inside the window and its Undo is what a press at its centre reaches', t.left >= 0 && t.right <= found.w && t.top >= 0 && t.bottom <= found.h && found.undoReachable, `toast ${px(t.left)},${px(t.top)} to ${px(t.right)},${px(t.bottom)} in ${found.w}x${found.h}, undo reachable ${found.undoReachable}`)
    await context.close()
  }

  // Under 1024px the rail is icons only and has no room for it: the toast keeps to the middle.
  const narrow = await openPlan(browser, { width: 1023, height: 800 })
  const star = narrow.page.getByRole('button', { name: 'Remove Real return from the bar' })
  await star.scrollIntoViewIfNeeded()
  await star.click()
  await narrow.page.getByText('Removed Real return from the bar').waitFor({ timeout: 3000 })
  await narrow.page.waitForTimeout(400)
  const mid = await narrow.page.locator('[role="status"] > div').boundingBox()
  check(`${engine} 1023x800`, '(z2) under 1024px the toast stays in the middle, clear of the 72px rail', mid !== null && mid.x >= 72 && Math.abs(mid.x + mid.width / 2 - 511.5) < 2, JSON.stringify(mid))
  await narrow.context.close()

  // The phone has no stars, but a toast is still one: it is above the bottom bar, not on it.
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 1, colorScheme: 'dark', reducedMotion: 'reduce', hasTouch: true, isMobile: true })
  const page = await context.newPage()
  await page.addInitScript(() => localStorage.setItem('exp-onboarding-skipped', '1'))
  await page.goto(`${BASE}/`)
  await page.waitForSelector('text=Recent activity', { timeout: 20000 })
  await page.locator('[class*="bottomBar"] button').filter({ hasText: 'Goals' }).first().click()
  await page.getByText('Scenarios', { exact: true }).first().click()
  const slider = page.getByRole('slider').first()
  await slider.focus()
  await page.keyboard.press('ArrowRight')
  await page.getByRole('button', { name: /^Save/ }).first().click()
  await page.getByRole('status').getByText(/^Saved/).waitFor({ timeout: 6000 })
  await page.waitForTimeout(400)
  const phone = await page.evaluate(() => ({
    toast: document.querySelector('[role="status"] > div').getBoundingClientRect().toJSON(),
    bar: document.querySelector('[class*="bottomBar"]').getBoundingClientRect().toJSON(),
    aside: document.documentElement.hasAttribute('data-toast-aside'),
  }))
  check(`${engine} phone 375x812`, '(z2) on the phone the toast is above the bottom bar, in the middle, and is not asked to go aside', phone.bar.top - phone.toast.bottom >= 8 && !phone.aside && Math.abs(phone.toast.left + phone.toast.width / 2 - 187.5) < 2, JSON.stringify(phone))
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

/**
 * Leaving Goals with an unsaved edit asks first, from the rail (the phone's bottom bar is the same
 * guard behind another button). Stay keeps the edit and gives the keyboard back to the button it
 * came from; Leave goes where the user pressed, and opening Goals again finds the saved value.
 */
async function checkLeaveGuard(browser, engine) {
  const where = `${engine} leave guard`
  const { page, context } = await openPlan(browser, { width: 1440, height: 900 })
  const rail = (i) => page.locator('[class*="rail"] button').nth(i)
  const dialog = page.getByRole('alertdialog', { name: 'Leave without saving?' })
  const monthly = page.getByLabel('Monthly investing', { exact: true })
  const saved = await monthly.inputValue()
  await monthly.fill('750')
  await monthly.press('Enter')
  await page.getByText('Unsaved changes').first().waitFor({ timeout: 5000 })

  await rail(3).click()
  await page.waitForTimeout(300)
  check(where, '(q) pressing the tab that is already open does not ask', (await dialog.count()) === 0)

  // From the keyboard, so that every engine has focus on the button (Safari does not focus one on a click).
  await rail(0).focus()
  await page.keyboard.press('Enter')
  await dialog.waitFor({ timeout: 5000 })
  await page.waitForTimeout(300)
  const box = await dialog.boundingBox()
  const vp = page.viewportSize()
  check(where, '(q) leaving with an unsaved edit asks first, inside the window', box !== null && box.x >= 0 && box.x + box.width <= vp.width && box.y >= 0 && box.y + box.height <= vp.height, JSON.stringify(box))
  check(where, '(q) the question has put focus on Stay', await dialog.getByRole('button', { name: 'Stay' }).evaluate((el) => el === document.activeElement))
  check(where, '(q) the page is still Goals, with the edit', (await monthly.inputValue()) === '750' && (await rail(3).getAttribute('aria-current')) === 'page', await monthly.inputValue())
  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'detached', timeout: 5000 })
  check(where, '(q) Escape stays, keeps the edit and gives focus back to the button pressed', (await monthly.inputValue()) === '750' && (await rail(0).evaluate((el) => el === document.activeElement)))

  await rail(1).click()
  await dialog.waitFor({ timeout: 5000 })
  await dialog.getByRole('button', { name: 'Leave' }).click()
  await dialog.waitFor({ state: 'detached', timeout: 5000 })
  check(where, '(q) Leave goes to the place pressed, not to a default', (await rail(1).getAttribute('aria-current')) === 'page')
  await rail(3).click()
  await page.waitForSelector('text=Invested portfolio projection', { timeout: 20000 })
  check(where, '(q) opening Goals again finds the saved value', (await monthly.inputValue()) === saved, `value ${await monthly.inputValue()}`)
  await context.close()
}

/** A closed tab with an unsaved edit gets the browser's own prompt, and a clean page does not. */
async function checkBrowserPrompt(browser, engine) {
  const where = `${engine} leave guard`
  for (const edited of [true, false]) {
    const { page, context } = await openPlan(browser, { width: 1440, height: 900 })
    if (edited) {
      const monthly = page.getByLabel('Monthly investing', { exact: true })
      await monthly.fill('750')
      await monthly.press('Enter')
      await page.getByText('Unsaved changes').first().waitFor({ timeout: 5000 })
    }
    let asked = null
    page.on('dialog', (dialog) => {
      asked = dialog.type()
      void dialog.dismiss()
    })
    await page.close({ runBeforeUnload: true })
    await new Promise((resolve) => setTimeout(resolve, 500))
    const what = edited ? "closing the tab with an unsaved edit asks (the browser's own prompt)" : 'closing the tab with nothing unsaved does not ask'
    check(where, `(q) ${what}`, edited ? asked === 'beforeunload' : asked === null, `dialog: ${asked}`)
    if (!page.isClosed()) await page.close()
    await context.close()
  }
}

/** Goals' typed amounts and percentages in a format that writes its decimals with a point (the other mark than the demo's). */
async function checkPointDecimal(browser, engine) {
  const where = `${engine} point-decimal format`
  const { page, context } = await openPlan(browser, { width: 1440, height: 900 })
  // Through the app's own Settings, as a person would: the demo instance is writable.
  await page.locator('[class*="rail"] button').nth(4).click()
  // Not exact: the select sits inside its label, so the label's text carries the options too.
  await page.getByLabel('Currency').selectOption('USD')
  await page.getByLabel('Number format').selectOption('en-US')
  await page.locator('[class*="rail"] button').nth(3).click()
  await page.waitForSelector('text=Invested portfolio projection', { timeout: 20000 })
  await settled(page)

  const monthly = page.getByLabel('Monthly investing', { exact: true })
  const typeInto = async (field, text) => {
    await field.fill(text)
    await field.press('Enter')
    await page.waitForTimeout(250)
    return field.inputValue()
  }
  check(where, '(y1) the demo now writes its amounts with a point', (await typeInto(monthly, '12.5')) === '12.50', await monthly.inputValue())
  check(where, '(y1) a comma typed into "Monthly investing" is the decimal mark: 12,5 is 12.50', (await typeInto(monthly, '12,5')) === '12.50', await monthly.inputValue())
  check(where, '(y1) 1,5 is 1.50', (await typeInto(monthly, '1,5')) === '1.50', await monthly.inputValue())
  check(where, '(y1) 1,500 is still a thousand and a half', (await typeInto(monthly, '1,500')) === '1,500', await monthly.inputValue())
  const ret = page.getByRole('textbox', { name: 'Real return (%/yr, after inflation)' })
  check(where, '(y1) a comma typed into a percentage lever is its decimal mark: 5,5 is 5.5', (await typeInto(ret, '5,5')) === '5.5', await ret.inputValue())

  await page.getByRole('button', { name: 'All inputs' }).click()
  await page.getByRole('region', { name: 'All inputs' }).waitFor({ timeout: 5000 })
  const price = page.getByLabel('House price', { exact: true })
  check(where, '(y1) a comma typed into an amount in the inputs panel is the decimal mark', (await typeInto(price, '250000,5')) === '250,000.50', await price.inputValue())
  const mortgage = page.getByRole('textbox', { name: 'Mortgage rate (%/yr)', exact: true })
  check(where, '(y1) a comma typed into the percentage stepper is its decimal mark, not 0%', (await typeInto(mortgage, '3,5')) === '3.5', await mortgage.inputValue())
  await context.close()
}

/**
 * A draft with no saved scenario behind it. The demo always has scenarios, so they are all deleted
 * through the menu first: what is on screen is then the draft of a scenario that is gone, which is
 * the same editor state as a first-time user's (nothing saved to measure the edits against).
 */
async function checkFirstDraft(browser, engine) {
  const where = `${engine} first draft`
  const { page, context } = await openPlan(browser, { width: 1440, height: 900 })
  const rail = (i) => page.locator('[class*="rail"] button').nth(i)
  const dialog = page.getByRole('alertdialog', { name: 'Leave without saving?' })
  const tabs = page.getByRole('tablist', { name: 'Scenarios' }).getByRole('tab')
  const saved = tabs.filter({ hasNotText: 'Unsaved draft' })
  for (let guard = 0; guard < 10 && (await saved.count()) > 0; guard++) {
    await saved.first().click()
    await page.waitForTimeout(250)
    await page.getByRole('button', { name: 'Scenario options' }).click()
    await page.getByRole('button', { name: 'Delete', exact: true }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete', exact: true }).click()
    await page.waitForTimeout(400)
  }
  check(where, '(y2) every scenario is deleted: only the unsaved draft is left', (await saved.count()) === 0 && (await tabs.count()) === 1, `${await saved.count()} saved, ${await tabs.count()} tabs`)

  await rail(0).focus()
  await page.keyboard.press('Enter')
  await page.waitForTimeout(400)
  check(where, '(y2) a draft nobody has touched is left without a question', (await dialog.count()) === 0 && (await rail(0).getAttribute('aria-current')) === 'page')
  await rail(3).click()
  await page.waitForSelector('text=Invested portfolio projection', { timeout: 20000 })
  // The first draft is seeded again on every visit, and it is the first-time user's.
  const monthly = page.getByLabel('Monthly investing', { exact: true })
  const start = await monthly.inputValue()
  await monthly.fill('7777')
  await monthly.press('Enter')
  await page.waitForTimeout(250)

  await rail(0).focus()
  await page.keyboard.press('Enter')
  await dialog.waitFor({ timeout: 5000 })
  await page.waitForTimeout(300)
  const words = await dialog.innerText()
  check(where, '(y2) editing a lever of that draft makes leaving ask first, in the words for a draft', /unsaved draft will be lost/i.test(words) && /save it as a new scenario/i.test(words), words)
  check(where, '(y2) the page is still Goals with the edit', (await monthly.inputValue()) !== start && (await rail(3).getAttribute('aria-current')) === 'page')
  await dialog.getByRole('button', { name: 'Stay' }).click()
  await dialog.waitFor({ state: 'detached', timeout: 5000 })

  await monthly.fill(start)
  await monthly.press('Enter')
  await page.waitForTimeout(250)
  await rail(0).focus()
  await page.keyboard.press('Enter')
  await page.waitForTimeout(400)
  check(where, '(y2) putting the edit back by hand makes leaving free again', (await dialog.count()) === 0 && (await rail(0).getAttribute('aria-current')) === 'page', `question asked: ${(await dialog.count()) > 0}`)

  // And a reload or a closed tab: the browser's own prompt.
  await rail(3).click()
  await page.waitForSelector('text=Invested portfolio projection', { timeout: 20000 })
  const field = page.getByLabel('Monthly investing', { exact: true })
  await field.fill('7777')
  await field.press('Enter')
  await page.waitForTimeout(250)
  let asked = null
  page.on('dialog', (d) => {
    asked = d.type()
    void d.dismiss()
  })
  await page.close({ runBeforeUnload: true })
  await new Promise((resolve) => setTimeout(resolve, 500))
  check(where, "(y2) closing the tab with an edited draft asks (the browser's own prompt)", asked === 'beforeunload', `dialog: ${asked}`)
  if (!page.isClosed()) await page.close()
  await context.close()
}

/**
 * On a phone, the reason Save is off (the scenario has no name) is written in the page, since a
 * touch screen never shows a tooltip: under the pinned Save and Discard, and under Save in the
 * scenario card. It comes into the pinned stack without moving the chart or the chips above it.
 */
async function checkPhoneSaveReason(browser, engine) {
  for (const phone of [
    { name: '375x812', width: 375, height: 812 },
    { name: '320x568', width: 320, height: 568 },
  ]) {
    const where = `${engine} phone ${phone.name}`
    const context = await browser.newContext({
      viewport: { width: phone.width, height: phone.height },
      screen: { width: phone.width, height: phone.height },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      colorScheme: 'light',
      reducedMotion: 'reduce',
    })
    const page = await context.newPage()
    page.on('pageerror', (e) => failures.push(`page error: ${e.message}`))
    await page.addInitScript(() => localStorage.setItem('exp-onboarding-skipped', '1'))
    await page.goto(`${BASE}/`)
    await page.waitForSelector('text=Recent activity', { timeout: 20000 })
    await page.getByRole('button', { name: 'Goals', exact: true }).click()
    await page.getByRole('tablist', { name: 'Goals view' }).waitFor({ timeout: 15000 })
    await page.getByRole('tab', { name: 'Scenarios', exact: true }).tap()
    await settled(page)

    const HINT = 'Give the scenario a name to save it'
    const name = page.getByLabel('Scenario name', { exact: true })
    await name.fill('Path A, edited')
    await settled(page)
    const stack = page.locator('#goals-adjust-stack')
    const pinnedBoxes = () =>
      page.evaluate(() => {
        const top = (el) => (el ? Math.round(el.getBoundingClientRect().top * 10) / 10 : null)
        const s = document.getElementById('goals-adjust-stack')
        return {
          stackTop: top(s),
          stackBottom: s ? Math.round(s.getBoundingClientRect().bottom * 10) / 10 : null,
          chart: top(s?.querySelector('svg')),
          chips: top(s?.querySelector('nav')),
          view: top(document.querySelector('[role="tablist"][aria-label="Goals view"]')),
        }
      })
    const atScroll = async (y) => {
      await scrollTo(page, y)
      return pinnedBoxes()
    }
    const sticky = (await stack.evaluate((el) => getComputedStyle(el).position)) === 'sticky'
    // Far enough down for the stack to be held under the view row, which is where it must not move.
    const HELD_AT = 1600
    const without = [await atScroll(0), await atScroll(HELD_AT)]
    check(where, '(y3) no reason is written while the scenario has a name', (await stack.getByText(HINT).count()) === 0 && (await page.getByText(HINT).count()) === 0)

    await name.fill('')
    await settled(page)
    const withHint = [await atScroll(0), await atScroll(HELD_AT)]
    const line = stack.getByText(HINT)
    check(where, '(y3) with no name, the reason is written in the pinned stack under Save and Discard', (await line.count()) === 1 && (await line.isVisible()))
    const save = stack.getByRole('button', { name: 'Save changes', exact: true })
    check(where, '(y3) Save is off, described by those words, and has no tooltip', (await save.isDisabled()) && (await save.getAttribute('title')) === null && (await save.evaluate((el, text) => document.getElementById(el.getAttribute('aria-describedby'))?.textContent === text, HINT)))
    const box = await line.boundingBox()
    const m = await measure(page)
    check(where, '(y3) the reason is inside the screen and the page does not scroll sideways', box !== null && box.x >= 0 && box.x + box.width <= phone.width + 0.5 && m.pageScrollWidth <= m.iw, `${JSON.stringify(box)}, scrollWidth ${m.pageScrollWidth}`)
    const lines = box ? Math.round(box.height / 14) : 0
    check(where, '(y3) it is one line, at the end of the row', lines === 1 && box !== null && box.x + box.width >= phone.width - 24, `${lines} lines, ${JSON.stringify(box)}`)
    // The page below the card moves for the card's own line, as it should; what is held under the
    // view row (the chart, the chips) stays where it was.
    if (sticky) {
      const a = without[1]
      const b = withHint[1]
      check(where, '(y3) the stack is held under the view row', a.stackTop < 200, `it is at ${px(a.stackTop)}`)
      check(where, '(y3) the chart, the chips and the view row do not move when the reason comes in', near(a.chart, b.chart, 0.5) && near(a.chips, b.chips, 0.5) && near(a.view, b.view, 0.5) && near(a.stackTop, b.stackTop, 0.5), `${JSON.stringify(a)} against ${JSON.stringify(b)}`)
    }
    const grew = withHint[1].stackBottom - withHint[1].stackTop - (without[1].stackBottom - without[1].stackTop)
    check(where, '(y3) the stack grows only by the line, 14 to 24px', grew >= 14 && grew <= 24, px(grew))

    // The scenario card's own Save changes says it too, under its buttons.
    await settled(page)
    const header = page.locator('[class*="activeHeader"]')
    const card = header.getByRole('button', { name: 'Save changes', exact: true })
    await card.scrollIntoViewIfNeeded()
    const cardLine = header.getByText(HINT)
    const cardBox = await cardLine.boundingBox()
    const cardSave = await card.boundingBox()
    check(where, "(y3) the scenario card writes it under its Save changes, inside the screen", cardBox !== null && cardSave !== null && cardBox.y >= cardSave.y + cardSave.height - 1 && cardBox.x >= 0 && cardBox.x + cardBox.width <= phone.width + 0.5, `${JSON.stringify(cardBox)} under ${JSON.stringify(cardSave)}`)
    check(where, '(y3) the card\'s Save changes is off and described by it', (await card.isDisabled()) && (await card.evaluate((el, text) => document.getElementById(el.getAttribute('aria-describedby'))?.textContent === text, HINT)))

    await name.fill('Path A, edited')
    await settled(page)
    const gone = (await page.getByText(HINT).count()) === 0
    const back = await atScroll(0)
    check(where, '(y3) typing a name takes the reason away and the stack goes back to its height', gone && near(back.stackBottom - back.stackTop, without[0].stackBottom - without[0].stackTop, 0.5), `${px(back.stackBottom - back.stackTop)} against ${px(without[0].stackBottom - without[0].stackTop)}`)
    await context.close()
  }
}

/**
 * Years to milestone (check group w): the table on the wide page and on a phone. The demo's
 * milestones are all reached by check-ins, so the editing draft is set low to have cells that are
 * years away; its row is the one with tint, hatching and gaps to read.
 */
const matrixCard = (page) => page.getByRole('heading', { name: 'Years to milestone' }).locator('xpath=ancestor::*[contains(@class,"chartCard")][1]')

async function lowDraft(page) {
  await page.getByRole('button', { name: 'All inputs' }).click()
  await page.waitForTimeout(400)
  for (const [label, value] of [['Monthly investing', '150'], ['Starting invested', '5000']]) {
    const input = page.getByLabel(label, { exact: true }).last()
    await input.fill(value)
    await input.press('Enter')
  }
  await page.waitForTimeout(400)
}

/** What each tinted cell shows, and whether its text keeps 4.5:1 on the tint over the card, as drawn. */
function readTints(page) {
  return page.evaluate(() => {
    const rgba = (css) => {
      const c = document.createElement('canvas')
      c.width = c.height = 1
      const x = c.getContext('2d', { willReadFrequently: true })
      x.clearRect(0, 0, 1, 1)
      x.fillStyle = css
      x.fillRect(0, 0, 1, 1)
      return [...x.getImageData(0, 0, 1, 1).data]
    }
    const lum = ([r, g, b]) => {
      const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
    }
    const ratio = (a, b) => {
      const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
      return (hi + 0.05) / (lo + 0.05)
    }
    const region = document.querySelector('[role="region"][aria-label="Years to milestone"]')
    const card = region.closest('[class*="card" i]') ?? region
    const ground = rgba(getComputedStyle(card).backgroundColor)
    return [...region.querySelectorAll('[class*="matrixTint"]')].map((el) => {
      const cs = getComputedStyle(el)
      const [r, g, b, a] = rgba(cs.backgroundColor)
      const alpha = a / 255
      const over = [r, g, b].map((v, i) => v * alpha + ground[i] * (1 - alpha))
      return { text: el.textContent, tint: parseInt(el.style.getPropertyValue('--tint')), alpha: Math.round(alpha * 100), contrast: ratio(rgba(cs.color), over) }
    })
  })
}

async function checkMilestoneWide(browser, engine, screen, scheme) {
  const where = `${engine} ${screen.name} ${scheme}`
  const { page, context } = await openPlan(browser, screen, { scheme })
  await lowDraft(page)
  const card = matrixCard(page)
  await card.scrollIntoViewIfNeeded()
  await page.waitForTimeout(300)

  const fit = await page.evaluate(() => {
    const region = document.querySelector('[role="region"][aria-label="Years to milestone"]')
    const c = region.closest('[class*="chartCard"]').getBoundingClientRect()
    const r = region.getBoundingClientRect()
    return { scroll: region.scrollWidth, client: region.clientWidth, inCard: r.left >= c.left - 0.5 && r.right <= c.right + 0.5, page: document.documentElement.scrollWidth, iw: innerWidth }
  })
  check(where, '(w) the table is inside its card and the page does not scroll sideways', fit.inCard && fit.page <= fit.iw, JSON.stringify(fit))
  if (screen.width >= 1280) check(where, '(w) all seven milestones fit the table without its own scroll', fit.scroll <= fit.client + 1, JSON.stringify(fit))

  const tints = await readTints(page)
  const shallow = tints.find((t) => t.text === '6y')
  const deep = tints.find((t) => t.text === '30y')
  check(where, '(w) cells that are years away are tinted, deeper the further', tints.length >= 3 && shallow !== undefined && deep !== undefined && deep.alpha > shallow.alpha, JSON.stringify(tints))
  const worst = Math.min(...tints.map((t) => t.contrast))
  check(where, '(w) the text on every tint keeps 4.5:1', tints.length >= 3 && worst >= 4.5, `worst ${worst.toFixed(2)}:1`)
  const hatched = await page.evaluate(() => [...document.querySelectorAll('[class*="matrixBeyond"]')].map((el) => ({ text: el.textContent, border: getComputedStyle(el).borderTopStyle })))
  check(where, '(w) a milestone not within the horizon is a hatched dashed box showing the horizon with a plus', hatched.length >= 1 && hatched.every((h) => /^\d+\+$/.test(h.text) && h.border === 'dashed'), JSON.stringify(hatched))
  check(where, '(w) a milestone already reached is a tick', (await page.locator('[class*="matrixDone"]').first().textContent()) === '✓')

  // Nothing under the card moves when the first cell is pointed at.
  const before = (await card.boundingBox()).height
  const cells = page.getByRole('gridcell')
  const draftCell = cells.nth((await cells.count()) - 6)
  await draftCell.hover()
  await page.waitForTimeout(150)
  const after = (await card.boundingBox()).height
  check(where, '(w) reading a cell does not change the card\'s height', near(before, after, 1), `${px(before)} then ${px(after)}`)
  const sentence = await page.locator('[class*="matrixReadout"]').textContent()
  check(where, '(w) pointing at a cell writes its sentence under the table', sentence === (await draftCell.getAttribute('aria-label')) && /by 20\d\d\./.test(sentence), sentence)
  const marked = await page.evaluate(() => [...document.querySelectorAll('td[role="gridcell"]')].filter((c) => /matrixLine|matrixCross/.test(c.className)).length)
  const dims = await page.evaluate(() => ({ rows: document.querySelectorAll('[role="grid"] tbody tr').length, cols: document.querySelectorAll('[role="grid"] thead th[scope="col"]').length }))
  check(where, '(w) the row and the column of that cell are marked', marked === dims.rows + dims.cols - 1, `${marked} marked of ${dims.rows} rows by ${dims.cols} columns`)
  await page.mouse.move(2, 2)
  await page.waitForTimeout(150)
  const left = await page.evaluate(() => [...document.querySelectorAll('td[role="gridcell"]')].filter((c) => /matrixLine|matrixCross/.test(c.className)).length)
  check(where, '(w) the marks go when the pointer leaves, the sentence stays', left === 0 && (await page.locator('[class*="matrixReadout"]').filter({ hasText: /by 20\d\d\./ }).count()) === 1, `${left} still marked`)

  // The two toggles.
  await page.getByRole('radio', { name: 'Calendar year' }).click()
  const years = (await readTints(page)).map((t) => t.text)
  check(where, '(w) calendar year shows the year in each cell', years.length >= 3 && years.every((y) => /^20\d\d$/.test(y)), JSON.stringify(years))
  await page.getByRole('radio', { name: 'Years from now' }).click()
  const vs = page.getByRole('button', { name: 'vs plan' })
  await vs.click()
  const gaps = await page.evaluate(() => [...document.querySelectorAll('[class*="matrixGap"]')].map((g) => g.textContent.trim()).filter(Boolean))
  check(where, '(w) vs plan is pressed and says how many years later each path is', (await vs.getAttribute('aria-pressed')) === 'true' && gaps.some((g) => /^\+\d+y$/.test(g)), JSON.stringify(gaps))
  const green = await page.evaluate(() => [...document.querySelectorAll('[class*="matrixSooner"]')].length)
  check(where, '(w) a path that is no sooner than the plan is not in green', green === 0 || gaps.some((g) => /^−/.test(g) || g === 'sooner'), `${green} green`)

  // The keyboard: one tab stop, arrows, Home and End.
  const stops = await page.evaluate(() => [...document.querySelectorAll('td[role="gridcell"]')].filter((c) => c.tabIndex === 0).length)
  check(where, '(w) the grid is one tab stop', stops === 1, `${stops} stops`)
  const at = () => page.evaluate(() => [document.activeElement.dataset.row, document.activeElement.dataset.col].join(','))
  await page.locator('td[role="gridcell"][tabindex="0"]').focus()
  const start = await at()
  await page.keyboard.press('ArrowRight')
  const right = await at()
  await page.keyboard.press('ArrowUp')
  const up = await at()
  await page.keyboard.press('End')
  const end = await at()
  await page.keyboard.press('Home')
  const home = await at()
  const [r0, c0] = start.split(',').map(Number)
  check(where, '(w) arrow keys, End and Home move between cells', right === `${r0},${c0 + 1}` && up === `${r0 - 1},${c0 + 1}` && end === `${r0 - 1},6` && home === `${r0 - 1},0`, JSON.stringify({ start, right, up, end, home }))

  if (engine === 'chromium' && scheme === 'dark') {
    await page.emulateMedia({ forcedColors: 'active' })
    const box = await page.evaluate(() => {
      const el = document.querySelector('[class*="matrixTint"]')
      const cs = getComputedStyle(el)
      return { style: cs.borderTopStyle, color: cs.borderTopColor, width: cs.borderTopWidth }
    })
    check(where, '(w) in forced colours a tinted cell is still drawn as a box', box.style === 'solid' && box.color !== 'rgba(0, 0, 0, 0)' && parseFloat(box.width) >= 1, JSON.stringify(box))
  }
  await context.close()
}

async function openPhoneMilestones(browser, width, engine) {
  const context = await browser.newContext({ viewport: { width, height: 812 }, deviceScaleFactor: 2, reducedMotion: 'reduce', hasTouch: true, isMobile: true })
  const page = await context.newPage()
  page.on('pageerror', (e) => failures.push(`page error: ${e.message}`))
  await page.addInitScript(() => localStorage.setItem('exp-onboarding-skipped', '1'))
  await page.goto(`${BASE}/`)
  await page.waitForSelector('text=Recent activity', { timeout: 20000 })
  await page.getByRole('button', { name: /Goals/ }).last().click()
  await page.getByRole('radio', { name: 'Milestones' }).click()
  await page.waitForTimeout(500)
  await matrixCard(page).scrollIntoViewIfNeeded()
  return { page, context, where: `${engine} phone ${width}` }
}

async function checkMilestonePhone(browser, engine) {
  for (const width of [375, 320]) {
    const { page, context, where } = await openPhoneMilestones(browser, width, engine)
    const fit = await page.evaluate(() => {
      const region = document.querySelector('[role="region"][aria-label="Years to milestone"]')
      return { scroll: region.scrollWidth, client: region.clientWidth, page: document.documentElement.scrollWidth, iw: innerWidth }
    })
    check(where, '(w) the page does not scroll sideways', fit.page <= fit.iw, JSON.stringify(fit))
    // Seven milestones fit 375px; at 320px the table may scroll in its own box, with the names held.
    if (width === 375) check(where, '(w) all seven milestones fit the table without scrolling', fit.scroll <= fit.client + 1, JSON.stringify(fit))
    if (width === 375) {
      // The longest sentence there is: a path against the plan, with the check-ins' date. The
      // card keeps the room for it from the start, so reading it moves nothing.
      await page.getByRole('button', { name: 'vs plan' }).tap()
      // The pointer the emulation leaves behind is moved off the table: the browser repeats its last
      // mouse position over whatever has come to lie under it, and that would read another cell.
      await page.mouse.move(1, 1)
      const before = (await matrixCard(page).boundingBox()).height
      const tapped = page.getByRole('gridcell', { name: /^Path B reaches 1,0M/ })
      await tapped.tap()
      await page.waitForTimeout(150)
      const text = await page.locator('[class*="matrixReadout"]').textContent()
      const after = (await matrixCard(page).boundingBox()).height
      check(where, '(w) tapping a cell writes its sentence', text === (await tapped.getAttribute('aria-label')) && /later than Path A \(the plan\)/.test(text), text)
      check(where, '(w) the sentence takes the room kept for it, the card does not grow', near(before, after, 1), `${px(before)} then ${px(after)}`)
      const toggles = await page.evaluate(() => {
        const t = [...document.querySelectorAll('[role="radiogroup"][aria-label="Show each milestone as"], button[aria-pressed]')].map((e) => e.getBoundingClientRect())
        return { inside: t.every((r) => r.left >= 0 && r.right <= innerWidth) }
      })
      check(where, '(w) the toggles fit the screen', toggles.inside, JSON.stringify(toggles))
    }
    await context.close()
  }
}

/**
 * The touch round's leftovers, on an iPad's screen: the stars' tap area, the plan start date, the
 * sign radios of a life event, and (with a keyboard, so on a mouse's screen) taking back a removed
 * star without tabbing to the end of the page.
 */
async function checkTouchLeftovers(browser, engine) {
  const where = `${engine} iPad leftovers`
  const { page, context } = await openPlan(browser, { width: 1032, height: 1376 }, { touch: true })

  // (a) A star's tap area is 44px high. In the bar it goes up (below the star is the figure it
  // belongs to), in the panel it is the height of the row the star is on.
  const bar = await page.evaluate(() => {
    const star = document.querySelector('[class*="leversBar"] button[data-star]')
    const r = star.getBoundingClientRect()
    const after = getComputedStyle(star, '::after')
    const cx = r.left + r.width / 2
    const is = (y) => document.elementFromPoint(cx, y)?.closest('button[data-star]') === star
    const areaTop = r.top + parseFloat(after.top)
    return {
      height: parseFloat(after.height),
      width: parseFloat(after.width),
      above7: is(r.top - 7),
      topOfArea: is(areaTop + 1.5),
      below7IsFigure: document.elementFromPoint(cx, r.bottom + 7)?.closest('[class*="leverValue"]') !== null,
    }
  })
  check(where, '(y4) a star in the bar has a tap area 44px high', bar.height >= FINGER && near(bar.height, 44, 0.5), JSON.stringify(bar))
  check(where, '(y4) a press 7px above a bar star, and at the top of its area, is the star\'s', bar.above7 && bar.topOfArea, JSON.stringify(bar))
  check(where, '(y4) a press 7px below a bar star is still the figure\'s, so a tap on the digits does not take the lever out', bar.below7IsFigure, JSON.stringify(bar))
  await page.getByRole('button', { name: 'All inputs' }).click()
  await page.getByRole('region', { name: 'All inputs' }).waitFor()
  await page.waitForTimeout(500)
  const panel = await page.evaluate(() =>
    [...document.querySelectorAll('[role="region"] [class*="starrable"] > button[data-star]')].map((star) => {
      const r = star.getBoundingClientRect()
      const wrap = star.parentElement.getBoundingClientRect()
      const after = getComputedStyle(star, '::after')
      const cx = r.left + r.width / 2
      const is = (y) => document.elementFromPoint(cx, y)?.closest('button[data-star]') === star
      const areaTop = r.top + parseFloat(after.top)
      return { height: parseFloat(after.height), above7: is(r.top - 7), below7: is(r.bottom + 7), reachesUp: areaTop < wrap.top - 0.5 }
    }),
  )
  check(where, `(y4) every star in the panel has a 44px tap area (${panel.length} measured)`, panel.length > 5 && panel.every((s) => near(s.height, 44, 0.5)), JSON.stringify(panel[0]))
  check(where, '(y4) a press 7px above or below a panel star is the star\'s', panel.every((s) => s.above7 && s.below7), JSON.stringify(panel.filter((s) => !(s.above7 && s.below7))))
  check(where, '(y4) the area stays inside the row of its own input, so it takes nothing from the row above', panel.every((s) => !s.reachesUp), JSON.stringify(panel.filter((s) => s.reachesUp)))

  // (d) The sign of a life event is a radio 12px across: a press anywhere on its 44px label picks it.
  await page.getByRole('button', { name: '+ Add life event' }).scrollIntoViewIfNeeded()
  await page.getByRole('button', { name: '+ Add life event' }).click()
  await page.waitForTimeout(300)
  const outflow = page.locator('[class*="lifeEventSignLabel"]').filter({ hasText: 'Outflow' })
  const inflow = page.locator('[class*="lifeEventSignLabel"]').filter({ hasText: 'Inflow' })
  await outflow.scrollIntoViewIfNeeded()
  const label = await outflow.boundingBox()
  const grid = await outflow.evaluate((el) => {
    const r = el.getBoundingClientRect()
    const misses = []
    for (const fx of [0.02, 0.25, 0.5, 0.75, 0.98]) {
      for (const fy of [0.05, 0.5, 0.95]) {
        const x = r.left + r.width * fx
        const y = r.top + r.height * fy
        const hit = document.elementFromPoint(x, y)
        if (hit !== el && !el.contains(hit)) misses.push([Math.round(x), Math.round(y)])
      }
    }
    return { misses, radio: el.querySelector('input').getBoundingClientRect().width }
  })
  check(where, '(y4) the sign radio is small but every point of its 44px label is the label\'s', label.height >= FINGER && grid.radio < 20 && grid.misses.length === 0, JSON.stringify({ height: label.height, ...grid }))
  const checked = (loc) => loc.locator('input').isChecked()
  for (const [name, fx, fy] of [['far right end', 0.97, 0.9], ['top left corner', 0.03, 0.08], ['the text', 0.6, 0.5]]) {
    await inflow.locator('input').check()
    await page.touchscreen.tap(label.x + label.width * fx, label.y + label.height * fy)
    await page.waitForTimeout(150)
    check(where, `(y4) a tap on ${name} of the Outflow label picks it`, (await checked(outflow)) && !(await checked(inflow)))
  }
  await page.getByRole('button', { name: 'Cancel' }).click()
  await context.close()

  // (b) The plan start date is 44px. An iPad draws the app's own pill over the browser's date
  // control, which is what is measured here (the control itself only a device can show); a browser
  // that is not an iPad has a button that opens the app's calendar, measured as well. A mouse keeps 40.8px.
  const { devices } = await import('playwright')
  for (const [what, options, expected] of [
    ['an iPad (the pill over the native control)', { ...devices['iPad Pro 11 landscape'], reducedMotion: 'reduce' }, 44],
    ['a touch screen without the iPad\'s browser (the app\'s calendar button)', { viewport: { width: 1032, height: 1376 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' }, 44],
    ['a mouse (the app\'s calendar button)', { viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' }, 40.8],
  ]) {
    const ctx = await browser.newContext(options)
    const p = await ctx.newPage()
    p.on('pageerror', (e) => failures.push(`page error: ${e.message}`))
    await p.addInitScript(() => localStorage.setItem('exp-onboarding-skipped', '1'))
    await p.goto(`${BASE}/`)
    await p.waitForSelector('text=Recent activity', { timeout: 20000 })
    await p.locator('[class*="rail"] button').nth(3).click()
    await p.waitForSelector('text=Invested portfolio projection', { timeout: 20000 })
    await p.getByRole('button', { name: 'All inputs' }).click()
    await p.getByRole('region', { name: 'All inputs' }).waitFor()
    await p.waitForTimeout(500)
    const date = await p.evaluate(() => {
      const field = document.querySelector('input[type="date"][aria-label="Plan start date"], button[aria-label="Plan start date"]')
      const pill = field.tagName === 'INPUT' ? field.nextElementSibling : field
      const input = field.tagName === 'INPUT' ? field : null
      return { native: field.tagName === 'INPUT', pill: pill.getBoundingClientRect().height, input: input?.getBoundingClientRect().height ?? null }
    })
    check(`${engine} ${what}`, `(y4) the plan start date is ${expected}px tall`, near(date.pill, expected, 0.5) && (date.input === null || near(date.input, expected, 0.5)), JSON.stringify(date))
    await ctx.close()
  }

  // (c) Taking a star out from the keyboard: Undo is the last stop on the page, so Alt+Z does it
  // from wherever focus is, without moving focus.
  const keys = await openPlan(browser, { width: 1440, height: 900 })
  const kp = keys.page
  const labels = () => kp.locator('[class*="leversBar"] [class*="leverLabel"]').allTextContents()
  const before = await labels()
  await kp.getByRole('button', { name: 'Remove Horizon from the bar' }).focus()
  await kp.keyboard.press('Enter')
  await kp.getByText('Removed Horizon from the bar').waitFor({ timeout: 3000 })
  await kp.waitForTimeout(200)
  const toastText = await kp.getByRole('status').textContent()
  check(where, '(y4) the toast says Alt+Z undoes it, in the words a screen reader reads', /Press Alt\+Z to undo\./.test(toastText ?? ''), toastText ?? '')
  check(where, '(y4) the toast shows the key beside Undo for a mouse', await kp.locator('kbd', { hasText: 'Alt+Z' }).isVisible())
  const focused = () => kp.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.tagName)
  const heldBefore = await focused()
  await kp.keyboard.press('Z')
  check(where, '(y4) Z alone does nothing', (await labels()).length === before.length - 1)
  await kp.keyboard.press('Alt+KeyZ')
  await kp.waitForTimeout(300)
  check(where, '(y4) Alt+Z puts the input back where it was and takes the toast away', JSON.stringify(await labels()) === JSON.stringify(before) && (await kp.getByRole('status').count()) === 0, JSON.stringify(await labels()))
  check(where, '(y4) and does not move the keyboard from where it was', (await focused()) === heldBefore, `${heldBefore} then ${await focused()}`)
  await kp.keyboard.press('Alt+KeyZ')
  await kp.waitForTimeout(200)
  check(where, '(y4) Alt+Z again, with no toast, does nothing', JSON.stringify(await labels()) === JSON.stringify(before))

  // From a field, where the key would otherwise type a letter (Option+Z is an omega on a Mac).
  await kp.getByRole('button', { name: 'Remove Horizon from the bar' }).focus()
  await kp.keyboard.press('Enter')
  await kp.getByText('Removed Horizon from the bar').waitFor({ timeout: 3000 })
  const monthly = kp.getByLabel('Monthly investing', { exact: true })
  const typed = await monthly.inputValue()
  // Pressing a star hands focus to the next one after the next render: let that finish first.
  await kp.waitForTimeout(400)
  await monthly.focus()
  await kp.keyboard.press('Alt+KeyZ')
  await kp.waitForTimeout(300)
  const inField = { restored: JSON.stringify(await labels()) === JSON.stringify(before), value: await monthly.inputValue(), typed, focused: await monthly.evaluate((el) => el === document.activeElement) }
  check(where, '(y4) Alt+Z in a field undoes the removal and types nothing', inField.restored && inField.value === typed && inField.focused, JSON.stringify(inField))
  await keys.context.close()
}

async function checkMilestoneTable(browser, engine) {
  for (const screen of [SCREENS[1], SCREENS[3], SCREENS[0]]) {
    for (const scheme of ['light', 'dark']) await checkMilestoneWide(browser, engine, screen, scheme)
  }
  await checkMilestonePhone(browser, engine)
}

/**
 * Years to milestone as a timeline (check group x): the switch is on the wide page only, the
 * timeline fits its card from 900px, dots are in their rows and labels do not run into each
 * other, following a milestone marks it and joins the paths at it, and Tab goes row by row.
 * The editing draft is set to save a lot over 20 years, so that several milestones fall in one
 * year and its horizon is shorter than the others'.
 */
async function denseDraft(page) {
  await page.getByRole('button', { name: 'All inputs' }).click()
  await page.waitForTimeout(400)
  for (const [label, value] of [['Monthly investing', '20000'], ['Starting invested', '5000'], ['Horizon (years)', '20']]) {
    const input = page.getByLabel(label, { exact: true }).last()
    await input.fill(value)
    await input.press('Enter')
  }
  await page.waitForTimeout(400)
}

const timelineSwitch = (page) => page.getByRole('radiogroup', { name: 'Show years to milestone as' })

async function checkTimelineAt(browser, engine, screen, scheme) {
  const where = `${engine} ${screen.name} ${scheme}`
  const { page, context } = await openPlan(browser, screen, { scheme })
  await denseDraft(page)
  const card = matrixCard(page)
  await card.scrollIntoViewIfNeeded()
  check(where, '(x) the switch is in the card, with the table showing', (await timelineSwitch(page).isVisible()) && (await timelineSwitch(page).getByRole('radio', { name: 'Table' }).getAttribute('aria-checked')) === 'true')
  const tableHeight = (await card.boundingBox()).height
  await timelineSwitch(page).getByRole('radio', { name: 'Timeline' }).click()
  await page.waitForTimeout(300)

  const fit = await page.evaluate(() => {
    const body = document.querySelector('[class*="tlBody"]')
    const c = body.closest('[class*="chartCard"]').getBoundingClientRect()
    const b = body.getBoundingClientRect()
    return { inCard: b.left >= c.left - 0.5 && b.right <= c.right + 0.5, page: document.documentElement.scrollWidth, iw: innerWidth, tracks: document.querySelector('[class*="tlTracks"]').getBoundingClientRect().width }
  })
  check(where, '(x) the timeline is inside its card and the page does not scroll sideways', fit.inCard && fit.page <= fit.iw, JSON.stringify(fit))
  check(where, '(x) the axis has room to draw in', fit.tracks >= 450, JSON.stringify(fit))

  // Every dot is in its row, and no label overlaps another label, a badge or the edge of the card.
  const layout = await page.evaluate(() => {
    const overlap = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5
    const card = document.querySelector('[class*="tlBody"]').closest('[class*="chartCard"]').getBoundingClientRect()
    const out = { dots: 0, outside: [], collisions: [], labelsOut: 0, labels: 0, hatched: 0 }
    for (const row of document.querySelectorAll('[class*="tlRow"]')) {
      const r = row.getBoundingClientRect()
      const dots = [...row.querySelectorAll('button[class*="tlDot"]')]
      for (const d of dots) {
        const b = d.getBoundingClientRect()
        out.dots += 1
        if (b.left < r.left || b.right > r.right || b.top < r.top || b.bottom > r.bottom) out.outside.push([Math.round(b.left - r.left), Math.round(b.top - r.top)])
      }
      const labels = [...row.querySelectorAll('[class*="tlLabel"]')].map((l) => l.getBoundingClientRect())
      out.labels += labels.length
      const others = [...labels, ...[...row.querySelectorAll('[class*="tlBadge"]')].map((e) => e.getBoundingClientRect())]
      labels.forEach((l, i) => {
        if (l.left < card.left || l.right > card.right) out.labelsOut += 1
        others.forEach((o, j) => { if (i !== j && overlap(l, o)) out.collisions.push([i, j]) })
        for (const d of dots) if (overlap(l, d.getBoundingClientRect())) out.collisions.push(['dot', i])
      })
      if (row.querySelector('[class*="tlHatch"]')) out.hatched += 1
    }
    return out
  })
  check(where, '(x) every dot is inside its row', layout.dots >= 5 && layout.outside.length === 0, JSON.stringify(layout.outside))
  check(where, '(x) no label runs into another label, a badge or a dot, and none is outside the card', layout.labels >= 4 && layout.collisions.length === 0 && layout.labelsOut === 0, JSON.stringify(layout))
  check(where, '(x) the path with the shorter horizon ends in hatching', layout.hatched === 1, JSON.stringify(layout))

  // Tab goes row by row: the buttons in the timeline are in the order of the rows.
  const order = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('[class*="tlRow"]')]
    const seen = [...document.querySelectorAll('[class*="tlRow"] button')].map((b) => rows.indexOf(b.closest('[class*="tlRow"]')))
    return { seen, sorted: seen.every((v, i) => i === 0 || v >= seen[i - 1]), tabbable: [...document.querySelectorAll('[class*="tlRow"] button')].every((b) => b.tabIndex === 0) }
  })
  check(where, '(x) Tab reaches the dots in row order, every one of them a stop', order.seen.length >= 8 && order.sorted && order.tabbable, JSON.stringify(order))

  // A dot reads out its sentence, and nothing moves.
  const before = (await card.boundingBox()).height
  const dot = page.getByRole('button', { name: /^Path B reaches/ }).first()
  await dot.hover()
  await page.waitForTimeout(150)
  const after = (await card.boundingBox()).height
  const text = await page.locator('[class*="matrixReadout"]').filter({ hasText: /reaches/ }).first().textContent()
  check(where, '(x) pointing at a dot writes its sentence under the timeline', text === (await dot.getAttribute('aria-label')), text)
  check(where, '(x) reading it does not change the card\'s height', near(before, after, 1), `${px(before)} then ${px(after)}`)

  // Follow one milestone: the dots of it are marked, the others dim, the year is labelled on each
  // path and a dashed line joins them, at the dots (the line is drawn from the data, not measured).
  await page.getByRole('button', { name: '750k', exact: true }).click()
  await page.mouse.move(2, 2)
  await page.waitForTimeout(250)
  const follow = await page.evaluate(() => {
    const centre = (el) => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2] }
    const picked = [...document.querySelectorAll('button[class*="tlDotPick"]')]
    const svg = document.querySelector('svg[class*="tlConnector"]')
    const poly = svg?.querySelector('polyline')
    const s = svg?.getBoundingClientRect()
    const pts = poly ? poly.getAttribute('points').split(' ').map((p) => p.split(',').map(Number)) : []
    const drawn = pts.map(([x, y]) => [s.left + (x / 1000) * s.width, s.top + (y / svg.viewBox.baseVal.height) * s.height])
    const off = drawn.map((p, i) => Math.hypot(p[0] - centre(picked[i])[0], p[1] - centre(picked[i])[1]))
    const dimmed = [...document.querySelectorAll('button[class*="tlDot"]')].filter((d) => !d.className.includes('tlDotPick')).map((d) => getComputedStyle(d).opacity)
    return { picked: picked.length, points: pts.length, off, dimmed, labels: [...document.querySelectorAll('[class*="tlLabelPick"]')].map((l) => l.textContent), pressed: document.querySelector('[class*="tl"] button[aria-pressed="true"]')?.textContent }
  })
  check(where, '(x) following 750k marks its dot on each path that reaches it and labels the year', follow.picked >= 2 && follow.pressed === '750k' && follow.labels.length === follow.picked && follow.labels.every((l) => /^\d+y$/.test(l)), JSON.stringify(follow))
  check(where, '(x) the other dots are dimmed', follow.dimmed.length > 0 && follow.dimmed.every((o) => Number(o) < 0.4), JSON.stringify(follow.dimmed))
  check(where, '(x) the dashed line goes through each of those dots', follow.points === follow.picked && follow.off.every((d) => d <= 1.5), JSON.stringify(follow))
  await page.getByRole('button', { name: 'Clear' }).click()
  check(where, '(x) Clear takes the line and the dimming away', (await page.locator('svg[class*="tlConnector"]').count()) === 0 && (await page.locator('[class*="tlDim"]').count()) === 0)

  // Back to the table, which is as it was.
  await timelineSwitch(page).getByRole('radio', { name: 'Table' }).click()
  await page.waitForTimeout(200)
  check(where, '(x) the table comes back at the height it had', near((await card.boundingBox()).height, tableHeight, 1), `${px(tableHeight)} then ${px((await card.boundingBox()).height)}`)
  await context.close()
}

async function checkTimelineSwitchAbsent(browser, engine) {
  // 899px is the phone's layout: the table alone, with no switch. 900px is the wide page, which has it.
  for (const [width, has] of [[899, false], [900, true]]) {
    const { page, context } = await openPlan(browser, { width, height: 800 })
    if (width === 899) {
      await page.getByRole('radio', { name: 'Milestones' }).click()
      await page.waitForTimeout(300)
    }
    check(`${engine} ${width}px`, has ? '(x) the switch is there' : '(x) there is no switch, only the table', (await timelineSwitch(page).count()) === (has ? 1 : 0) && (await page.getByRole('grid').count()) === 1)
    await context.close()
  }
  const { page, context, where } = await openPhoneMilestones(browser, 375, engine)
  check(where, '(x) there is no switch on a phone, only the table', (await timelineSwitch(page).count()) === 0 && (await page.getByRole('grid').count()) === 1)
  await context.close()
}

async function checkTimeline(browser, engine) {
  for (const screen of [{ name: '900x800', width: 900, height: 800 }, SCREENS[0], SCREENS[1], SCREENS[3]]) await checkTimelineAt(browser, engine, screen, 'dark')
  await checkTimelineAt(browser, engine, SCREENS[3], 'light')
  await checkTimelineSwitchAbsent(browser, engine)
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
        if (process.env.ONLY === 'toast') {
          await checkToastPlace(browser, engine)
          continue
        }
        if (process.env.ONLY === 'touch-targets') {
          await checkTouchTargets(browser, engine)
          continue
        }
        if (process.env.ONLY === 'y1') {
          await checkPointDecimal(browser, engine)
          continue
        }
        if (process.env.ONLY === 'y2') {
          await checkFirstDraft(browser, engine)
          continue
        }
        if (process.env.ONLY === 'y3') {
          await checkPhoneSaveReason(browser, engine)
          continue
        }
        if (process.env.ONLY === 'y4') {
          await checkTouchLeftovers(browser, engine)
          continue
        }
        if (process.env.ONLY === 'lever-focus') {
          await checkLeverFocus(browser, engine)
          continue
        }
        if (process.env.ONLY === 'milestone-timeline') {
          await checkTimeline(browser, engine)
          continue
        }
        if (process.env.ONLY === 'milestone-table') {
          await checkMilestoneTable(browser, engine)
          continue
        }
        for (const screen of SCREENS) await checkScreen(browser, screen, engine)
        await checkTabs(browser, engine)
        await checkLeverFocus(browser, engine)
        await checkThemesAndZoom(browser, engine)
        await checkLineColours(browser, engine)
        await checkBreakpoint(browser, engine)
        await checkTouch(browser, engine)
        await checkTouchTargets(browser, engine)
        await checkToastPlace(browser, engine)
        await checkOtherViews(browser, engine)
        await checkLeaveGuard(browser, engine)
        await checkBrowserPrompt(browser, engine)
        await checkPointDecimal(browser, engine)
        await checkFirstDraft(browser, engine)
        await checkPhoneSaveReason(browser, engine)
        await checkTouchLeftovers(browser, engine)
        await checkMilestoneTable(browser, engine)
        await checkTimeline(browser, engine)
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
