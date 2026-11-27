/**
 * The review view's pager ("Previous payment", "2 of 6", "Next payment" in its header), measured in a real browser for
 * `verify-review-card.mjs`, which hands over its own helpers. jsdom lays nothing out and plays no animation, so the unit
 * tests cannot see that the header still fits on the narrowest phone with a two-digit count, that each arrow is a full
 * tap target without making the header taller, that a move's animation ends and lets go, or that the pager steps
 * aside while a phone keyboard is up.
 */

/** Opens the review view on the tenth of the twenty invented payments, by way of "See all". */
async function openTenth(
  { openCard, dialog },
  browser,
  viewport,
  options,
) {
  const opened = await openCard(browser, viewport, 'twenty', options)
  const { page } = opened
  await page.getByRole('button', { name: /^See all/ }).click()
  const list = page.getByRole('dialog', { name: /^To review/ })
  await list.waitFor()
  await list
    .getByRole('button', { name: /^Review / })
    .nth(9)
    .click()
  await dialog(page)
    .getByText(/^From your bank/)
    .waitFor()
  await page.waitForTimeout(400)
  return opened
}

/** The header's parts, as boxes. */
async function headerBoxes(sheet) {
  return sheet.locator('header').evaluate((header) => {
    const rect = (el) => {
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { x: r.x, y: r.y, width: r.width, height: r.height }
    }
    const pager = header.querySelector('[role="group"]')
    return {
      header: rect(header),
      title: rect(header.querySelector('h2')),
      pager: rect(pager),
      previous: rect(header.querySelector('[aria-label="Previous payment"]')),
      next: rect(header.querySelector('[aria-label="Next payment"]')),
      close: rect(header.querySelector('[aria-label="Close"]')),
      sheetOverflow: header.closest('[role="dialog"]').scrollWidth - header.closest('[role="dialog"]').clientWidth,
    }
  })
}

const right = (r) => r.x + r.width

/** The header holds the title, a two-digit count and both arrows side by side, in one line, inside the sheet. */
export async function checkPagerFits(
  helpers,
  browser,
  viewport,
) {
  const { check, dialog, box, px, TAP, openCard } = helpers
  const where = `${viewport.name} review pager`
  const { page, context } = await openTenth(helpers, browser, viewport)
  const sheet = dialog(page)
  const count = sheet.getByRole('group', { name: 'Payments to review' })
  check(
    where,
    'the count reads "10 of 20"',
    (await count.textContent()).includes('10 of 20'),
    await count.textContent(),
  )
  const m = await headerBoxes(sheet)
  check(where, 'the title stays on one line', m.title.height < 30, box(m.title))
  check(where, 'the title ends before the pager', right(m.title) <= m.pager.x + 0.5, `${box(m.title)}, ${box(m.pager)}`)
  check(
    where,
    'the pager ends before the close cross',
    right(m.pager) <= m.close.x + 0.5,
    `${box(m.pager)}, ${box(m.close)}`,
  )
  for (const [name, r] of [
    ['Previous', m.previous],
    ['Next', m.next],
  ])
    check(where, `${name} is a ${TAP}px tap target`, r.width >= TAP - 0.5 && r.height >= TAP - 0.5, box(r))

  // Where an arrow's touch area reaches in over the count, a tap there is the arrow's.
  const hits = await page.evaluate(
    ([p, n]) => {
      const at = (
        x,
        y,
      ) => document.elementFromPoint(x, y)?.closest('button')?.getAttribute('aria-label') ?? null
      return [at(p.x + p.width - 2, p.y + p.height / 2), at(n.x + 2, n.y + n.height / 2)]
    },
    [m.previous, m.next],
  )
  check(
    where,
    "a tap on an arrow's inner edge, over the count, is the arrow's",
    hits[0] === 'Previous payment' && hits[1] === 'Next payment',
    hits.join(', '),
  )

  // The same header with one payment waiting, which has no pager: the pager must not make it taller.
  const single = await openCard(browser, viewport, 'one')
  await single.page
    .getByRole('button', { name: /^Review / })
    .first()
    .click()
  await dialog(single.page)
    .getByText(/^From your bank/)
    .waitFor()
  const without = await headerBoxes(dialog(single.page))
  check(where, 'there is no pager with one payment waiting', without.pager === null)
  check(
    where,
    'the pager pushes nothing past the sheet sideways',
    m.sheetOverflow <= without.sheetOverflow,
    `${px(m.sheetOverflow)} against ${px(without.sheetOverflow)}`,
  )
  check(
    where,
    'the header is no taller than without the pager',
    Math.abs(m.header.height - without.header.height) <= 0.5,
    `${px(m.header.height)} against ${px(without.header.height)}`,
  )
  await single.context.close()

  // A wider font than the app's (Verdana where there is one, else DejaVu Sans, a Linux default): the header must not
  // depend on the narrow fallback a given machine happens to pick.
  await page.addStyleTag({
    content:
      '[role="dialog"] header, [role="dialog"] header * { font-family: Verdana, "DejaVu Sans", sans-serif !important }',
  })
  await page.waitForTimeout(100)
  const wide = await headerBoxes(sheet)
  check(where, 'with a wide font the title still stays on one line', wide.title.height < 30, box(wide.title))
  check(
    where,
    'with a wide font the title still ends before the pager',
    right(wide.title) <= wide.pager.x + 0.5,
    `${box(wide.title)}, ${box(wide.pager)}`,
  )
  await context.close()
}

/** A move plays and lets go: the other payment shows, and the page is left with no animation class and not inert. */
export async function checkPagerMove(
  helpers,
  browser,
  viewport,
) {
  const { check, dialog } = helpers
  const where = `${viewport.name} review pager, moving`
  const { page, context } = await openTenth(helpers, browser, viewport, { motion: 'no-preference' })
  const sheet = dialog(page)
  // The payment on screen: the ones visited are kept, hidden.
  const amount = sheet.locator('form:not([hidden])').getByLabel(/^Amount/)
  const before = await amount.inputValue()
  const next = sheet.getByRole('button', { name: 'Next payment' })
  // Two presses in quick succession: a double tap moves once.
  await next.click()
  await next.click({ force: true })
  await page.waitForTimeout(700)
  const count = await sheet.getByRole('group', { name: 'Payments to review' }).textContent()
  check(where, 'a double tap moves one payment on', count.includes('11 of 20'), count)
  check(where, 'the other payment shows', (await amount.inputValue()) !== before, await amount.inputValue())
  const page_ = await sheet.locator('form:not([hidden])').evaluate((form) => {
    const wrap = form.parentElement
    return { classes: wrap.className, inert: wrap.inert }
  })
  check(where, 'the move has let go once it played', !/page(In|Out)/.test(page_.classes) && !page_.inert, page_.classes)
  // From the keyboard, where the cursor matters: a tapped button takes no focus in Safari.
  await sheet.getByRole('button', { name: 'Previous payment' }).focus()
  await page.keyboard.press('Enter')
  await page.waitForTimeout(700)
  const focused = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))
  check(where, 'the cursor stays on the arrow pressed', focused === 'Previous payment', String(focused))
  check(
    where,
    'Previous comes back with what it had',
    (await amount.inputValue()) === before,
    await amount.inputValue(),
  )
  await context.close()
}

/** While a phone keyboard is up the pager steps aside with the header, and comes back when it goes. */
export async function checkPagerKeyboard(
  helpers,
  browser,
  viewport,
) {
  const { check, dialog } = helpers
  const where = `${viewport.name} review pager, keyboard`
  const { page, context } = await openTenth(helpers, browser, viewport)
  const sheet = dialog(page)
  // By its label, not its role: a hidden pager is out of the accessibility tree, as it should be.
  const group = sheet.locator('[aria-label="Payments to review"]')
  const seen = () => group.evaluate((el) => getComputedStyle(el).visibility === 'visible')
  const mark = (on) => page.evaluate((v) => document.documentElement.toggleAttribute('data-keyboard-open', v), on)
  await mark(true)
  await page.waitForTimeout(400)
  const phone = viewport.width < 560 || viewport.height < 560
  check(where, phone ? 'the pager steps aside' : 'the pager stays on a dialog', (await seen()) === !phone)
  if (phone)
    check(
      where,
      'a screen reader does not find it while it is aside',
      (await sheet.getByRole('group', { name: 'Payments to review' }).count()) === 0,
    )
  await mark(false)
  await page.waitForTimeout(400)
  check(where, 'the pager is back once the keyboard goes', await seen())
  check(
    where,
    'and a screen reader finds it again',
    (await sheet.getByRole('group', { name: 'Payments to review' }).count()) === 1,
  )
  await context.close()
}
