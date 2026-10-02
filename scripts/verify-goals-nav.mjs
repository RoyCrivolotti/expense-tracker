#!/usr/bin/env node
/**
 * Playwright check of the Goals tab's phone navigation, on the demo instance: the sticky view
 * row, the pinned Adjust stack, the chips, per-view scroll memory, label fit and keyboard focus.
 *
 * jsdom lays nothing out, so the unit tests fake every position this depends on. This is the
 * run against real layout. Manual, like verify:goals-tabs: it needs a browser and takes about a
 * minute, so it is not part of `npm run verify` or CI.
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

/** The air a section's top is left under what is pinned, in px (GAP_PX), give or take rounding. */
const GAP = { min: 7, max: 9 }

/** What every check runs at: a phone, and the narrowest one the layout is meant for. */
const PHONES = [
  { name: '375x812', width: 375, height: 812 },
  { name: '320x568', width: 320, height: 568 },
]

const failures = []

function report(ok, where, what, detail) {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${where}: ${what}${ok ? '' : ` (${detail})`}`)
  if (!ok) failures.push(`${where}: ${what} (${detail})`)
}

/** `detail` is only read when the check fails, and says what was measured instead. */
function check(where, what, ok, detail = '') {
  report(Boolean(ok), where, what, detail)
}

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

/** A fresh page on the demo instance, on the Goals tab. */
async function openGoals(browser, { width, height, root = null }) {
  const context = await browser.newContext({
    viewport: { width, height },
    screen: { width, height },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    colorScheme: 'light',
    // Smooth scrolls would be measured mid-flight; what matters here is where they end.
    reducedMotion: 'reduce',
  })
  const page = await context.newPage()
  page.on('pageerror', (e) => failures.push(`page error: ${e.message}`))
  await page.goto(`${BASE}/`)
  await page.waitForSelector('text=Recent activity', { timeout: 15000 })
  if (root) await page.addStyleTag({ content: `html { font-size: ${root}; }` })
  await page.getByRole('button', { name: 'Goals', exact: true }).click()
  await page.getByRole('tablist', { name: 'Goals view' }).waitFor({ timeout: 15000 })
  await page.waitForSelector('text=Invested portfolio projection', { timeout: 15000 })
  await settled(page)
  return { page, context }
}

const tab = (page, name) => page.getByRole('tab', { name, exact: true })
const chip = (page, name) => page.getByRole('navigation', { name: 'Adjust sections' }).getByRole('button', { name, exact: true })

/** What is pinned or fixed over the page, and where the sections of Adjust are. */
function measure(page) {
  return page.evaluate(() => {
    const box = (el) => {
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height }
    }
    const sections = {}
    for (const key of ['portfolio', 'housing', 'fire', 'tracking', 'events']) {
      sections[key] = document.getElementById(`goals-adjust-${key}`)?.getBoundingClientRect().top ?? null
    }
    const stack = document.getElementById('goals-adjust-stack')
    const marked = document.querySelector('#goals-adjust-stack [aria-current="true"]')
    return {
      y: window.scrollY,
      max: document.documentElement.scrollHeight - window.innerHeight,
      header: box(document.querySelector('header')),
      row: box(document.getElementById('goals-nav')),
      rowTop: parseFloat(getComputedStyle(document.getElementById('goals-nav')).top),
      stack: box(stack),
      stackPosition: stack ? getComputedStyle(stack).position : null,
      bar: box(document.querySelector('nav[aria-label="Sections"]')),
      sections,
      marked: marked ? marked.textContent : null,
    }
  })
}

const near = (a, b, tolerance = 0.5) => Math.abs(a - b) <= tolerance
const px = (n) => `${Math.round(n * 10) / 10}px`

/** The row sticks just under the header, tucked 1px beneath it so no hairline shows between. */
async function checkRowSticksUnderHeader(page, where) {
  await scrollTo(page, 400)
  const m = await measure(page)
  check(
    where,
    '(a) the view row sticks to the header height less the 1px tuck once the page has scrolled',
    near(m.row.top, m.header.height - 1) && near(m.rowTop, m.header.height - 1),
    `row is ${px(m.row.top)} down, its sticky top is ${px(m.rowTop)}, the header is ${px(m.header.height)} tall`,
  )
  await scrollTo(page, 0)
}

/** On first load the hero chart is wholly on screen above the bottom bar, where the screen is tall. */
async function checkChartAboveBottomBar(page, where) {
  const geometry = await page.evaluate(() => {
    const heading = [...document.querySelectorAll('*')].find((el) => el.children.length === 0 && el.textContent === 'Invested portfolio projection')
    const chart = heading?.closest('section, div[class*="card"], div')?.parentElement?.querySelector('svg[role="img"]')
    const r = chart?.getBoundingClientRect()
    const bar = document.querySelector('nav[aria-label="Sections"]').getBoundingClientRect()
    return r ? { top: r.top, bottom: r.bottom, barTop: bar.top, scrolled: window.scrollY } : null
  })
  check(where, '(b) the hero chart is found', geometry !== null, 'no chart svg after the "Invested portfolio projection" heading')
  if (!geometry) return
  check(
    where,
    '(b) the hero chart is above the bottom bar on first load',
    geometry.scrolled === 0 && geometry.bottom <= geometry.barTop,
    `chart ends at ${px(geometry.bottom)}, the bottom bar starts at ${px(geometry.barTop)}, scrolled ${px(geometry.scrolled)}`,
  )
}

function gapOf(m, key) {
  return m.sections[key] - m.stack.bottom
}

async function checkAdjust(browser, phone) {
  const where = `${phone.name} Adjust`
  const { page, context } = await openGoals(browser, phone)
  await tab(page, 'Adjust').tap()
  await settled(page)

  let m = await measure(page)
  if (phone.name === '375x812') {
    check(where, '(c) the pinned stack ends at 267px', near(m.stack.bottom, 267, 1), `it ends at ${px(m.stack.bottom)}`)
  }
  check(where, '(c) the stack is pinned', m.stackPosition === 'sticky', `its position is ${m.stackPosition}`)
  const first = gapOf(m, 'portfolio')
  check(
    where,
    '(c) the first visit lands the first section 7-9px under the stack',
    first >= GAP.min && first <= GAP.max,
    `it is ${px(first)} under it`,
  )

  // The marked chip follows the page, a few pixels at a time, without skipping or flickering.
  const followed = await page.evaluate(async () => {
    const seen = []
    const mark = () => document.querySelector('#goals-adjust-stack [aria-current="true"]')?.textContent ?? null
    const frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    window.scrollTo(0, 0)
    await frame()
    seen.push(mark())
    for (let guard = 0; guard < 2000; guard++) {
      const before = window.scrollY
      window.scrollBy(0, 4)
      await frame()
      const now = mark()
      if (now !== seen[seen.length - 1]) seen.push(now)
      if (window.scrollY === before) break
    }
    return seen
  })
  // On a tall screen the last two sections never reach the line (the page ends first), so with
  // the demo data the mark goes Portfolio, Housing, FIRE. A shorter screen gets further down
  // them. Either way it moves down the chips one at a time, never back and never past one.
  const order = ['Portfolio', 'Housing', 'FIRE', 'Tracking', 'Events']
  const inOrder = followed.every((label, i) => label === order[i])
  check(
    where,
    '(c) the marked chip follows a scroll in 4px steps, one chip at a time and in order',
    inOrder && followed.length >= 3,
    `it went ${followed.join(', ')}`,
  )
  if (phone.height >= 812) {
    check(where, '(c) with the demo data it goes Portfolio, Housing, FIRE', followed.join(', ') === 'Portfolio, Housing, FIRE', `it went ${followed.join(', ')}`)
  }

  for (const key of ['Portfolio', 'Housing', 'FIRE', 'Tracking', 'Events']) {
    await chip(page, key).tap()
    await settled(page)
    m = await measure(page)
    const gap = gapOf(m, key.toLowerCase())
    const lands = gap >= GAP.min && gap <= GAP.max
    const atEnd = m.y >= m.max - 1
    if (key === 'Tracking' || key === 'Events') {
      // The end of the page comes before they can reach the stack, so all that can be asked is
      // that the page went as far as it goes and the chip says where it is.
      check(where, `(c) the ${key} chip is marked, and the page scrolled as far as it goes`, m.marked === key && (atEnd || lands), `marked ${m.marked}, ${px(gap)} under the stack, at ${px(m.y)} of ${px(m.max)}`)
    } else {
      check(where, `(c) the ${key} chip lands its section 7-9px under the stack`, lands && m.marked === key, `${px(gap)} under it, marked ${m.marked}`)
    }
  }

  // The last chip tapped (Events) is still marked after the page moves without the viewer.
  await page.evaluate(() => window.scrollBy(0, -300))
  await settled(page)
  m = await measure(page)
  check(where, '(c) a tapped chip stays marked while the page moves on its own', m.marked === 'Events', `marked ${m.marked}`)
  await page.mouse.move(phone.width / 2, phone.height / 2)
  await page.mouse.wheel(0, -200)
  await settled(page)
  m = await measure(page)
  check(where, '(c) a tapped chip is let go of at a wheel event', m.marked !== 'Events', `still marked ${m.marked} at ${px(m.y)}`)

  await context.close()
}

async function checkMemory(browser, phone) {
  const where = `${phone.name} Chart`
  const { page, context } = await openGoals(browser, phone)
  const room = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)
  check(where, '(d) the Chart page is long enough to scroll to 900px', room >= 900, `it scrolls ${px(room)}`)

  await scrollTo(page, 900)
  for (const name of ['Adjust', 'Progress', 'Assumptions']) {
    await tab(page, name).tap()
    await settled(page)
  }
  await tab(page, 'Chart').tap()
  const back = await settled(page)
  check(where, '(d) Chart comes back to 900px after Adjust, Progress and Assumptions', near(back, 900, 1), `it came back to ${px(back)}`)

  // A link out of a view leaves it too, without the row being touched.
  await page.getByRole('radio', { name: 'Nominal' }).tap()
  const link = page.getByRole('button', { name: 'Open Assumptions' })
  await link.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  const left = await settled(page)
  await link.tap()
  await page.getByLabel('Assumed inflation').waitFor({ timeout: 5000 })
  await settled(page)
  await tab(page, 'Chart').tap()
  const returned = await settled(page)
  check(where, '(d) a view left by a link, not the row, comes back to where it was left', near(returned, left, 1), `left at ${px(left)}, came back to ${px(returned)}`)

  await context.close()
}

/**
 * Every label of the row shown whole: inside its segment and inside the bar, at the size it is
 * set. Each segment has an unpainted tap area that reaches past its edges (a ::before), which
 * would count as overflow, so it is switched off for the measurement.
 */
async function labelsFit(page) {
  const hideTapAreas = await page.addStyleTag({ content: '[role="tablist"] [role="tab"]::before { display: none !important; }' })
  const fits = await measureLabels(page)
  await hideTapAreas.evaluate((el) => el.remove())
  return fits
}

function measureLabels(page) {
  return page.evaluate(() => {
    const bar = document.querySelector('[role="tablist"][aria-label="Goals view"]').getBoundingClientRect()
    return [...document.querySelectorAll('[role="tablist"][aria-label="Goals view"] [role="tab"]')].map((seg) => {
      const range = document.createRange()
      range.selectNodeContents(seg)
      const text = range.getBoundingClientRect()
      const box = seg.getBoundingClientRect()
      return {
        label: seg.textContent,
        scrollWidth: seg.scrollWidth,
        clientWidth: seg.clientWidth,
        textWidth: text.width,
        textInBar: text.left >= bar.left - 0.5 && text.right <= bar.right + 0.5,
        textInSegment: text.left >= box.left - 0.5 && text.right <= box.right + 0.5,
        textOverflow: getComputedStyle(seg).textOverflow,
        lines: Math.round(text.height / parseFloat(getComputedStyle(seg).lineHeight || '1')),
      }
    })
  })
}

async function checkLabels(browser) {
  const cases = [
    { name: '320x568', width: 320, height: 568, root: null },
    { name: '375x812 at 150% text', width: 375, height: 812, root: '150%' },
  ]
  for (const c of cases) {
    const where = `${c.name} view row`
    const { page, context } = await openGoals(browser, c)
    for (const seg of await labelsFit(page)) {
      check(
        where,
        `(e) "${seg.label}" is shown whole`,
        seg.scrollWidth <= seg.clientWidth && seg.textInBar && seg.textInSegment && seg.textOverflow !== 'ellipsis' && seg.lines <= 1,
        `scrollWidth ${seg.scrollWidth} against clientWidth ${seg.clientWidth}, text ${px(seg.textWidth)} wide, in its segment ${seg.textInSegment}, in the bar ${seg.textInBar}, ${seg.lines} line(s)`,
      )
    }
    await context.close()
  }
}

async function checkLandscape(browser) {
  const where = '667x375 Adjust'
  const { page, context } = await openGoals(browser, { name: where, width: 667, height: 375 })
  await tab(page, 'Adjust').tap()
  await settled(page)
  await scrollTo(page, 300)
  const m = await measure(page)
  check(where, '(f) the stack scrolls away with the page', m.stackPosition === 'static', `its position is ${m.stackPosition}`)
  const room = m.bar.top - m.row.bottom
  check(where, '(f) at least 150px of page is visible between the row and the bottom bar', room >= 150, `${px(room)} between them`)
  await context.close()
}

/**
 * Walks focus through Adjust with the keyboard and, at each stop, asks what is at a 5x5 grid of
 * points over the focused control. One the header, the row, the stack or the bottom bar covers
 * all over is a control the viewer cannot see.
 */
async function walkFocus(page, direction) {
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
        ['view row', document.getElementById('goals-nav')],
        ['pinned stack', document.getElementById('goals-adjust-stack')],
        ['bottom bar', document.querySelector('nav[aria-label="Sections"]')],
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
      return { name, visible, by: [...by].join(' and ') || 'something else' }
    })

  await page.evaluate((dir) => {
    const all = [...document.querySelectorAll('button, a[href], input, select, textarea, summary, [tabindex="0"]')].filter(
      (el) => !el.disabled && el.tabIndex >= 0 && el.getBoundingClientRect().width > 0,
    )
    window.scrollTo(0, dir === 'back' ? document.documentElement.scrollHeight : 0)
    ;(dir === 'back' ? all[all.length - 1] : all[0]).focus({ preventScroll: true })
  }, direction)

  const stops = []
  for (let i = 0; i < 120; i++) {
    await page.keyboard.press(direction === 'back' ? 'Shift+Tab' : 'Tab')
    await page.waitForTimeout(60)
    const stop = await coveredBy()
    if (stop.gone) break
    stops.push(stop)
  }
  return stops
}

async function checkFocus(browser, phone) {
  const where = `${phone.name} Adjust`
  const { page, context } = await openGoals(browser, phone)
  await tab(page, 'Adjust').tap()
  await settled(page)
  for (const [direction, keys] of [['back', 'Shift+Tab'], ['forward', 'Tab']]) {
    const stops = await walkFocus(page, direction)
    check(where, `(g) a ${keys} walk visits the controls of Adjust`, stops.length >= 20, `it visited ${stops.length}`)
    const hidden = stops.filter((s) => s.visible === 0)
    check(
      where,
      `(g) no control the ${keys} walk reaches is covered by what is pinned (${stops.length} stops)`,
      hidden.length === 0,
      hidden.map((s) => `"${s.name}" under ${s.by}`).join('; '),
    )
  }
  await context.close()
}

async function main() {
  if (await answers()) throw new Error(`Something already answers on ${BASE}; set CAPTURE_PORT to a free port.`)
  const dev = startDev()
  try {
    await waitForServer()
    const { chromium } = await import('playwright')
    const browser = await chromium.launch()
    try {
      for (const phone of PHONES) {
        console.log(`\n${phone.name}`)
        {
          const { page, context } = await openGoals(browser, phone)
          await checkRowSticksUnderHeader(page, `${phone.name} Chart`)
          if (phone.height >= 812) await checkChartAboveBottomBar(page, `${phone.name} Chart`)
          await context.close()
        }
        await checkAdjust(browser, phone)
        await checkMemory(browser, phone)
        await checkFocus(browser, phone)
      }
      console.log('\nLabels')
      await checkLabels(browser)
      console.log('\nLandscape')
      await checkLandscape(browser)
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
  console.log('\nGoals phone navigation OK')
}

main().catch((err) => {
  console.error(err.message ?? err)
  process.exit(1)
})
