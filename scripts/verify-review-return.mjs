#!/usr/bin/env node
/**
 * Playwright check that closing a payment opened from the full "To review" list goes back to that list, where it was,
 * on the demo instance with invented payments (`verifyReviewCardData.mjs`) answered in place of the list.
 *
 * jsdom has no layout or scrolling, so the unit tests cannot see what this measures: that the form is the sheet on
 * top, that the list keeps its scroll place under it, that the page behind does not move, and which sheet a tap at the
 * middle of the screen reaches.
 *
 * Starts its own dev server on CAPTURE_PORT (5173 unless set), with DOCS_CAPTURE=1 so it has the seeded demo data and
 * nothing real. ENGINES picks the browsers (chromium and webkit unless set). SHOTS=<dir> also saves a picture of
 * each state, at both widths, for a PR. Exits 1 and says what was measured if anything fails.
 */
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { NOW, SETS } from './verifyReviewCardData.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PORT = process.env.CAPTURE_PORT ?? '5173'
const BASE = `http://127.0.0.1:${PORT}`
const ENGINES = (process.env.ENGINES ?? 'chromium,webkit').split(',')
const SHOTS = process.env.SHOTS ?? null

const PHONE = { name: '375x812', width: 375, height: 812 }
const WIDE = { name: '1280x800', width: 1280, height: 800 }
/** How far down the full list is scrolled before a payment is opened from it. */
const SCROLLED = 420
/** How long the invented server takes to answer a read of the list. */
const READ_MS = 60

const failures = []

/** `detail` is only read when the check fails, and says what was measured instead. */
function check(
  where,
  what,
  ok,
  detail = '',
) {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${where}: ${what}${ok ? '' : ` (${detail})`}`)
  if (!ok) failures.push(`${where}: ${what} (${detail})`)
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
    /* already exited */
  }
}

async function waitForServer(ms = 30000) {
  const start = Date.now()
  while (Date.now() - start < ms) {
    try {
      if ((await fetch(BASE)).ok) return
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 400))
  }
  throw new Error('Dev server did not start')
}

/**
 * The Dashboard with an invented list waiting and the card open. The list answers as the server would: a payment that
 * was saved or not added is gone from the next read.
 */
async function openDashboard(
  browser,
  viewport,
  set,
  { motion = false } = {},
) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 2,
    locale: 'en-GB',
    colorScheme: 'dark',
    reducedMotion: motion ? 'no-preference' : 'reduce',
  })
  await context.clock.setFixedTime(new Date(NOW))
  const open = SETS[set]()
  const settle = (route) => {
    const id = new URL(route.request().url()).pathname.split('/').at(-2)
    const at = open.findIndex((r) => r.id === id)
    if (at >= 0) open.splice(at, 1)
  }
  // A read takes a moment, as over a network, so the one a save asks for lands after the form has closed.
  await context.route('**/api/recommendations?*', async (route) => {
    const answer = { recommendations: [...open], next: null, openCount: open.length }
    await new Promise((done) => setTimeout(done, READ_MS))
    return route.fulfill({ json: answer })
  })
  let id = 9000
  // The real route answers with the transaction it created: what was posted, with its id.
  await context.route('**/api/recommendations/*/submit', (route) => {
    settle(route)
    return route.fulfill({ json: { ...route.request().postDataJSON(), id: id++ } })
  })
  await context.route('**/api/recommendations/*/dismiss', (route) => {
    settle(route)
    return route.fulfill({ json: { ok: true } })
  })
  const page = await context.newPage()
  await page.addInitScript(() => {
    localStorage.setItem('exp-theme', 'dark')
    localStorage.setItem('exp-review-card', 'open')
    document.documentElement?.setAttribute('data-exp-theme', 'dark')
  })
  await page.goto(`${BASE}/`)
  await page
    .getByRole('heading', { name: /to review/ })
    .first()
    .waitFor({ timeout: 30000 })
  await page.waitForTimeout(400)
  return { page, context }
}

const form = (page) => page.getByRole('dialog', { name: 'Review payment' })
const list = (page) => page.getByRole('dialog', { name: /^To review/ })
/** The sheet itself is what scrolls. */
const scroller = (page) => list(page)

async function shot(
  page,
  viewport,
  name,
) {
  if (!SHOTS) return
  mkdirSync(SHOTS, { recursive: true })
  await page.waitForTimeout(250)
  await page.screenshot({ path: join(SHOTS, `${name}-${viewport.width}.png`) })
}

/** Opens the full list, scrolls it, and opens the first payment that shows below the fold. */
async function openFromList(page) {
  await page.getByRole('button', { name: /^See all/ }).click()
  await list(page).waitFor()
  await page.waitForTimeout(300)
  await scroller(page).evaluate((el, y) => (el.scrollTop = y), SCROLLED)
  await page.waitForTimeout(100)
  const scrolled = await scroller(page).evaluate((el) => el.scrollTop)
  if (scrolled < SCROLLED - 1) throw new Error(`The list did not scroll: ${scrolled}px`)
  const top = await scroller(page).evaluate((el) => el.getBoundingClientRect().top + 40)
  const rows = list(page).getByRole('button', { name: /^Review / })
  const count = await rows.count()
  for (let i = 0; i < count; i++) {
    const box = await rows.nth(i).boundingBox()
    if (box && box.y > top) {
      const label = await rows.nth(i).getAttribute('aria-label')
      await rows.nth(i).click()
      await form(page).waitFor()
      await page.waitForTimeout(300)
      return label
    }
  }
  throw new Error('No row below the fold')
}

const pageScroll = (page) => page.evaluate(() => window.scrollY)
/** Null when the list is not there, so a check says so rather than waiting for it. */
const listScroll = async (page) =>
  (await list(page).count()) === 0 ? null : scroller(page).evaluate((el) => el.scrollTop)

/** Which sheet a tap in the middle of the screen lands on. */
const topAtMiddle = (page) =>
  page.evaluate(() => {
    const hit = document.elementFromPoint(innerWidth / 2, innerHeight / 2)
    return hit?.closest('[role="dialog"]')?.getAttribute('aria-label') ?? 'none'
  })

async function closeForm(
  page,
  how,
) {
  if (how === 'cross') await form(page).getByRole('button', { name: 'Close' }).click()
  else await page.keyboard.press('Escape')
  await form(page).waitFor({ state: 'detached' })
  await page.waitForTimeout(300)
}

async function dontAdd(
  page,
  times,
) {
  for (let i = 0; i < times; i++) {
    await form(page).getByRole('button', { name: "Don't add" }).click()
    await page.waitForTimeout(250)
  }
}

async function checkReturn(
  browser,
  viewport,
  how,
) {
  const where = `${viewport.name} closed with ${how}`
  const { page, context } = await openDashboard(browser, viewport, 'twenty')
  const before = await pageScroll(page)
  const opened = await openFromList(page)
  const shown = await listScroll(page)
  await shot(page, viewport, `stacked-${how}`)
  check(
    where,
    'the payment is the sheet on top',
    (await topAtMiddle(page)) === 'Review payment',
    await topAtMiddle(page),
  )
  check(
    where,
    'the list under it is inert',
    (await list(page).count()) === 1 && (await list(page).evaluate((el) => el.closest('[inert]') !== null)),
    'no list under the payment',
  )

  await closeForm(page, how)
  await shot(page, viewport, `after-closed-${how}`)
  check(where, 'the list is back', (await list(page).count()) === 1)
  const after = await listScroll(page)
  check(where, 'at the same scroll place', after !== null && Math.abs(after - shown) < 1, `${shown}px, then ${after}`)
  check(
    where,
    'the page behind did not move',
    (await pageScroll(page)) === before,
    `${before} -> ${await pageScroll(page)}`,
  )
  check(where, 'a tap reaches the list now', (await topAtMiddle(page)).startsWith('To review'), await topAtMiddle(page))
  const focus = await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '')
  check(where, 'the focus is back on the row it was opened from', focus === opened, focus)

  if ((await list(page).count()) === 1) {
    await page.keyboard.press('Escape')
    await list(page).waitFor({ state: 'detached' })
    check(where, 'a second Escape closes the list', (await list(page).count()) === 0)
  }
  await context.close()
}

async function checkDecidedTwo(
  browser,
  viewport,
) {
  const where = `${viewport.name} decided two`
  const { page, context } = await openDashboard(browser, viewport, 'twenty')
  await page.getByRole('button', { name: /^See all/ }).click()
  const heading = await list(page).getAttribute('aria-label')
  await page.keyboard.press('Escape')
  await list(page).waitFor({ state: 'detached' })
  await openFromList(page)
  await dontAdd(page, 2)
  await closeForm(page, 'cross')
  await shot(page, viewport, 'after-decided-two')
  if ((await list(page).count()) === 0) {
    check(where, 'the list is back', false, 'no list')
    await context.close()
    return
  }
  const now = await list(page).getAttribute('aria-label')
  check(
    where,
    'the list counts two fewer',
    now === heading.replace(/\d+/, (n) => String(Number(n) - 2)),
    `${heading} -> ${now}`,
  )
  const { top, max } = await scroller(page).evaluate((el) => ({
    top: el.scrollTop,
    max: el.scrollHeight - el.clientHeight,
  }))
  check(where, 'its scroll place is inside the shorter list', top > 0 && top <= max + 1, `${top} of ${max}`)
  await context.close()
}

/** Saves the payment on screen with the first category, by whichever button the form offers for it. */
async function save(page) {
  // A page arriving slides in, and a button under way cannot be pressed: let it land first.
  await page.waitForTimeout(450)
  // The pages visited before stay mounted, hidden, so only the one on screen is asked.
  await form(page).getByLabel('Category').filter({ visible: true }).selectOption({ index: 1 })
  await form(page)
    .getByRole('button', { name: /^Add (and next|transaction)/ })
    .click()
  await page.waitForTimeout(250)
}

/**
 * Watches every frame for the next three seconds: whether each sheet has started leaving (a leaving sheet is `inert`), and whether
 * the list says "All caught up". Read it back with `framesOf`.
 */
const watchFrames = (page) =>
  page.evaluate(() => {
    const frames = []
    window.__frames = frames
    const overlay = (name) =>
      [...document.querySelectorAll('[role="dialog"]')]
        .find((d) => d.getAttribute('aria-label')?.startsWith(name))
        ?.closest('[role="presentation"]')
    const sample = () => {
      const payment = overlay('Review payment')
      const list = overlay('To review')
      const frame = {
        payment: payment ? (payment.hasAttribute('inert') ? 'leaving' : 'open') : 'gone',
        list: list ? (list.hasAttribute('inert') ? 'leaving' : 'open') : 'gone',
        caughtUp: Boolean(list?.textContent?.includes('All caught up')),
      }
      // Only the frames where something changed: a headless browser can draw far more than 60 a second.
      const last = frames.at(-1)
      if (!last || Object.keys(frame).some((k) => frame[k] !== last[k])) frames.push(frame)
      if (performance.now() - start < 3000) requestAnimationFrame(sample)
    }
    const start = performance.now()
    requestAnimationFrame(sample)
  })
const framesOf = (page) => page.evaluate(() => window.__frames)

/**
 * The list emptied from the payment on top of it, three ways: the last one not added, the last one saved (whose
 * read lands after the form has closed), and every one saved after moving with the arrows. Both sheets leave in the
 * same frame, the list as it was rather than empty, and it lands on the Dashboard.
 */
async function checkEmptied(
  browser,
  viewport,
  how,
) {
  const where = `${viewport.name} emptied, ${how}`
  const { page, context } = await openDashboard(browser, viewport, 'seven', { motion: true })
  await page.getByRole('button', { name: /^See all/ }).click()
  await list(page).waitFor()
  await list(page)
    .getByRole('button', { name: /^Review / })
    .nth(how === 'arrows' ? 2 : 0)
    .click()
  await form(page).waitFor()
  await page.waitForTimeout(300)
  if (how === 'arrows') {
    await form(page).getByRole('button', { name: 'Next payment' }).click()
    await form(page).getByRole('button', { name: 'Previous payment' }).click()
    await form(page).getByRole('button', { name: 'Previous payment' }).click()
    for (let left = 7; left > 1; left--) await save(page)
  } else {
    for (let left = 7; left > 1; left--) await dontAdd(page, 1)
  }
  // The last press is the page's own click, so the watch starts right before it: at 1280 the undo bar of the decision
  // before covers the form's buttons, and a pointer click would wait those five seconds out.
  if (how !== 'not added') {
    await page.waitForTimeout(450)
    await form(page).getByLabel('Category').filter({ visible: true }).selectOption({ index: 1 })
  }
  const last = form(page).getByRole('button', { name: how === 'not added' ? "Don't add" : 'Add transaction' })
  await watchFrames(page)
  await last.evaluate((button) => button.click())
  await page.waitForTimeout(READ_MS + 700)
  await shot(page, viewport, `after-emptied-${how.replace(' ', '-')}`)
  check(where, 'the form has closed', (await form(page).count()) === 0)
  check(where, 'no empty list comes back', (await list(page).count()) === 0)
  check(where, 'it lands on the Dashboard', (await page.getByRole('heading', { name: /to review/ }).count()) === 0)
  const frames = await framesOf(page)
  const first = frames.findIndex((f) => f.payment === 'leaving')
  check(
    where,
    'the list leaves in the frame the payment does, or once its read has landed',
    first >= 0 && frames.slice(first).every((f) => f.payment !== 'open' && (f.list !== 'open' || how !== 'not added')),
    JSON.stringify(frames.slice(Math.max(0, first - 1), first + 3)),
  )
  check(
    where,
    'the list never says All caught up on its way out',
    frames.every((f) => !f.caughtUp),
    `${frames.filter((f) => f.caughtUp).length} frames`,
  )
  await context.close()
}

async function checkFromCard(
  browser,
  viewport,
) {
  const where = `${viewport.name} from the card`
  const { page, context } = await openDashboard(browser, viewport, 'seven')
  const card = page.locator('section', { has: page.getByRole('heading', { name: /to review/ }) }).first()
  await card
    .getByRole('button', { name: /^Review / })
    .first()
    .click()
  await form(page).waitFor()
  await closeForm(page, 'cross')
  await shot(page, viewport, 'after-from-card')
  check(where, 'closing lands on the Dashboard, with no list', (await list(page).count()) === 0)
  check(where, 'the card is there', (await page.getByRole('heading', { name: /to review/ }).count()) > 0)
  await context.close()
}

async function main() {
  const dev = startDev()
  try {
    await waitForServer()
    const playwright = await import('playwright')
    for (const engine of ENGINES) {
      const browser = await playwright[engine].launch()
      try {
        console.log(`\n${engine}`)
        for (const viewport of [PHONE, WIDE]) {
          for (const how of ['cross', 'Escape']) await checkReturn(browser, viewport, how)
          await checkDecidedTwo(browser, viewport)
          for (const how of ['not added', 'saved', 'arrows']) await checkEmptied(browser, viewport, how)
          await checkFromCard(browser, viewport)
        }
      } finally {
        await browser.close()
      }
    }
  } finally {
    stopDev(dev)
  }
  if (failures.length > 0) {
    console.error(`\n${failures.length} check(s) failed:`)
    for (const f of failures) console.error(`  - ${f}`)
    process.exit(1)
  }
  console.log('\nReturn to the full list OK')
}

main().catch((err) => {
  console.error(err.message ?? err)
  process.exit(1)
})
