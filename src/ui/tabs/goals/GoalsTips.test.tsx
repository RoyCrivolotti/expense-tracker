import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultExpenseSettings, formatMoneyInput, resolveMoneyFormat, tryParseMoneyToCents } from '../../../engine'
import { makeDataset, makeScenario, makeWealthAccount, makeWealthCheckin } from '../../../testing/factories'
import { todayIso } from '../../components/transactionFormState'
import { installFakeMatchMedia } from '../../../testing/fakeMatchMedia'
import { makeActions } from '../../../testing/makeActions'
import { buildExpenseModel } from '../../buildExpenseModel'
import { setMotionDisabledForTests } from '../../hooks/motion'
import { MoneyFormatContext } from '../../hooks/moneyFormatContext'
import { TipsProvider } from '../../tips/TipsProvider'
import { GoalsTab } from './GoalsTab'
import { GoalsStartCard } from './GoalsTips'
import { NARROW_MQ } from './useGoalsNarrow'

let media: ReturnType<typeof installFakeMatchMedia>
beforeAll(() => {
  media = installFakeMatchMedia()
})
beforeEach(() => setMotionDisabledForTests(true))
afterEach(() => {
  cleanup()
  media.setMatching(() => false)
})

const FORMATS = [
  ['EUR', 'es-ES'],
  ['USD', 'en-US'],
  ['GBP', 'en-GB'],
  ['JPY', 'ja-JP'],
] as const
/** Amounts typed in each format, from the smallest a person would type to a very large one, and what they come to. */
const AMOUNTS = [
  { cents: 100, text: (f: ReturnType<typeof resolveMoneyFormat>) => formatMoneyInput(100, f) },
  { cents: 123_456, text: (f: ReturnType<typeof resolveMoneyFormat>) => formatMoneyInput(123_456, f) },
  { cents: 250_000_00, text: (f: ReturnType<typeof resolveMoneyFormat>) => formatMoneyInput(250_000_00, f) },
  { cents: 0, text: (f: ReturnType<typeof resolveMoneyFormat>) => formatMoneyInput(0, f) },
]

const draft = makeScenario({ startInvestedCents: 777_00, monthlyContributionCents: 55_00 })

function card(onChange = vi.fn()) {
  return { onChange, ...render(<StartCard onChange={onChange} />) }
}
function StartCard({ onChange }: { onChange: (patch: object) => void }) {
  return (
    <TipsProvider saved={[]} hasTransactions={false} save={() => Promise.resolve()}>
      <GoalsStartCard draft={draft} onChange={onChange} noScenarios />
    </TipsProvider>
  )
}
const type = (
  label: RegExp,
  text: string,
) => {
  const input = screen.getByLabelText(label)
  fireEvent.change(input, { target: { value: text } })
  fireEvent.blur(input)
}

describe('the Goals start card writes the two numbers into the draft through the controls’ own money fields', () => {
  describe.each(FORMATS)('in %s as %s writes it', (code, locale) => {
    const format = resolveMoneyFormat(code, locale)
    it.each(AMOUNTS)('$cents cents, for each box, and nothing else', ({ cents, text }) => {
      const { onChange } = (() => {
        const onChange = vi.fn()
        render(
          <MoneyFormatContext.Provider value={format}>
            <StartCard onChange={onChange} />
          </MoneyFormatContext.Provider>,
        )
        return { onChange }
      })()
      type(/^Starting invested \(/, text(format))
      type(/^Monthly investing \(/, text(format))
      expect(onChange).toHaveBeenNthCalledWith(1, { startInvestedCents: cents })
      expect(onChange).toHaveBeenNthCalledWith(2, { monthlyContributionCents: cents })
    })
  })

  it('writes nothing for text that is not an amount, and holds a negative at nothing', () => {
    const { onChange } = card()
    type(/^Starting invested \(/, '250k')
    type(/^Monthly investing \(/, '')
    expect(onChange).not.toHaveBeenCalled()
    type(/^Starting invested \(/, '-500')
    expect(onChange).toHaveBeenCalledWith({ startInvestedCents: 0 })
  })

  it.each(['999.999.999.999.999,99', '1,999', '1.234,5', '0,001'])(
    'writes what the shared reader makes of %s, and nothing when it makes nothing',
    (text) => {
      const { onChange } = card()
      type(/^Starting invested \(/, text)
      const read = tryParseMoneyToCents(text, resolveMoneyFormat('EUR', 'es-ES'))
      if (read === null) expect(onChange).not.toHaveBeenCalled()
      else expect(onChange).toHaveBeenCalledWith({ startInvestedCents: Math.max(0, read) })
    },
  )

  it('shows the draft’s own values to begin with', () => {
    card()
    expect(screen.getByLabelText(/^Starting invested \(/)).toHaveValue(
      formatMoneyInput(777_00, resolveMoneyFormat('EUR', 'es-ES')),
    )
    expect(screen.getByLabelText(/^Monthly investing \(/)).toHaveValue(
      formatMoneyInput(55_00, resolveMoneyFormat('EUR', 'es-ES')),
    )
  })
})

function app(opts: {
  scenarios?: ReturnType<typeof makeScenario>[]
  inflation?: number
  saved?: string[] | undefined
  save?: () => Promise<void>
  checkin?: string
}) {
  const dataset = makeDataset({
    goalScenarios: opts.scenarios ?? [],
    ...(opts.checkin
      ? {
          wealthAccounts: [makeWealthAccount({ id: 1 })],
          wealthCheckins: [
            makeWealthCheckin({ checkinDate: opts.checkin, entries: [{ accountId: 1, valueCents: 5_000_00 }] }),
          ],
        }
      : {}),
    settings: { ...defaultExpenseSettings(), assumedInflation: opts.inflation ?? 0.02 },
  })
  const actions = makeActions()
  const view = render(
    <TipsProvider
      saved={'saved' in opts ? opts.saved : []}
      hasTransactions
      save={opts.save ?? (() => Promise.resolve())}
    >
      <GoalsTab model={buildExpenseModel(dataset)} actions={actions} />
    </TipsProvider>,
  )
  return { actions, ...view }
}
/** The 30-year net worth the bar reads out, which comes from the projection the draft drives. */
const netWorth = () => screen.getByText(/Net worth in \d+ yrs/i).parentElement!.textContent
const region = () => screen.queryByRole('region', { name: 'A long-range plan' })

describe('the Goals start card on the tab', () => {
  it.each([0, -0.01, 0.02, 0.06])(
    'with assumed inflation %s, fills the draft the controls and chart read, and saves no scenario',
    (inflation) => {
      const { actions } = app({ inflation })
      expect(region()).toBeInTheDocument()

      type(/^Starting invested \(/, '12.345,67')
      type(/^Monthly investing \(/, '300')
      fireEvent.click(screen.getByRole('button', { name: 'Show my plan' }))

      expect(region()).toBeNull()
      // The bar's own fields now hold what the card was given: the same text they hold for a saved plan with those values.
      const shown = () =>
        [screen.getByLabelText('Starting invested'), screen.getByLabelText('Monthly investing')].map(
          (e) => (e as HTMLInputElement).value,
        )
      const got = [...shown(), netWorth()]
      cleanup()
      app({
        inflation,
        scenarios: [
          makeScenario({ startInvestedCents: 12_345_67, monthlyContributionCents: 300_00, planStartDate: todayIso() }),
        ],
      })
      expect([...shown(), netWorth()]).toEqual(got)
      expect(got.slice(0, 2)).not.toEqual(['0', '0'])
      expect(got[2]).toMatch(/\d/)
      expect(actions.createScenario).not.toHaveBeenCalled()
      expect(actions.updateScenario).not.toHaveBeenCalled()
    },
  )

  it('has one button, which puts the card away and changes nothing in the draft', () => {
    app({})
    const read = () =>
      [screen.getByLabelText('Starting invested'), screen.getByLabelText('Monthly investing')].map(
        (e) => (e as HTMLInputElement).value,
      )
    const before = read()
    expect(screen.queryByRole('button', { name: /look around/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Show my plan' }))
    expect(region()).toBeNull()
    expect(read()).toEqual(before)
  })

  it.each([
    ['GBP', 'en-GB', '£'],
    ['JPY', 'ja-JP', '￥'],
    ['USD', 'en-US', '$'],
  ])('names the money of the person in %s, not euros, on both boxes', (code, locale, symbol) => {
    const format = resolveMoneyFormat(code, locale)
    expect(format.symbol).toBe(symbol)
    render(
      <MoneyFormatContext.Provider value={format}>
        <StartCard onChange={vi.fn()} />
      </MoneyFormatContext.Provider>,
    )
    expect(screen.getByLabelText(`Starting invested (${format.symbol})`)).toBeInTheDocument()
    expect(screen.getByLabelText(`Monthly investing (${format.symbol})`)).toBeInTheDocument()
    expect(screen.queryByLabelText(/€/)).toBeNull()
  })

  it('is saved on the account when put away, so it does not return', async () => {
    const save = vi.fn(() => Promise.resolve())
    app({ save })
    fireEvent.click(screen.getByRole('button', { name: 'Show my plan' }))
    await act(() => Promise.resolve())
    expect(save).toHaveBeenCalledWith({ tipsSeen: ['goals'] })
  })

  it('is not shown to a person who has a saved scenario, nor to an established account', () => {
    app({ scenarios: [makeScenario()] })
    expect(region()).toBeNull()
    cleanup()
    app({ saved: undefined })
    expect(region()).toBeNull()
  })

  it('is not shown on the phone’s controls half, where its boxes would duplicate the controls', () => {
    media.setMatching((q) => q === NARROW_MQ)
    app({})
    expect(region()).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'Scenarios' }))
    expect(region()).toBeNull()
  })

  it("has a Progress card only on Progress, put away on its own id and not the start card's", async () => {
    const save = vi.fn(() => Promise.resolve())
    app({ save })
    expect(screen.queryByRole('region', { name: 'Monthly check-in' })).toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: 'Assumptions' }))
    expect(screen.queryByRole('region', { name: 'Monthly check-in' })).toBeNull()
    expect(region()).toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: 'Progress' }))
    expect(screen.getByRole('region', { name: 'Monthly check-in' })).toBeInTheDocument()
    expect(region()).toBeNull()
    fireEvent.click(
      within(screen.getByRole('region', { name: 'Monthly check-in' })).getByRole('button', { name: 'Got it' }),
    )
    await act(() => Promise.resolve())
    expect(save).toHaveBeenCalledWith({ tipsSeen: ['goals-progress'] })
    expect(screen.queryByRole('region', { name: 'Monthly check-in' })).toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: 'Plan' }))
    expect(region()).toBeInTheDocument()
  })

  it('names the day of the balance when the draft starts from a check-in, and the number typed lands on that day', () => {
    app({ checkin: '2020-03-02' })
    expect(
      screen.getByText(/Starting invested is what your investments held on 2 Mar 2020, from your latest check-in/),
    ).toBeInTheDocument()
    type(/^Starting invested \(/, '8.000')
    type(/^Monthly investing \(/, '250')
    const got = [netWorth(), screen.getByLabelText<HTMLInputElement>('Starting invested').value]
    cleanup()
    app({
      checkin: '2020-03-02',
      scenarios: [
        makeScenario({ startInvestedCents: 8_000_00, monthlyContributionCents: 250_00, planStartDate: '2020-03-02' }),
      ],
    })
    expect([netWorth(), screen.getByLabelText<HTMLInputElement>('Starting invested').value]).toEqual(got)
  })

  it('says now when there is no check-in, and that nothing is saved until the scenario is saved', () => {
    app({})
    expect(
      screen.getByText(/Starting invested is what your investments hold now, not your bank balance/),
    ).toBeInTheDocument()
    expect(screen.getByLabelText(/^Starting invested \(/)).toBeInTheDocument()
    expect(screen.getByText(/Nothing is saved until you save the scenario/)).toBeInTheDocument()
  })
})
