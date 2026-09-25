import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { InflationSetting } from './InflationSetting'
import { defaultExpenseSettings } from '../../engine'

/** A save the test settles by hand, to have several steps arrive while one is in flight. */
function deferred() {
  let resolve!: () => void
  let reject!: (e: unknown) => void
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const settings = (assumedInflation: number) => ({ ...defaultExpenseSettings(), assumedInflation })
const input = () => screen.getByLabelText<HTMLInputElement>('Assumed inflation')

describe('InflationSetting', () => {
  afterEach(() => {
    vi.useRealTimers()
    Reflect.deleteProperty(Element.prototype, 'scrollIntoView')
  })

  it('says what the rate converts, not that the plan is at it', () => {
    render(<InflationSetting settings={settings(0.02)} onChange={vi.fn()} />)
    // The plan is in today's money whatever the rate is; the rate is what brings the rest to it.
    expect(screen.getByText(/brought back to today's money at this rate/)).toBeInTheDocument()
    expect(screen.queryByText(/everything in goals is in today's money at this rate/i)).not.toBeInTheDocument()
  })

  it('shows the saved rate and saves a typed one as a setting', () => {
    const onChange = vi.fn().mockResolvedValue(undefined)
    render(<InflationSetting settings={settings(0.02)} onChange={onChange} />)
    expect(input()).toHaveValue('2,0')

    fireEvent.change(input(), { target: { value: '3,5' } })
    fireEvent.blur(input())

    expect(onChange).toHaveBeenCalledOnce()
    expect(onChange).toHaveBeenCalledWith({ assumedInflation: 0.035 })
  })

  it('steps by half a point and shows the step before the save lands', () => {
    const save = deferred()
    const onChange = vi.fn().mockReturnValue(save.promise)
    render(<InflationSetting settings={settings(0.02)} onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: 'Increase percentage' }))

    // Instant: the stepper has moved though the save has not come back.
    expect(input()).toHaveValue('2,5')
    expect(onChange).toHaveBeenCalledWith({ assumedInflation: 0.025 })
  })

  it('sends only the newest of several quick steps, once the save in flight has landed', async () => {
    const first = deferred()
    const onChange = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue(undefined)
    render(<InflationSetting settings={settings(0.02)} onChange={onChange} />)
    const up = () => fireEvent.click(screen.getByRole('button', { name: 'Increase percentage' }))

    up()
    up()
    up()
    // One request while it is in flight, whatever was clicked meanwhile.
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(input()).toHaveValue('3,5')

    await act(async () => {
      first.resolve()
      await first.promise
    })

    expect(onChange).toHaveBeenCalledTimes(2)
    expect(onChange).toHaveBeenLastCalledWith({ assumedInflation: 0.035 })
  })

  it('does not step back to an earlier value while a newer one waits to be sent', async () => {
    vi.useFakeTimers()
    const sent: number[] = []
    // A parent like the app: a save takes 100 ms, and when it lands the saved value changes.
    function Parent() {
      const [saved, setSaved] = useState(0.02)
      const onChange = (patch: { assumedInflation?: number }) =>
        new Promise<void>((resolve) => {
          setTimeout(() => {
            sent.push(patch.assumedInflation ?? saved)
            setSaved(patch.assumedInflation ?? saved)
            resolve()
          }, 100)
        })
      return <InflationSetting settings={settings(saved)} onChange={onChange} />
    }
    render(<Parent />)
    const up = () => fireEvent.click(screen.getByRole('button', { name: 'Increase percentage' }))

    up()
    up()
    up()
    expect(input()).toHaveValue('3,5')

    // The first save lands while two more steps wait behind it: the field keeps the newest.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(101)
    })
    expect(sent).toEqual([0.025])
    expect(input()).toHaveValue('3,5')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(101)
    })
    expect(sent).toEqual([0.025, 0.035])
    expect(input()).toHaveValue('3,5')
  })

  it('holds the range: past ten percent is ten, and below zero is zero', async () => {
    const onChange = vi.fn().mockResolvedValue(undefined)
    render(<InflationSetting settings={settings(0.02)} onChange={onChange} />)

    fireEvent.change(input(), { target: { value: '50' } })
    fireEvent.blur(input())
    expect(onChange).toHaveBeenLastCalledWith({ assumedInflation: 0.1 })

    // The first save is still in flight, so this one is queued and goes out once it lands.
    fireEvent.change(input(), { target: { value: '-5' } })
    fireEvent.blur(input())
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith({ assumedInflation: 0 }))
  })

  it('puts the saved rate back and says so when a save fails, and clears the message on the next change', async () => {
    const save = deferred()
    const onChange = vi.fn().mockReturnValue(save.promise)
    render(<InflationSetting settings={settings(0.02)} onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: 'Increase percentage' }))
    await act(async () => {
      save.reject(new Error('boom'))
      await save.promise.catch(() => {})
    })

    // A stepper still showing 2,5 would read as saved.
    expect(await screen.findByRole('alert')).toHaveTextContent("Something went wrong, so that change probably wasn't saved.")
    expect(input()).toHaveValue('2,0')

    onChange.mockResolvedValue(undefined)
    fireEvent.click(screen.getByRole('button', { name: 'Increase percentage' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('brings itself into view only when asked to', () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    const { rerender } = render(<InflationSetting settings={settings(0.02)} onChange={vi.fn()} />)
    expect(scrollIntoView).not.toHaveBeenCalled()

    rerender(<InflationSetting settings={settings(0.02)} onChange={vi.fn()} scrollIntoView />)
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
  })

  it('takes a rate saved from elsewhere over its own draft', () => {
    const { rerender } = render(<InflationSetting settings={settings(0.02)} onChange={vi.fn()} />)
    rerender(<InflationSetting settings={settings(0.04)} onChange={vi.fn()} />)
    expect(input()).toHaveValue('4,0')
  })
})
