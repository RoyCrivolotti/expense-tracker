#!/usr/bin/env node
/**
 * Playwright check of the Dashboard's "To review" card and its review view, on the demo instance with invented
 * payments (`verifyReviewCardData.mjs`) answered in place of the list.
 *
 * jsdom lays nothing out, so the unit tests cannot see what this measures: that a tap anywhere on a row opens it,
 * that a long name is cut and the row stays one line, that "Dismiss duplicate" cannot be pressed through the row under
 * it, that the review view's buttons stay in view while the form scrolls, and that the money colours can be read.
 *
 * Starts its own dev server on CAPTURE_PORT (5173 unless set), with DOCS_CAPTURE=1 so it has the seeded demo data and
 * nothing real. ENGINES picks the browsers (chromium and webkit unless set). Exits 1 and says what was measured if
 * anything fails.
 */
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { NOW, REFUSAL, SETS } from './verifyReviewCardData.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PORT = process.env.CAPTURE_PORT ?? '5173'
const BASE = `http://127.0.0.1:${PORT}`
const ENGINES = (process.env.ENGINES ?? 'chromium,webkit').split(',')

const PHONE = { name: '375x812', width: 375, height: 812 }
const SHORT = { name: '375x667', width: 375, height: 667 }
const WIDE = { name: '1280x800', width: 1280, height: 800 }
/** An iPad mini upright, where a sheet is already a dialog. */
const TABLET = { name: '744x1133', width: 744, height: 1133 }
/** The narrowest phone: where the heading beside "Dismiss duplicate" has to wrap. */
const NARROW = { name: '320x700', width: 320, height: 700 }

/** A row is one line: 58px at the app's type size. */
const ROW_HEIGHT = 58
/** The smallest tap area the app gives a button. */
const TAP = 44
/** What body text has to reach against its background. */
const CONTRAST = 4.5

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

const px = (n) => `${Math.round(n * 10) / 10}px`
const box = (r) => `${px(r.x)},${px(r.y)} ${px(r.width)}x${px(r.height)}`
const overlap = (
  a,
  b,
) =>
  Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 0.5 &&
  Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 0.5

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

/**
 * The Dashboard with one of the invented lists waiting, the card open unless `fold` says otherwise. `refuse` makes the
 * first save answer that the payment looks like an entry the person already has.
 */
async function openCard(
  browser,
  viewport,
  set,
  { theme = 'dark', fold = 'open', refuse = false } = {},
) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 2,
    locale: 'en-GB',
    colorScheme: theme,
    reducedMotion: 'reduce',
  })
  await context.clock.setFixedTime(new Date(NOW))
  const recommendations = SETS[set]()
  await context.route('**/api/recommendations?*', (route) =>
    route.fulfill({ json: { recommendations, next: null, openCount: recommendations.length } }),
  )
  let refused = !refuse
  await context.route('**/api/recommendations/*/submit', (route) => {
    if (refused) return route.fulfill({ json: { id: 9000 } })
    refused = true
    return route.fulfill({ status: 409, json: REFUSAL })
  })
  const page = await context.newPage()
  await page.addInitScript(
    ([selected, folded]) => {
      localStorage.setItem('exp-theme', selected)
      localStorage.setItem('exp-review-card', folded)
      document.documentElement?.setAttribute('data-exp-theme', selected)
    },
    [theme, fold],
  )
  await page.goto(`${BASE}/`)
  await page
    .getByRole('heading', { name: /to review/ })
    .first()
    .waitFor({ timeout: 30000 })
  await page.waitForTimeout(400)
  return { page, context }
}

const dialog = (page) => page.getByRole('dialog', { name: 'Review payment' })

/** The card itself: a wide screen has other lists beside it. */
const card = (page) => page.locator('section', { has: page.getByRole('heading', { name: /to review/ }) }).first()

async function closeDialog(page) {
  await page.getByRole('button', { name: 'Close' }).click()
  await dialog(page).waitFor({ state: 'detached' })
}

/** A tap at a point of the page opens the review view. Closes it again. */
async function opensAt(
  page,
  where,
  what,
  x,
  y,
) {
  await page.mouse.click(x, y)
  const opened = await dialog(page)
    .waitFor({ timeout: 3000 })
    .then(
      () => true,
      () => false,
    )
  check(where, `a tap on ${what} opens the review view`, opened, `nothing opened at ${px(x)},${px(y)}`)
  if (opened) await closeDialog(page)
}

/** The whole row is the button: its amount, its note and the empty part beside its name. */
async function checkRowTap(
  browser,
  viewport,
) {
  const where = `${viewport.name} row`
  const { page, context } = await openCard(browser, viewport, 'seven')
  const row = card(page).getByRole('listitem').first()
  const line = await row.boundingBox()
  const title = await row.getByRole('button', { name: /^Review / }).boundingBox()
  const pill = await row.getByRole('button', { name: /^Add / }).boundingBox()
  const middle = line.y + line.height / 2
  await opensAt(page, where, 'the amount', line.x + 12, middle - 8)
  await opensAt(page, where, 'the day under the amount', line.x + 12, middle + 12)
  await opensAt(page, where, 'the note', title.x + 6, line.y + line.height - 14)
  await opensAt(page, where, 'the empty part beside the name', pill.x - 14, title.y + title.height / 2)

  await page.mouse.click(pill.x + pill.width / 2, pill.y + pill.height / 2)
  await page.waitForTimeout(300)
  check(where, 'a tap on Add adds, and opens nothing', (await dialog(page).count()) === 0)

  // A row in doubt: its Review pill is not a stop of its own, so the focus comes back to the row.
  const doubt = card(page).getByRole('listitem').nth(1)
  await doubt.getByText('Review', { exact: true }).click()
  await dialog(page).waitFor()
  await closeDialog(page)
  const focus = await page.evaluate(() => {
    const el = document.activeElement
    return { label: el?.getAttribute('aria-label') ?? '', hidden: el?.getAttribute('aria-hidden') }
  })
  check(
    where,
    'closing the form after a press on Review leaves the focus on the row',
    focus.label.startsWith('Review ') && focus.hidden !== 'true',
    `focus on "${focus.label}", aria-hidden ${focus.hidden}`,
  )
  await context.close()
}

/** Long names are cut with an ellipsis, six-digit sums fit, and every row is still one line. */
async function checkLongContent(
  browser,
  viewport,
) {
  const where = `${viewport.name} long names`
  const { page, context } = await openCard(browser, viewport, 'long')
  const measured = await page.evaluate(() => {
    const card = [...document.querySelectorAll('section')].find((s) =>
      /to review/.test(s.querySelector('h2')?.textContent ?? ''),
    )
    const edge = card.getBoundingClientRect().right
    const rows = [...card.querySelectorAll('li')].map((li) => {
      const text = li.querySelector('button[aria-label^="Review"] span')
      const style = getComputedStyle(text)
      return {
        height: li.getBoundingClientRect().height,
        right: Math.max(...[...li.querySelectorAll('*')].map((el) => el.getBoundingClientRect().right)),
        cut: text.scrollWidth > text.clientWidth,
        ellipsis: style.textOverflow === 'ellipsis' && style.whiteSpace === 'nowrap' && style.overflowX === 'hidden',
      }
    })
    const strip = card.querySelector('[aria-expanded]').getBoundingClientRect()
    const chips = [...card.querySelectorAll('[aria-expanded] [class*="_total_"]')].map((c) => c.getBoundingClientRect())
    const count = [...card.querySelectorAll('[aria-expanded] span')].find((el) => /to review$/.test(el.textContent))
    const doc = document.documentElement
    return {
      edge,
      rows,
      countRight: count.getBoundingClientRect().right,
      strip: { left: strip.left, right: strip.right, top: strip.top, bottom: strip.bottom },
      chips: chips.map((c) => ({ left: c.left, right: c.right, top: c.top, bottom: c.bottom })),
      sideways: doc.scrollWidth - doc.clientWidth,
    }
  })
  check(where, 'the page does not scroll sideways', measured.sideways <= 0, `by ${px(measured.sideways)}`)
  check(
    where,
    `every row is one line of ${ROW_HEIGHT}px`,
    measured.rows.every((r) => Math.abs(r.height - ROW_HEIGHT) <= 1.5),
    measured.rows.map((r) => px(r.height)).join(', '),
  )
  check(
    where,
    'nothing on a row runs past the card',
    measured.rows.every((r) => r.right <= measured.edge + 0.5),
    `card ends at ${px(measured.edge)}, rows reach ${measured.rows.map((r) => px(r.right)).join(', ')}`,
  )
  check(
    where,
    'a name is cut with an ellipsis, never wrapped',
    measured.rows.every((r) => r.ellipsis),
  )
  if (viewport.width < 768)
    check(where, 'the longest name is the one cut', measured.rows[0].cut, 'the first row shows its whole name')
  const [income, expense] = measured.chips
  check(where, 'both six-digit totals are shown', measured.chips.length === 2, `${measured.chips.length} chips`)
  if (income && expense) {
    const inside = measured.chips.every(
      (c) =>
        c.left >= measured.strip.left &&
        c.right <= measured.strip.right &&
        c.top >= measured.strip.top &&
        c.bottom <= measured.strip.bottom,
    )
    check(where, 'both totals sit inside the card’s line', inside, JSON.stringify(measured))
    // Side by side where there is room, one under the other where there is not: never over the count or each other.
    const stacked = expense.top >= income.bottom - 0.5
    check(
      where,
      'the two totals stack where they do not fit side by side',
      measured.chips.every((c) => c.left >= measured.countRight) && (stacked || expense.left >= income.right),
      `count ends at ${px(measured.countRight)}, income ${px(income.left)} to ${px(income.right)}, expense from ${px(expense.left)}, ${stacked ? 'stacked' : 'on one line'}`,
    )
  }
  await context.close()
}

/** "Dismiss duplicate" has a full tap area that reaches neither the row under it nor that row's button. */
async function checkPair(
  browser,
  viewport,
) {
  const where = `${viewport.name} same-bill pair`
  const { page, context } = await openCard(browser, viewport, 'pair')
  const tied = card(page).getByRole('listitem').filter({ hasText: 'Is this a duplicate?' })
  const dismiss = await tied.getByRole('button', { name: /^Dismiss duplicate/ }).boundingBox()
  const rowTap = await tied.getByRole('button', { name: /^Review / }).evaluate((el) => {
    const r = el.closest('div[class*="_line_"]').getBoundingClientRect()
    return { x: r.x, y: r.y, width: r.width, height: r.height }
  })
  const review = await tied.getByText('Review', { exact: true }).evaluate((el) => {
    const r = el.closest('button').getBoundingClientRect()
    return { x: r.x, y: r.y, width: r.width, height: r.height }
  })
  const heading = await tied.getByText('Is this a duplicate?').boundingBox()
  const face = await tied.getByText('Dismiss duplicate', { exact: true }).boundingBox()
  const off = heading.y + heading.height / 2 - (face.y + face.height / 2)
  check(where, 'the heading is level with "Dismiss duplicate"', Math.abs(off) <= 1, `${px(off)} off its middle`)
  check(
    where,
    'the heading ends before the button',
    heading.x + heading.width <= face.x,
    `${box(heading)}, ${box(face)}`,
  )
  check(
    where,
    'the whole of "Dismiss duplicate" is inside its tap area',
    face.x >= dismiss.x - 0.5 && face.x + face.width <= dismiss.x + dismiss.width + 0.5,
    `button ${box(dismiss)}, face ${box(face)}`,
  )
  check(
    where,
    'no second line sits under the heading',
    (await tied.getByText(/If it's duplicated/).count()) === 0,
    'the line is still there',
  )
  check(where, `"Dismiss duplicate" has a ${TAP}px tap area`, dismiss.height >= TAP - 0.5, box(dismiss))
  check(
    where,
    'its tap area stays off the row under it',
    !overlap(dismiss, rowTap),
    `button ${box(dismiss)}, row ${box(rowTap)}`,
  )
  check(
    where,
    'its tap area stays off the Review button under it',
    !overlap(dismiss, review),
    `button ${box(dismiss)}, Review ${box(review)}`,
  )
  await page.mouse.click(dismiss.x + dismiss.width / 2, dismiss.y + dismiss.height - 2)
  await page.waitForTimeout(300)
  check(
    where,
    'a tap at its foot dismisses and opens nothing',
    (await dialog(page).count()) === 0 && (await tied.count()) === 0,
  )
  await context.close()
}

/** Whether a button can be seen and pressed where it is: inside the screen, and on top at its own middle. */
function inView(button) {
  return button.evaluate((el) => {
    const r = el.getBoundingClientRect()
    const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
    return {
      ok: r.top >= 0 && r.bottom <= window.innerHeight && r.height > 0 && (top === el || el.contains(top)),
      at: `${Math.round(r.top)} to ${Math.round(r.bottom)} of ${window.innerHeight}`,
    }
  })
}

/** The bar's buttons are in view with the form scrolled to its top, its middle and its end. */
async function barStays(
  page,
  where,
  names,
) {
  const sheet = dialog(page)
  const length = await sheet.evaluate((el) => el.scrollHeight - el.clientHeight)
  for (const [place, top] of [
    ['on opening', null],
    ['at the top', 0],
    ['halfway', length / 2],
    ['at the end', length],
  ]) {
    if (top !== null) await sheet.evaluate((el, y) => el.scrollTo(0, y), top)
    await page.waitForTimeout(80)
    for (const name of names) {
      const seen = await inView(sheet.getByRole('button', { name }))
      check(where, `"${name.source ?? name}" is in view ${place}`, seen.ok, seen.at)
    }
  }
  const foot = await sheet.evaluate((el) => {
    const bar = [...el.querySelectorAll('button')].find((b) => b.textContent === "Don't add").parentElement
    return {
      gap: el.getBoundingClientRect().bottom - bar.getBoundingClientRect().bottom,
      sticky: getComputedStyle(bar).position,
    }
  })
  check(
    where,
    'the bar reaches the foot of the sheet, over its padding',
    foot.sticky === 'sticky' && Math.abs(foot.gap) <= 2,
    `position ${foot.sticky}, ${px(foot.gap)} short`,
  )
}

const REVIEWS = [
  { set: 'seven', what: 'a ready payment', row: /^Review Coffee/ },
  { set: 'seven', what: 'an unnamed payment', row: /^Review Unnamed payment, −43,80/ },
  { set: 'pair', what: 'the announcement of a pair', row: /^Review Unnamed payment, −62,15/ },
  { set: 'duplicates', what: 'a possible duplicate with a long name', row: /^Review Supermercados/ },
  { set: 'asks', what: 'a card to ask about', row: /^Review Parking/ },
  { set: 'asks', what: 'a payment not in euros', row: /^Review Online shop/ },
]

/** "Don't add" and the save button stay in view in the review view, whatever sits above the fields. */
async function checkBar(
  browser,
  viewport,
) {
  for (const { set, what, row } of REVIEWS) {
    const where = `${viewport.name} review view, ${what}`
    const { page, context } = await openCard(browser, viewport, set)
    await card(page).getByRole('button', { name: row }).first().click()
    await dialog(page).waitFor()
    await dialog(page)
      .getByText(/^From your bank/)
      .waitFor()
    await page.waitForTimeout(300)
    await barStays(page, where, ["Don't add", /^Add (and next|transaction)/])
    await context.close()
  }

  const where = `${viewport.name} review view, after a refused save`
  // A form long enough that its top is out of sight from its end, which is where the save button was pressed.
  const { page, context } = await openCard(browser, viewport, 'duplicates', { refuse: true })
  await card(page)
    .getByRole('button', { name: /^Review Supermercados/ })
    .click()
  await dialog(page)
    .getByText(/^From your bank/)
    .waitFor()
  await dialog(page).evaluate((el) => el.scrollTo(0, el.scrollHeight))
  await dialog(page)
    .getByRole('button', { name: /^Add (and next|transaction)/ })
    .click()
  await dialog(page).getByRole('button', { name: 'Add anyway' }).waitFor()
  await page.waitForTimeout(300)
  // The whole block, from its first line to "Link instead", between the top of the sheet and the bar.
  const block = await dialog(page).evaluate((el) => {
    const alert = el.querySelector('[role="alert"]').getBoundingClientRect()
    const bar = [...el.querySelectorAll('button')].find((b) => b.textContent === "Don't add").parentElement
    const top = el.getBoundingClientRect().top
    const foot = bar.getBoundingClientRect().top
    return {
      ok: alert.top >= top - 0.5 && alert.bottom <= foot + 0.5,
      at: `${Math.round(alert.top)} to ${Math.round(alert.bottom)}, sheet from ${Math.round(top)}, bar at ${Math.round(foot)}`,
    }
  })
  check(where, 'the entry it found is brought into view, with "Link instead"', block.ok, block.at)
  await barStays(page, where, ["Don't add", 'Add anyway'])
  await context.close()
}

/**
 * What the review view does while a phone keyboard is up. A headless browser draws no keyboard, so the window is cut
 * to what one leaves and the page is marked the way `useKeyboardOpen` marks it on a phone, and what the stylesheets and
 * `useFieldReveal` do with that mark is measured: the bar out of the way, the bank's box down to one line held at the
 * top, the field being typed in just under it with the middle of the field above still in sight, and all of it back
 * once the mark goes.
 */
async function checkKeyboard(
  browser,
  viewport,
) {
  const where = `${viewport.name} review view, keyboard up`
  const { page, context } = await openCard(browser, viewport, 'seven')
  await card(page)
    .getByRole('button', { name: /^Review Unnamed payment/ })
    .click()
  const sheet = dialog(page)
  await sheet.getByText(/^From your bank/).waitFor()
  await page.waitForTimeout(300)
  const description = sheet.getByLabel('Description', { exact: true })
  const amount = sheet.getByLabel(/^Amount/)
  // The window is cut to the room the sheet has on a phone with the keyboard up, so it is as short as there and has to
  // scroll. That room is what the keyboard leaves less the status bar, which the sheet stays below and a headless
  // browser does not have; measured in the iOS 27 simulator it is 339 - 20 of the iPhone SE's 667pt and 478 - 62 of
  // the iPhone 17's 874, both about 48%.
  const mark = async (on) => {
    await page.setViewportSize({
      width: viewport.width,
      height: on ? Math.round(viewport.height * 0.48) : viewport.height,
    })
    // On a phone the sheet has already shrunk to the visible area when the mark appears: both come from the same
    // resize, and the mark is set after the render that moved the sheet.
    await page.waitForTimeout(150)
    await page.evaluate((on) => document.documentElement.toggleAttribute('data-keyboard-open', on), on)
  }

  // Focus alone is a hardware keyboard or a desktop: nothing changes.
  await description.focus()
  await page.waitForTimeout(150)
  let seen = await inView(sheet.getByRole('button', { name: "Don't add" }))
  check(where, 'a focused field without a phone keyboard leaves the bar in place', seen.ok, seen.at)

  await mark(true)
  await page.waitForTimeout(400)
  const measure = () =>
    sheet.evaluate((el) => {
      const rect = (node) => node.getBoundingClientRect()
      const from = el.querySelector('[data-reveal-cover]')
      const bar = [...el.querySelectorAll('button')].find((b) => b.textContent === "Don't add").parentElement
      const message = [...from.querySelectorAll('p')].find((p) => p.textContent.startsWith('Example Bank'))
      const focused = document.activeElement
      const label = focused.closest('label')
      const amountField = el.querySelector('input[inputmode="decimal"]')
      const barRect = rect(bar)
      const hit = document.elementFromPoint(barRect.x + barRect.width / 2, barRect.y + barRect.height / 2)
      return {
        barShown: getComputedStyle(bar).visibility !== 'hidden' && bar.contains(hit),
        position: getComputedStyle(from).position,
        fromHeight: rect(from).height,
        messageHeight: message ? rect(message.parentElement.parentElement).height : -1,
        amountShown: getComputedStyle(from.querySelector('b')).opacity,
        coverBottom: rect(from).bottom,
        sheetTop: rect(el).top,
        captionTop: label ? rect(label).top : NaN,
        amountMiddle: rect(amountField).top + rect(amountField).height / 2,
        atEnd: el.scrollTop >= el.scrollHeight - el.clientHeight - 1,
      }
    })
  let m = await measure()
  check(where, 'the bar is out of the way', !m.barShown)
  // Scrolled back to the top, the line sits under the header, and the sheet's colour it carries above it must stop
  // short of the header.
  await sheet.evaluate((el) => el.scrollTo(0, 0))
  await page.waitForTimeout(100)
  const clear = await sheet.evaluate((el) => {
    const line = el.querySelector('[data-reveal-cover]')
    const reach = getComputedStyle(line)
      .boxShadow.split(/,(?![^(]*\))/)
      .map((shadow) => shadow.match(/-?[\d.]+px/g).map(parseFloat))
      .map(([, y, , spread]) => spread - y)
    const header = el.querySelector('header').getBoundingClientRect().bottom
    return { gap: line.getBoundingClientRect().top - Math.max(...reach) - header }
  })
  check(where, "the line's edge leaves the header unpainted", clear.gap >= 0, `${px(clear.gap)} to spare`)
  // Back to Description by way of Amount, as the keyboard's arrows would go, which brings it under the line again.
  await amount.focus()
  await description.focus()
  await page.waitForTimeout(400)
  m = await measure()
  check(
    where,
    "the bank's box is one line",
    m.fromHeight < 48 && m.messageHeight < 1,
    `box ${px(m.fromHeight)}, message ${px(m.messageHeight)}`,
  )
  check(where, 'the amount shows beside the day', m.amountShown === '1', `opacity ${m.amountShown}`)
  check(where, 'the line sticks while the keyboard is up', m.position === 'sticky', m.position)
  check(
    where,
    'Description is just under the line',
    m.captionTop >= m.coverBottom - 0.5 && (m.captionTop - m.coverBottom < 60 || m.atEnd),
    `caption at ${px(m.captionTop)}, line ends at ${px(m.coverBottom)}`,
  )
  check(
    where,
    "the middle of Amount above it stays in sight, for the keyboard's up arrow",
    m.amountMiddle > m.coverBottom,
    `middle at ${px(m.amountMiddle)}, line ends at ${px(m.coverBottom)}`,
  )

  await description.fill('din')
  await page.waitForTimeout(200)
  const options = await sheet.getByRole('listbox').getByRole('option').all()
  let shown = 0
  for (const option of options) if ((await inView(option)).ok) shown++
  check(
    where,
    'every suggestion under Description is in view',
    options.length > 1 && shown === options.length,
    `${shown} of ${options.length}`,
  )

  await amount.focus()
  await page.waitForTimeout(200)
  m = await measure()
  check(
    where,
    'moving to Amount brings it under the line',
    m.captionTop >= m.coverBottom - 0.5 && (m.captionTop - m.coverBottom < 30 || m.atEnd),
    `caption at ${px(m.captionTop)}, line ends at ${px(m.coverBottom)}`,
  )

  await sheet.evaluate((el) => el.scrollTo(0, el.scrollHeight))
  await page.waitForTimeout(150)
  const held = await sheet.evaluate((el) => {
    const line = el.querySelector('[data-reveal-cover]')
    const r = line.getBoundingClientRect()
    const on = document.elementFromPoint(r.x + r.width - 8, r.y + r.height / 2)
    return { gap: r.top - el.getBoundingClientRect().top, onTop: line.contains(on) }
  })
  check(
    where,
    'the line stays at the top of the sheet, over the fields, as it scrolls',
    held.gap < 40 && held.onTop,
    `${px(held.gap)} below the sheet top, on top ${held.onTop}`,
  )

  await mark(false)
  await page.waitForTimeout(400)
  m = await measure()
  check(where, 'the bar is back once the keyboard goes', m.barShown)
  check(
    where,
    "the bank's whole message is back",
    m.position !== 'sticky' && m.messageHeight > 15,
    `${m.position}, message ${px(m.messageHeight)}`,
  )

  // A save sent from the keyboard (Return) that fails keeps the bar, so its reason is on screen. This payment has no
  // category, and saving it is refused for that.
  await amount.focus()
  await mark(true)
  await page.waitForTimeout(400)
  await amount.press('Enter')
  const error = sheet.getByText('Choose a category')
  await error.waitFor({ state: 'attached' })
  await page.waitForTimeout(300)
  m = await measure()
  seen = await inView(error)
  check(where, 'a refused save keeps the bar and its reason in view', m.barShown && seen.ok, seen.at)
  await context.close()
}

/**
 * An iPad's docked keyboard sets the same mark, but there the sheet is a dialog in the middle of the screen with room
 * to spare, so nothing changes: the bar stays, the bank's message stays whole, and the sheet does not scroll. Its
 * layout viewport keeps its height under the keyboard, so the window is not cut.
 */
async function checkKeyboardOnDialog(
  browser,
  viewport,
) {
  const where = `${viewport.name} review view, docked keyboard`
  const { page, context } = await openCard(browser, viewport, 'seven')
  await card(page)
    .getByRole('button', { name: /^Review Unnamed payment/ })
    .click()
  const sheet = dialog(page)
  await sheet.getByText(/^From your bank/).waitFor()
  await page.waitForTimeout(300)
  await sheet.getByLabel('Description', { exact: true }).focus()
  await page.evaluate(() => document.documentElement.toggleAttribute('data-keyboard-open', true))
  await page.waitForTimeout(400)
  const seen = await inView(sheet.getByRole('button', { name: "Don't add", includeHidden: true }))
  check(where, 'the bar stays', seen.ok, seen.at)
  const state = await sheet.evaluate((el) => ({
    position: getComputedStyle(el.querySelector('[data-reveal-cover]')).position,
    scrolled: el.scrollTop,
  }))
  check(where, "the bank's box stays as it is", state.position !== 'sticky', state.position)
  check(where, 'the sheet does not scroll', state.scrolled === 0, px(state.scrolled))
  await context.close()
}

/** The contrast of an element's text against what is painted behind it, tints mixed down to the first solid colour. */
function contrastOf(target) {
  return target.evaluate((el) => {
    const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
    const rgba = (colour) => {
      ctx.clearRect(0, 0, 1, 1)
      ctx.fillStyle = colour
      ctx.fillRect(0, 0, 1, 1)
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
      return [r, g, b, a / 255]
    }
    const layers = []
    for (let node = el; node; node = node.parentElement) {
      const layer = rgba(getComputedStyle(node).backgroundColor)
      if (layer[3] > 0) layers.push(layer)
      if (layer[3] >= 0.999) break
    }
    let behind = [255, 255, 255]
    for (const [r, g, b, a] of layers.reverse()) behind = [r, g, b].map((c, i) => c * a + behind[i] * (1 - a))
    const lum = (c) => {
      const [r, g, b] = c.map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    const [hi, lo] = [lum(rgba(getComputedStyle(el).color)), lum(behind)].sort((a, b) => b - a)
    return (hi + 0.05) / (lo + 0.05)
  })
}

/** Money in and money out can be read on the card in both themes: the totals and a row's green amount. */
async function checkColours(
  browser,
  theme,
) {
  const where = `${theme} theme colours`
  const { page, context } = await openCard(browser, PHONE, 'seven', { theme })
  await page.getByRole('button', { name: /^See all/ }).click()
  const sheet = page.getByRole('dialog')
  await sheet.waitFor()
  const strip = page.locator('[aria-expanded] [class*="_total_"]')
  for (const [what, target] of [
    ['the money-in total', strip.nth(0)],
    ['the money-out total', strip.nth(1)],
    ['an income row’s amount', sheet.getByText(/^\+1\.850,00/)],
    ['a possible-duplicate chip', sheet.getByText('Possible duplicate')],
  ]) {
    const ratio = await contrastOf(target)
    check(where, `${what} reaches ${CONTRAST}:1`, ratio >= CONTRAST, `${Math.round(ratio * 100) / 100}:1`)
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
      const browser = await playwright[engine].launch()
      try {
        console.log(`\n${engine}`)
        for (const viewport of [PHONE, WIDE]) {
          await checkRowTap(browser, viewport)
          await checkLongContent(browser, viewport)
        }
        for (const viewport of [NARROW, PHONE, WIDE]) await checkPair(browser, viewport)
        for (const viewport of [SHORT, PHONE, WIDE]) await checkBar(browser, viewport)
        for (const viewport of [SHORT, PHONE]) await checkKeyboard(browser, viewport)
        await checkKeyboardOnDialog(browser, TABLET)
        for (const theme of ['light', 'dark']) await checkColours(browser, theme)
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
  console.log('\nTo review card OK')
}

main().catch((err) => {
  console.error(err.message ?? err)
  process.exit(1)
})
