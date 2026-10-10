import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_LEVERS, formatCentsCompact, type MoneyFormat } from '../../../../engine'
import { EU_MONEY_FORMAT } from '../../../../engine/money'
import { installFakeMatchMedia } from '../../../../testing/fakeMatchMedia'
import { makeScenario } from '../../../../testing/factories'
import { AssumedInflationContext } from '../../../hooks/assumedInflationContext'
import { MoneyFormatContext } from '../../../hooks/moneyFormatContext'
import { LeversBar } from './LeversBar'

function makeDraft(overrides = {}) {
  const { id, ...rest } = makeScenario({ startInvestedCents: 100_000_000, monthlyContributionCents: 50_000, ...overrides })
  void id
  return rest
}

function renderBar(overrides: Partial<Parameters<typeof LeversBar>[0]> = {}, draftOverrides = {}) {
  const draft = makeDraft(draftOverrides)
  const onChange = vi.fn()
  const onToggle = vi.fn()
  render(
    <LeversBar
      draft={draft}
      resultDraft={draft}
      keys={DEFAULT_LEVERS}
      expanded={false}
      panelId="inputs-panel"
      onChange={onChange}
      onToggle={onToggle}
      {...overrides}
    />,
  )
  return { onChange, onToggle }
}

describe('LeversBar', () => {
  it('says under the monthly amount that it changes from a date, since the amount is only where it starts', () => {
    renderBar(
      {},
      {
        planStartDate: '2026-06-25',
        contributionSchedule: [
          { from: '2027-03', monthlyCents: 200_000 },
          { from: '2028-01', monthlyCents: 0 },
        ],
      },
    )
    expect(screen.getByText("then 2.000,00 € from Mar '27 (+1 more)")).toBeInTheDocument()
    expect(screen.getByLabelText('Monthly investing')).toHaveValue('500')
  })

  it('says nothing under the monthly amount when it never changes', () => {
    renderBar()
    expect(screen.queryByText(/^then /)).not.toBeInTheDocument()
  })

  it('shows each lever with its value as the app writes it', () => {
    renderBar()
    expect(screen.getByLabelText('Monthly investing')).toHaveValue('500')
    expect(screen.getByLabelText('Starting invested')).toHaveValue('1.000.000')
    expect(screen.getByLabelText('Horizon (years)')).toHaveValue('30')
    expect(screen.getByRole('textbox', { name: 'Real return (%/yr, after inflation)' })).toHaveValue('7,0')
    expect(screen.getByText('Never')).toBeInTheDocument()
  })

  it('puts a dollar sign before the digits and a euro sign after them, as the money is written', () => {
    const usd: MoneyFormat = { locale: 'en-US', symbol: '$', symbolPosition: 'prefix', decimalSeparator: '.' }
    const draft = makeDraft()
    render(
      <MoneyFormatContext.Provider value={usd}>
        <LeversBar draft={draft} resultDraft={draft} keys={DEFAULT_LEVERS} expanded={false} panelId="p" onChange={vi.fn()} onToggle={vi.fn()} />
      </MoneyFormatContext.Provider>,
    )
    const order = (label: string) => {
      const field = screen.getByRole('textbox', { name: label })
      const unit = field.parentElement!.querySelector('[class*="leverUnit"]')!
      return field.compareDocumentPosition(unit) & Node.DOCUMENT_POSITION_FOLLOWING ? 'after' : 'before'
    }
    expect(order('Monthly investing')).toBe('before')
    expect(screen.getByLabelText('Monthly investing')).toHaveValue('500')
    // The years and the percentage keep their unit after the number.
    expect(order('Horizon (years)')).toBe('after')
    expect(order('Real return (%/yr, after inflation)')).toBe('after')
  })

  it('writes a euro amount with the sign after the digits', () => {
    renderBar()
    const field = screen.getByLabelText('Monthly investing')
    const unit = field.parentElement!.querySelector('[class*="leverUnit"]')!
    expect(field.compareDocumentPosition(unit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('says "1 yr" for a one year horizon', () => {
    renderBar({}, { horizonYears: 1 })
    expect(screen.getByText('yr')).toBeInTheDocument()
    expect(screen.queryByText('yrs')).not.toBeInTheDocument()
  })

  it('keeps the cents of an amount that has them', () => {
    renderBar({}, { monthlyContributionCents: 12_345 })
    expect(screen.getByLabelText('Monthly investing')).toHaveValue('123,45')
  })

  it('commits a typed amount on blur and on Enter, in cents', async () => {
    const { onChange } = renderBar()
    const field = screen.getByLabelText('Monthly investing')
    await userEvent.clear(field)
    await userEvent.type(field, '750')
    await userEvent.tab()
    expect(onChange).toHaveBeenLastCalledWith({ monthlyContributionCents: 75_000 })

    const start = screen.getByLabelText('Starting invested')
    await userEvent.clear(start)
    await userEvent.type(start, '2.000.000{Enter}')
    expect(onChange).toHaveBeenLastCalledWith({ startInvestedCents: 200_000_000 })
  })

  it('reads a point typed on a numeric keypad as the decimal mark, and "1.500" as a thousand and a half', async () => {
    const { onChange } = renderBar()
    const field = screen.getByLabelText('Monthly investing')
    await userEvent.clear(field)
    await userEvent.type(field, '2500.75{Enter}')
    expect(onChange).toHaveBeenLastCalledWith({ monthlyContributionCents: 250_075 })
    await userEvent.clear(field)
    await userEvent.type(field, '1.500{Enter}')
    expect(onChange).toHaveBeenLastCalledWith({ monthlyContributionCents: 150_000 })
  })

  it('reads a comma typed on a numeric keypad as the decimal mark in a dollar format, and "1,500" as a thousand and a half', async () => {
    const usd: MoneyFormat = { locale: 'en-US', symbol: '$', symbolPosition: 'prefix', decimalSeparator: '.' }
    const draft = makeDraft()
    const onChange = vi.fn()
    render(
      <MoneyFormatContext.Provider value={usd}>
        <LeversBar draft={draft} resultDraft={draft} keys={DEFAULT_LEVERS} expanded={false} panelId="p" onChange={onChange} onToggle={vi.fn()} />
      </MoneyFormatContext.Provider>,
    )
    const field = screen.getByLabelText('Monthly investing')
    await userEvent.clear(field)
    await userEvent.type(field, '12,5{Enter}')
    expect(onChange).toHaveBeenLastCalledWith({ monthlyContributionCents: 1_250 })
    await userEvent.clear(field)
    await userEvent.type(field, '1,500{Enter}')
    expect(onChange).toHaveBeenLastCalledWith({ monthlyContributionCents: 150_000 })
  })

  it('never commits a negative amount', async () => {
    const { onChange } = renderBar()
    const field = screen.getByLabelText('Monthly investing')
    await userEvent.clear(field)
    await userEvent.type(field, '-5{Enter}')
    expect(onChange).toHaveBeenLastCalledWith({ monthlyContributionCents: 0 })
  })

  it('clamps a typed horizon to its range and ignores what is not a number', async () => {
    const { onChange } = renderBar()
    const horizon = screen.getByLabelText('Horizon (years)')
    await userEvent.clear(horizon)
    await userEvent.type(horizon, '99{Enter}')
    expect(onChange).toHaveBeenLastCalledWith({ horizonYears: 60 })
    onChange.mockClear()
    await userEvent.clear(horizon)
    await userEvent.type(horizon, 'abc{Enter}')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('takes a typed percentage as a fraction within its range', async () => {
    const { onChange } = renderBar()
    const ret = screen.getByRole('textbox', { name: 'Real return (%/yr, after inflation)' })
    await userEvent.clear(ret)
    await userEvent.type(ret, '9,5{Enter}')
    expect(onChange).toHaveBeenLastCalledWith({ expectedRealReturn: 0.095 })
    await userEvent.clear(ret)
    await userEvent.type(ret, '40{Enter}')
    expect(onChange).toHaveBeenLastCalledWith({ expectedRealReturn: 0.15 })
  })

  describe('a typed field', () => {
    const RETURN = 'Real return (%/yr, after inflation)'

    it('commits nothing when it is only tabbed through, whatever it shows', async () => {
      // 4.25% is shown as "4,3", and writing that back would change the plan's numbers.
      const { onChange } = renderBar({}, { expectedRealReturn: 0.0425 })
      const field = screen.getByRole('textbox', { name: RETURN })
      expect(field).toHaveValue('4,3')

      await userEvent.click(field)
      await userEvent.tab()

      expect(onChange).not.toHaveBeenCalled()
    })

    it('still commits what is typed, even when that is what the field shows', async () => {
      const { onChange } = renderBar({}, { expectedRealReturn: 0.0425 })
      const field = screen.getByRole('textbox', { name: RETURN })

      await userEvent.clear(field)
      await userEvent.type(field, '4,3{Enter}')

      expect(onChange).toHaveBeenLastCalledWith({ expectedRealReturn: 0.043 })
    })

    it('does not commit a value the plan already has', async () => {
      const { onChange } = renderBar()
      const field = screen.getByLabelText('Monthly investing')

      await userEvent.clear(field)
      await userEvent.type(field, '500{Enter}')

      expect(onChange).not.toHaveBeenCalled()
    })

    it('reads the value again once it is committed, so nothing refused or clamped stays in it', async () => {
      const { onChange } = renderBar({}, { horizonYears: 60 })
      const horizon = screen.getByLabelText('Horizon (years)')

      await userEvent.clear(horizon)
      await userEvent.type(horizon, '100{Enter}')

      expect(onChange).not.toHaveBeenCalled()
      expect(horizon).toHaveValue('60')
    })

    it('ignores nothing typed and text, in an amount, a number of years and a percentage', async () => {
      const { onChange } = renderBar()
      const horizon = screen.getByLabelText('Horizon (years)')
      const amount = screen.getByLabelText('Monthly investing')
      const percent = screen.getByRole('textbox', { name: RETURN })

      await userEvent.clear(horizon)
      await userEvent.type(horizon, '{Enter}')
      await userEvent.clear(amount)
      await userEvent.type(amount, 'abc{Enter}')
      await userEvent.clear(percent)
      await userEvent.type(percent, 'abc{Enter}')

      expect(onChange).not.toHaveBeenCalled()
      expect(horizon).toHaveValue('30')
      expect(amount).toHaveValue('500')
      expect(percent).toHaveValue('7,0')
    })

    it('ignores a number with a letter in it rather than reading the digits out of it', async () => {
      const { onChange } = renderBar()
      const horizon = screen.getByLabelText('Horizon (years)')
      const amount = screen.getByLabelText('Monthly investing')
      const percent = screen.getByRole('textbox', { name: RETURN })

      await userEvent.clear(amount)
      await userEvent.type(amount, '250k{Enter}')
      await userEvent.clear(horizon)
      await userEvent.type(horizon, '1e9{Enter}')
      await userEvent.clear(percent)
      await userEvent.type(percent, 'about 4{Enter}')

      expect(onChange).not.toHaveBeenCalled()
      expect(amount).toHaveValue('500')
      expect(horizon).toHaveValue('30')
      expect(percent).toHaveValue('7,0')
    })

    it('takes a comma or a point as the decimal mark of a percentage', async () => {
      const { onChange } = renderBar()
      const field = screen.getByRole('textbox', { name: RETURN })

      await userEvent.clear(field)
      await userEvent.type(field, '4.5{Enter}')
      expect(onChange).toHaveBeenLastCalledWith({ expectedRealReturn: 0.045 })

      await userEvent.clear(field)
      await userEvent.type(field, '5,5 %{Enter}')
      expect(onChange).toHaveBeenLastCalledWith({ expectedRealReturn: 0.055 })
    })
  })

  it('puts the cursor in the field from a tap beside its digits, on the unit', async () => {
    renderBar()
    const field = screen.getByRole('textbox', { name: 'Monthly investing' })
    await userEvent.click(field.parentElement!.querySelector('[class*="leverUnit"]')!)
    expect(field).toHaveFocus()
  })

  it('stores a typed percentage without the noise of dividing by a hundred', async () => {
    const { onChange } = renderBar()
    const field = screen.getByRole('textbox', { name: 'Real return (%/yr, after inflation)' })

    await userEvent.clear(field)
    await userEvent.type(field, '1,1{Enter}')

    // 1.1 / 100 is 0.011000000000000001, which differs from the slider's own 0.011 and makes a phantom edit.
    expect(onChange).toHaveBeenLastCalledWith({ expectedRealReturn: 0.011 })
  })

  it('drops what was typed on Escape instead of committing it when the field loses focus', async () => {
    const { onChange } = renderBar()
    const field = screen.getByRole('textbox', { name: 'Monthly investing' })

    await userEvent.clear(field)
    await userEvent.type(field, '900{Escape}')
    await userEvent.tab()

    expect(onChange).not.toHaveBeenCalled()
    expect(field).toHaveValue('500')
  })

  it('selects a figure as it takes focus on a touch screen, so typing replaces it', async () => {
    const media = installFakeMatchMedia((query) => query === '(pointer: coarse)')
    try {
      renderBar()
      const field = screen.getByRole<HTMLInputElement>('textbox', { name: 'Starting invested' })

      await userEvent.click(field)

      await waitFor(() => {
        expect(field.selectionStart).toBe(0)
        expect(field.selectionEnd).toBe(field.value.length)
      })
    } finally {
      media.setMatching(() => false)
    }
  })

  it('moves a percentage with its slider', () => {
    const { onChange } = renderBar()
    fireEvent.change(screen.getByRole('slider', { name: 'Real return (%/yr, after inflation)' }), { target: { value: '0.05' } })
    expect(onChange).toHaveBeenLastCalledWith({ expectedRealReturn: 0.05 })
  })

  it('sets the purchase year from its slider, with the first step meaning never', () => {
    const { onChange } = renderBar()
    const slider = screen.getByRole('slider', { name: 'Purchase year' })
    expect(slider).toHaveAttribute('aria-valuetext', 'Never')
    fireEvent.change(slider, { target: { value: '5' } })
    expect(onChange).toHaveBeenLastCalledWith({ housePurchaseYear: 5 })
  })

  it('lets the purchase year slide back to never', () => {
    const { onChange } = renderBar({}, { housePurchaseYear: 5 })
    fireEvent.change(screen.getByRole('slider', { name: 'Purchase year' }), { target: { value: '-1' } })
    expect(onChange).toHaveBeenLastCalledWith({ housePurchaseYear: null })
  })

  it('names purchase year 0 as already owned, not as now', () => {
    renderBar({}, { housePurchaseYear: 0 })
    expect(screen.getByText('Already own')).toBeInTheDocument()
    expect(screen.queryByText('Now')).not.toBeInTheDocument()
  })

  it('gives the purchase year slider the horizon as its top', () => {
    renderBar({}, { horizonYears: 12, housePurchaseYear: 4 })
    const slider = screen.getByRole('slider', { name: 'Purchase year' })
    expect(slider).toHaveAttribute('max', '12')
    expect(screen.getByText('Year 4')).toBeInTheDocument()
  })

  it('keeps a purchase year past the horizon on the track, so the slider and its name agree', () => {
    renderBar({}, { horizonYears: 10, housePurchaseYear: 15 })
    const slider = screen.getByRole('slider', { name: 'Purchase year' })
    expect(slider).toHaveAttribute('max', '15')
    expect(slider).toHaveValue('15')
    expect(slider).toHaveAttribute('aria-valuetext', 'Year 15, past horizon')
    expect(screen.getByText('Year 15, past horizon')).toBeInTheDocument()
  })

  it('reads a percentage slider out as a percentage rather than a bare fraction', () => {
    renderBar()
    expect(screen.getByRole('slider', { name: 'Real return (%/yr, after inflation)' })).toHaveAttribute('aria-valuetext', '7,0%')
  })

  it('shows the net worth the plan ends at, from the draft the charts read', () => {
    const live = makeDraft()
    const charts = makeDraft({ startInvestedCents: 0, monthlyContributionCents: 0 })
    renderBar({ draft: live, resultDraft: charts })
    expect(screen.getByText('Net worth in 30 yrs')).toBeInTheDocument()
    expect(screen.getByText('0 €')).toBeInTheDocument()
  })

  it('names the net worth after the horizon it is at, which is the lever beside it, and says "1 yr" for one', () => {
    const { unmount } = render(
      <LeversBar
        draft={makeDraft()}
        resultDraft={makeDraft({ horizonYears: 12 })}
        keys={DEFAULT_LEVERS}
        expanded={false}
        panelId="p"
        onChange={vi.fn()}
        onToggle={vi.fn()}
      />,
    )
    // The label follows what the charts read, as the figure does, not the live draft.
    expect(screen.getByText('Net worth in 12 yrs')).toBeInTheDocument()
    unmount()

    renderBar({}, { horizonYears: 1 })
    expect(screen.getByText('Net worth in 1 yr')).toBeInTheDocument()
  })

  it('names the invested part of the net worth when there is a house in the plan, so the chart and the bar do not look like a disagreement', () => {
    renderBar({ resultDraft: makeDraft({ housePurchaseYear: 0 }) })

    expect(screen.getByText(/, .* invested$/)).toBeInTheDocument()
  })

  it('says the money and the invested part on one line, so the bar is no taller with a house than the held bar has room for', () => {
    renderBar({ resultDraft: makeDraft({ housePurchaseYear: 0, planStartDate: '2026-01-01' }) })

    const note = screen.getByText(/^2026 euros, .* invested$/)
    expect(note.parentElement!.querySelectorAll('[class*="leverResultNote"]')).toHaveLength(1)
  })

  it('has no second figure for a plan with no house, where net worth and invested are the same', () => {
    renderBar({ resultDraft: makeDraft({ housePurchaseYear: null }) })

    expect(screen.queryByText(/, .* invested$/)).not.toBeInTheDocument()
  })

  it('has no second figure for a purchase past the horizon, which the net worth does not include', () => {
    renderBar({ resultDraft: makeDraft({ horizonYears: 5, housePurchaseYear: 12 }) })

    expect(screen.queryByText(/, .* invested$/)).not.toBeInTheDocument()
  })

  it('opens and closes the rest of the inputs from one button that says which', async () => {
    const { onToggle } = renderBar()
    const button = screen.getByRole('button', { name: 'All inputs' })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(button).toHaveAttribute('aria-controls', 'inputs-panel')
    await userEvent.click(button)
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('reports the panel as open', () => {
    renderBar({ expanded: true })
    expect(screen.getByRole('button', { name: 'All inputs' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('keeps a control reached with the keyboard out from under it while it is mounted and stuck under the header', () => {
    const root = document.documentElement
    root.style.scrollPaddingTop = ''
    // The stylesheet that sticks it, which a width query turns on.
    const stuck = document.createElement('style')
    stuck.textContent = '[class*="leversBar"] { position: sticky; top: 10px; }'
    document.head.append(stuck)
    const { unmount } = render(
      <LeversBar
        draft={makeDraft()}
        resultDraft={makeDraft()}
        keys={DEFAULT_LEVERS}
        onChange={vi.fn()}
        expanded={false}
        panelId="p"
        onToggle={vi.fn()}
      />,
    )
    // Its own height (nothing in jsdom) under where it sticks, and the air.
    expect(root.style.scrollPaddingTop).toBe('18px')
    unmount()
    expect(root.style.scrollPaddingTop).toBe('')
    stuck.remove()
  })

  it('leaves the top of the page to the app where the bar is not stuck, because it goes by with the page', () => {
    const root = document.documentElement
    root.style.scrollPaddingTop = '60px'
    const { unmount } = render(
      <LeversBar
        draft={makeDraft()}
        resultDraft={makeDraft()}
        keys={DEFAULT_LEVERS}
        onChange={vi.fn()}
        expanded={false}
        panelId="p"
        onToggle={vi.fn()}
      />,
    )
    // Nothing is stuck over the page, so the app's own padding for its header is the right one.
    expect(root.style.scrollPaddingTop).toBe('60px')
    unmount()
    expect(root.style.scrollPaddingTop).toBe('60px')
    root.style.scrollPaddingTop = ''
  })

  it('takes the top padding when the window grows to where the bar is stuck, and gives it back when it shrinks', () => {
    const root = document.documentElement
    root.style.scrollPaddingTop = '60px'
    const stuck = document.createElement('style')
    document.head.append(stuck)
    const { unmount } = render(
      <LeversBar
        draft={makeDraft()}
        resultDraft={makeDraft()}
        keys={DEFAULT_LEVERS}
        onChange={vi.fn()}
        expanded={false}
        panelId="p"
        onToggle={vi.fn()}
      />,
    )
    expect(root.style.scrollPaddingTop).toBe('60px')

    stuck.textContent = '[class*="leversBar"] { position: sticky; top: 10px; }'
    fireEvent(window, new Event('resize'))
    expect(root.style.scrollPaddingTop).toBe('18px')

    stuck.textContent = ''
    fireEvent(window, new Event('resize'))
    expect(root.style.scrollPaddingTop).toBe('60px')

    unmount()
    stuck.remove()
    root.style.scrollPaddingTop = ''
  })

  it('keeps it clear of the bar along the bottom edge too, where the bar is held there, and gives back what the page had', () => {
    const root = document.documentElement
    root.style.scrollPaddingBottom = '5px'
    // The stylesheet that holds it to the bottom edge, which a width query turns on.
    const held = document.createElement('style')
    held.textContent = '[class*="leversBar"] { position: sticky; bottom: 12px; }'
    document.head.append(held)
    const { unmount } = render(
      <LeversBar
        draft={makeDraft()}
        resultDraft={makeDraft()}
        keys={DEFAULT_LEVERS}
        onChange={vi.fn()}
        expanded={false}
        panelId="p"
        onToggle={vi.fn()}
      />,
    )
    // The bar's own height (nothing in jsdom) and the air around it.
    expect(root.style.scrollPaddingBottom).toBe('20px')
    // Also as a custom property, for the bar's controls to take back out of their scroll margin.
    expect(root.style.getPropertyValue('--scroll-pad-bottom')).toBe('20px')
    unmount()
    expect(root.style.scrollPaddingBottom).toBe('5px')
    expect(root.style.getPropertyValue('--scroll-pad-bottom')).toBe('')
    root.style.scrollPaddingBottom = ''
    held.remove()
  })

  it("publishes the bar's height under the name toasts lift themselves by, only while the bar is held to the bottom edge", () => {
    const root = document.documentElement
    const height = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(111)
    const style = document.createElement('style')
    document.head.append(style)
    try {
      const { unmount } = render(
        <LeversBar draft={makeDraft()} resultDraft={makeDraft()} keys={DEFAULT_LEVERS} onChange={vi.fn()} expanded={false} panelId="p" onToggle={vi.fn()} />,
      )
      // In the page, a toast has nothing to clear.
      expect(root.style.getPropertyValue('--exp-selection-bar')).toBe('')

      style.textContent = '[class*="leversBar"] { position: sticky; bottom: 12px; }'
      fireEvent(window, new Event('resize'))
      expect(root.style.getPropertyValue('--exp-selection-bar')).toBe('111px')

      style.textContent = ''
      fireEvent(window, new Event('resize'))
      expect(root.style.getPropertyValue('--exp-selection-bar')).toBe('')

      style.textContent = '[class*="leversBar"] { position: sticky; bottom: 12px; }'
      fireEvent(window, new Event('resize'))
      unmount()
      expect(root.style.getPropertyValue('--exp-selection-bar')).toBe('')
    } finally {
      style.remove()
      height.mockRestore()
      root.style.scrollPaddingBottom = ''
    }
  })

  it('lifts the padding while focus is inside the bar, and puts it back as focus leaves it', async () => {
    // Safari scrolled the page by the bar's height for each control focused in the bar, as if the
    // padding kept it clear of itself.
    const root = document.documentElement
    root.style.scrollPaddingTop = ''
    root.style.scrollPaddingBottom = '5px'
    const stuck = document.createElement('style')
    stuck.textContent = '[class*="leversBar"] { position: sticky; top: 10px; bottom: 12px; }'
    document.head.append(stuck)
    const draft = makeDraft()
    const { unmount } = render(
      <>
        <button type="button">Outside</button>
        <LeversBar draft={draft} resultDraft={draft} keys={DEFAULT_LEVERS} onChange={vi.fn()} expanded={false} panelId="p" onToggle={vi.fn()} />
      </>,
    )
    expect(root.style.scrollPaddingTop).toBe('18px')
    expect(root.style.scrollPaddingBottom).toBe('20px')

    await userEvent.click(screen.getByRole('textbox', { name: 'Monthly investing' }))
    expect(root.style.scrollPaddingTop).toBe('')
    expect(root.style.scrollPaddingBottom).toBe('5px')
    // The margin that does the same for Chromium is driven by the property, which does not lift.
    expect(root.style.getPropertyValue('--scroll-pad-bottom')).toBe('20px')

    // From one control of the bar to another it stays lifted.
    await userEvent.tab()
    expect(root.style.scrollPaddingTop).toBe('')
    expect(root.style.scrollPaddingBottom).toBe('5px')

    screen.getByRole('button', { name: 'Outside' }).focus()
    expect(root.style.scrollPaddingTop).toBe('18px')
    expect(root.style.scrollPaddingBottom).toBe('20px')

    unmount()
    expect(root.style.scrollPaddingTop).toBe('')
    expect(root.style.scrollPaddingBottom).toBe('5px')
    root.style.scrollPaddingBottom = ''
    stuck.remove()
  })

  it('leaves the bottom padding alone where the bar is not held to the bottom edge', () => {
    const root = document.documentElement
    root.style.scrollPaddingBottom = '5px'
    const { unmount } = render(
      <LeversBar
        draft={makeDraft()}
        resultDraft={makeDraft()}
        keys={DEFAULT_LEVERS}
        onChange={vi.fn()}
        expanded={false}
        panelId="p"
        onToggle={vi.fn()}
      />,
    )
    expect(root.style.scrollPaddingBottom).toBe('5px')
    unmount()
    root.style.scrollPaddingBottom = ''
  })

  it('focuses a figure from a click on its unit without letting the browser scroll to it', async () => {
    renderBar()
    const focus = vi.spyOn(HTMLInputElement.prototype, 'focus')
    const field = screen.getByLabelText('Monthly investing')
    await userEvent.click(field.parentElement!.querySelector('[class*="leverUnit"]')!)
    expect(field).toHaveFocus()
    expect(focus.mock.calls.every(([options]) => options?.preventScroll === true)).toBe(true)
    expect(focus).toHaveBeenCalled()
    focus.mockRestore()
  })

  it('leaves a click on the digits to the field itself, which the browser focuses without scrolling', async () => {
    renderBar()
    const focus = vi.spyOn(HTMLInputElement.prototype, 'focus')
    await userEvent.click(screen.getByLabelText('Monthly investing'))
    expect(screen.getByLabelText('Monthly investing')).toHaveFocus()
    expect(focus.mock.calls.some(([options]) => options?.preventScroll === true)).toBe(false)
    focus.mockRestore()
  })

  it('has a star on each lever that takes it out of the bar, where the bar can be changed', async () => {
    const onUnstar = vi.fn()
    renderBar({ onUnstar })
    await userEvent.click(screen.getByRole('button', { name: 'Remove Horizon from the bar' }))
    expect(onUnstar).toHaveBeenCalledWith('horizonYears')
    expect(screen.getAllByRole('button', { name: /^Remove .* from the bar$/ })).toHaveLength(5)
  })

  it('says what a star does to a pointer that rests on it, since nothing else on the page does', () => {
    renderBar({ onUnstar: vi.fn() })
    for (const star of screen.getAllByRole('button', { name: /^Remove .* from the bar$/ })) {
      expect(star).toHaveAttribute('title', star.getAttribute('aria-label'))
    }
  })

  it('has no stars where the bar cannot be changed', () => {
    renderBar()
    expect(screen.queryByRole('button', { name: /from the bar$/ })).not.toBeInTheDocument()
  })

  it('says what to do when nothing is starred, and still has its result', () => {
    renderBar({ keys: [] })
    expect(screen.getByText(/Nothing is starred/)).toBeInTheDocument()
    expect(screen.getByText('Net worth in 30 yrs')).toBeInTheDocument()
  })

  it('shows only the levers it is given', () => {
    renderBar({ keys: ['rentMonthlyCents'] })
    expect(screen.getByLabelText('Rent (monthly)')).toBeInTheDocument()
    expect(screen.queryByLabelText('Monthly investing')).not.toBeInTheDocument()
  })
})

describe('LeversBar result', () => {
  // No return, no saving and no house: the net worth stays 100.000 euros, so what it comes to on the account
  // is that grown by the inflation for the ten years.
  const flat = { startInvestedCents: 10_000_000, monthlyContributionCents: 0, expectedRealReturn: 0, horizonYears: 10, housePurchaseYear: null, planStartDate: '2026-01-01' }
  const renderWith = (inflation: number) => {
    const draft = makeDraft(flat)
    return render(
      <AssumedInflationContext.Provider value={inflation}>
        <LeversBar draft={draft} resultDraft={draft} keys={DEFAULT_LEVERS} expanded={false} panelId="p" onChange={vi.fn()} onToggle={vi.fn()} />
      </AssumedInflationContext.Provider>,
    )
  }

  it('says under the net worth which money it is in', () => {
    renderWith(0.02)
    expect(screen.getByText('Net worth in 10 yrs')).toBeInTheDocument()
    expect(screen.getByText('2026 euros')).toBeInTheDocument()
  })

  it('puts both in full in the hover text of the figure too', () => {
    renderWith(0.02)
    const value = screen.getByText(formatCentsCompact(10_000_000, EU_MONEY_FORMAT))
    expect(value).toHaveAttribute('title', `${formatCentsCompact(10_000_000, EU_MONEY_FORMAT)} in 2026 euros, about ${formatCentsCompact(12_189_944, EU_MONEY_FORMAT)} on your account in 2036`)
  })

  it('names a plan with no start date\'s money today\'s euros and its year by the plan year', () => {
    const draft = makeDraft({ ...flat, planStartDate: null })
    render(<LeversBar draft={draft} resultDraft={draft} keys={DEFAULT_LEVERS} expanded={false} panelId="p" onChange={vi.fn()} onToggle={vi.fn()} />)
    expect(screen.getByText("today's euros")).toBeInTheDocument()
    expect(screen.getByTitle(/on your account in year 10$/)).toBeInTheDocument()
  })
})
