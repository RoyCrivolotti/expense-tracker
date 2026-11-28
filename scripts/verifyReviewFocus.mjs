/**
 * Whether a field the review view moves focus to can be seen, measured in a real browser for `verify-review-card.mjs`,
 * which hands over its own helpers. The buttons are pinned to the foot of the sheet, and a browser counts a field under
 * them as in view: without room kept for the bar, Tab or a field focused on a short screen stays behind it. jsdom lays
 * nothing out, so the unit tests cannot see it.
 */

/** Room the check allows for rounding between the field's foot and the bar's top. */
const SLACK = 0.5

/** Where the focused control is against the sheet's top and the bar, or null when focus is outside the form's fields. */
function focusedPlace(sheet) {
  return sheet.evaluate((el) => {
    const field = document.activeElement
    const bar = el.querySelector('[data-pinned-foot]')
    if (!field || !el.contains(field) || !bar || bar.contains(field) || field === el) return null
    if (!field.matches('input, select, textarea, button, [tabindex]')) return null
    const r = field.getBoundingClientRect()
    const name =
      field.getAttribute('aria-label') ??
      field.labels?.[0]?.textContent?.trim().slice(0, 30) ??
      field.textContent?.trim().slice(0, 30)
    return {
      name: `${field.tagName.toLowerCase()} "${name}"`,
      top: r.top,
      bottom: r.bottom,
      sheetTop: el.getBoundingClientRect().top,
      barTop: bar.getBoundingClientRect().top,
    }
  })
}

function clearOfBar(
  { check, px },
  where,
  place,
) {
  check(
    where,
    `${place.name} is not behind the bar`,
    place.bottom <= place.barTop + SLACK,
    `foot at ${px(place.bottom)}, bar from ${px(place.barTop)}`,
  )
}

/** Tab from the top of the review view to the bar: no field it stops on is under the bar. */
async function tabsClear(
  helpers,
  page,
  where,
) {
  const sheet = helpers.dialog(page)
  await sheet.evaluate((el) => el.scrollTo(0, 0))
  await sheet.locator('header [aria-label="Close"]').focus()
  let stops = 0
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab')
    await page.waitForTimeout(60)
    const inBar = await sheet.evaluate((el) => el.querySelector('[data-pinned-foot]')?.contains(document.activeElement))
    if (inBar) break
    const place = await focusedPlace(sheet)
    if (!place) continue
    stops++
    clearOfBar(helpers, where, place)
  }
  helpers.check(where, 'Tab reaches the bar through the fields', stops > 3, `${stops} stops`)
}

/** Each field focused by itself, the way a tap or a script moves focus, with the form at its top. */
async function focusClear(
  helpers,
  page,
  where,
) {
  const sheet = helpers.dialog(page)
  for (const label of ['Amount', 'Description', 'Category', 'Account']) {
    await sheet.evaluate((el) => el.scrollTo(0, 0))
    const field = sheet.getByLabel(label, { exact: true }).first()
    if ((await field.count()) === 0) continue
    await field.focus()
    await page.waitForTimeout(120)
    const place = await focusedPlace(sheet)
    if (place) clearOfBar(helpers, `${where}, ${label} focused`, place)
  }
}

const CASES = [
  { set: 'duplicates', what: 'a possible duplicate', row: /^Review Supermercados/ },
  { set: 'asks', what: 'a card to ask about', row: /^Review Parking/ },
  { set: 'seven', what: 'a ready payment', row: /^Review Coffee/ },
]

/** No field Tab or focus lands on is left under the review view's pinned bar, with no keyboard up. */
export async function checkFocusClear(
  helpers,
  browser,
  viewport,
) {
  for (const { set, what, row } of CASES) {
    const where = `${viewport.name} review view, ${what}`
    const { page, context } = await helpers.openCard(browser, viewport, set)
    await page.getByRole('button', { name: row }).first().click()
    await helpers
      .dialog(page)
      .getByText(/^From your bank/)
      .waitFor()
    await page.waitForTimeout(300)
    await tabsClear(helpers, page, where)
    await focusClear(helpers, page, where)
    await context.close()
  }
}
