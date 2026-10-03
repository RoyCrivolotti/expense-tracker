#!/usr/bin/env node
/**
 * Playwright check of the Goals Plan page on a wide screen, on the demo instance: one column with
 * no scroll of its own, the levers bar in reach (held to the bottom edge while its place is below
 * the fold, under the header once scrolled past), the inputs panel folding in and out, the
 * scenario menu, the stars that move an input to the bar and back, the order Tab goes in and that
 * nothing it reaches is under the bar, and the question asked before leaving Goals with an unsaved edit.
 *
 * jsdom lays nothing out, so the unit tests cannot say any of this. Manual, like
 * verify:goals-nav: it needs a browser and takes a few minutes, so it is not part of
 * `npm run verify` or CI.
 *
 * Starts its own dev server on CAPTURE_PORT (5173 unless set), with DOCS_CAPTURE=1 so it has the
 * seeded demo data and nothing real. `ENGINES=chromium,webkit` (the default is chromium) also
 * runs it in Safari's engine, and `ONLY=touch-targets` runs just the touch-screen sizes (a minute).
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
  }
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
  check(where, '(t) taking a star out says which input left, with Undo', (await toast.textContent()) === 'Removed Real return from the barUndo' && (await labels()).length === before.length - 1)
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
        if (process.env.ONLY === 'touch-targets') {
          await checkTouchTargets(browser, engine)
          continue
        }
        for (const screen of SCREENS) await checkScreen(browser, screen, engine)
        await checkTabs(browser, engine)
        await checkThemesAndZoom(browser, engine)
        await checkLineColours(browser, engine)
        await checkBreakpoint(browser, engine)
        await checkTouch(browser, engine)
        await checkTouchTargets(browser, engine)
        await checkOtherViews(browser, engine)
        await checkLeaveGuard(browser, engine)
        await checkBrowserPrompt(browser, engine)
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
