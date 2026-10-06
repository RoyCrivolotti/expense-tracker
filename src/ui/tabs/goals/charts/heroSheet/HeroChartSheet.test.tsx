import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultMilestones } from '../../../../../engine'
import { installFakeMatchMedia } from '../../../../../testing/fakeMatchMedia'
import { makeScenario } from '../../../../../testing/factories'
import { setMotionDisabledForTests } from '../../../../hooks/motion'
import { NARROW_MQ } from '../../useGoalsNarrow'
import { NetWorthChart } from '../NetWorthChart'
import { PHONE_MQ, SIDEWAYS_MQ } from '../sheetOrientation'

const milestones = defaultMilestones()
const draft = { ...makeScenario(), horizonYears: 30 }
const OPEN = { name: 'Open the chart full screen' }

/** A phone: touch, narrow, and (when held upright) the sheet turned. */
function phone({ upright = false, narrow = true } = {}) {
  return installFakeMatchMedia(
    (q) => q === PHONE_MQ || q === '(hover: none)' || (q === NARROW_MQ && narrow) || (q === SIDEWAYS_MQ && upright),
  )
}

function Hero({ onToggleVisible, ...rest }: Partial<Parameters<typeof NetWorthChart>[0]> = {}) {
  return (
    <NetWorthChart
      milestones={milestones}
      scenarios={[]}
      draft={draft}
      variant="hero"
      displaySwitch={<div role="group" aria-label="Display switch" />}
      {...(onToggleVisible ? { onToggleVisible } : {})}
      {...rest}
    />
  )
}

const dialog = () => screen.getByRole('dialog', { name: /full screen/ })
const chartIn = (root: HTMLElement) => root.querySelector('svg[role="img"]')!

beforeEach(() => {
  installFakeMatchMedia()
})

afterEach(() => {
  vi.useRealTimers()
  setMotionDisabledForTests(true)
  installFakeMatchMedia()
})

describe('the button that opens the hero chart full screen', () => {
  it('is on the card on a phone, held upright or on its side', () => {
    phone({ upright: true })
    const { unmount } = render(<Hero />)
    expect(screen.getByRole('button', OPEN)).toBeInTheDocument()
    unmount()

    phone({ narrow: false })
    render(<Hero />)
    expect(screen.getByRole('button', OPEN)).toBeInTheDocument()
  })

  it('is not there on a screen that is not a phone, or on a chart that is not the hero', () => {
    const { unmount } = render(<Hero />)
    expect(screen.queryByRole('button', OPEN)).not.toBeInTheDocument()
    unmount()

    phone()
    render(<Hero variant="default" />)
    expect(screen.queryByRole('button', OPEN)).not.toBeInTheDocument()
  })

  it('keeps the title as it was where there is no button', () => {
    render(<Hero />)
    expect(screen.getByRole('heading', { name: 'Invested portfolio projection' })).toBeInTheDocument()
  })
})

describe('the full-screen hero chart', () => {
  it('opens as a dialog with the card\'s window buttons, the display switch, the chart and the readout', async () => {
    phone()
    render(<Hero />)
    await userEvent.click(screen.getByRole('button', OPEN))

    const sheet = within(dialog())
    expect(sheet.getByRole('heading', { name: 'Invested portfolio projection' })).toBeInTheDocument()
    expect(sheet.getByRole('group', { name: 'Display switch' })).toBeInTheDocument()
    expect(sheet.getByRole('radio', { name: 'All' })).toBeInTheDocument()
    expect(chartIn(dialog())).toBeInTheDocument()
    expect(sheet.getByLabelText('Values for the year')).toBeInTheDocument()
  })

  it('shares its window buttons with the card, so closing it leaves the card as the sheet had it', async () => {
    phone()
    render(<Hero />)
    await userEvent.click(screen.getByRole('button', OPEN))
    await userEvent.click(within(dialog()).getByRole('radio', { name: '5Y' }))
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Close' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '5Y' })).toBeChecked()
  })

  it('gives focus back to the button that opened it', async () => {
    phone()
    render(<Hero />)
    const opener = screen.getByRole('button', OPEN)
    await userEvent.click(opener)
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Close' }))
    expect(opener).toHaveFocus()
  })

  it('closes when the screen stops being a phone', async () => {
    const media = phone()
    render(<Hero />)
    await userEvent.click(screen.getByRole('button', OPEN))
    expect(dialog()).toBeInTheDocument()

    act(() => media.change(PHONE_MQ, false))
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('says how to use it until a year is chosen, and then which year it shows', async () => {
    phone()
    render(<Hero />)
    await userEvent.click(screen.getByRole('button', OPEN))
    expect(within(dialog()).getByText(/Touch the chart to read a year/)).toBeInTheDocument()

    fireEvent.keyDown(chartIn(dialog()), { key: 'End' })
    expect(within(dialog()).getByText('Year 30')).toBeInTheDocument()
  })

  it('opens on the last year the card had pointed at, though the tap that opens it clears the card\'s', async () => {
    phone()
    const { container } = render(<Hero />)
    fireEvent.keyDown(chartIn(container), { key: 'End' })
    await userEvent.click(screen.getByRole('button', OPEN))
    expect(within(dialog()).getByText('Year 30')).toBeInTheDocument()
  })

  it('opens with no year when none had been pointed at', async () => {
    phone()
    render(<Hero />)
    await userEvent.click(screen.getByRole('button', OPEN))
    expect(within(dialog()).queryByText(/^Year \d+$/)).not.toBeInTheDocument()
  })

  it('closes on Escape, as every sheet does', async () => {
    phone()
    render(<Hero />)
    await userEvent.click(screen.getByRole('button', OPEN))
    fireEvent.keyDown(chartIn(dialog()), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps the year when the chart loses focus or a row is tapped', async () => {
    phone()
    const onToggleVisible = vi.fn()
    const saved = makeScenario({ id: 7, name: 'Path B' })
    render(<Hero scenarios={[saved]} hiddenIds={new Set()} onToggleVisible={onToggleVisible} />)
    await userEvent.click(screen.getByRole('button', OPEN))
    const chart = chartIn(dialog())

    fireEvent.keyDown(chart, { key: 'ArrowRight' })
    fireEvent.keyDown(chart, { key: 'ArrowRight' })
    expect(within(dialog()).getByText('Year 1')).toBeInTheDocument()

    fireEvent.blur(chart)
    expect(within(dialog()).getByText('Year 1')).toBeInTheDocument()

    await userEvent.click(within(dialog()).getByRole('button', { name: /Hide Path B on chart/ }))
    expect(onToggleVisible).toHaveBeenCalledWith(7)
    expect(within(dialog()).getByText('Year 1')).toBeInTheDocument()
  })

  it('lays the readout out one row under another even where the page itself is not narrow', async () => {
    phone({ narrow: false })
    render(<Hero />)
    await userEvent.click(screen.getByRole('button', OPEN))
    const list = within(dialog()).getByLabelText('Values for the year').querySelector('ul')!
    expect(list.className).not.toContain('chips')
  })

  it('lists the purchase breakdown of a year in which a scenario buys, in the readout', async () => {
    phone()
    const buys = { ...draft, housePurchaseYear: 5 }
    render(<Hero draft={buys} />)
    await userEvent.click(screen.getByRole('button', OPEN))
    const chart = chartIn(dialog())
    for (let i = 0; i < 6; i++) fireEvent.keyDown(chart, { key: 'ArrowRight' })
    expect(within(dialog()).getByText('Year 5')).toBeInTheDocument()
    expect(within(dialog()).getByText('Down payment + fees')).toBeInTheDocument()
  })
})

describe('the full-screen hero chart drawn a quarter turn', () => {
  it('reads the year from the pointer\'s height, as the chart runs down the screen', async () => {
    phone({ upright: true })
    render(<Hero />)
    await userEvent.click(screen.getByRole('button', OPEN))
    expect(dialog().className).toMatch(/sheetSideways/)

    const chart = chartIn(dialog())
    chart.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 360 }) as DOMRect
    Object.defineProperty(chart, 'viewBox', { value: { baseVal: { x: 0, y: 0, width: 360, height: 240 } } })
    Object.defineProperty(chart, 'clientWidth', { value: 360 })
    Object.defineProperty(chart, 'setPointerCapture', { value: vi.fn() })

    // The plot runs from 56 to 344 over thirty years, so 200 is the middle of it.
    fireEvent.pointerDown(chart, { clientX: 9999, clientY: 200, pointerId: 1, pointerType: 'touch' })
    expect(within(dialog()).getByText('Year 15')).toBeInTheDocument()
    fireEvent.pointerMove(chart, { clientX: 0, clientY: 344, pointerId: 1, pointerType: 'touch' })
    expect(within(dialog()).getByText('Year 30')).toBeInTheDocument()
  })
})

describe('what a screen reader is told', () => {
  it('stays quiet as the sheet opens, and says the year and its values once a year settles', () => {
    phone()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    render(<Hero />)
    fireEvent.click(screen.getByRole('button', OPEN))
    const status = () => within(dialog()).getByRole('status')
    expect(status()).toBeEmptyDOMElement()

    const chart = chartIn(dialog())
    fireEvent.keyDown(chart, { key: 'End' })
    fireEvent.keyDown(chart, { key: 'ArrowLeft' })
    act(() => void vi.advanceTimersByTime(499))
    expect(status()).toBeEmptyDOMElement()
    act(() => void vi.advanceTimersByTime(1))
    expect(status().textContent).toMatch(/^Year 29\. /)
  })
})
