import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MarketBounceSetting } from './MarketBounceSetting'
import { defaultExpenseSettings } from '../../engine'

function deferred() {
  let resolve!: () => void
  let reject!: (e: unknown) => void
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const settings = (marketVolatility: number) => ({ ...defaultExpenseSettings(), marketVolatility })
const input = () => screen.getByLabelText<HTMLInputElement>('Market bounce')

describe('MarketBounceSetting', () => {
  it('says what the bounce is and what it is not: how far a year strays from the typical one, not the return of a plan', () => {
    render(<MarketBounceSetting settings={settings(0.15)} onChange={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'Market bounce' })).toBeInTheDocument()
    expect(screen.getByText(/How far a single year's return strays from the typical one/)).toBeInTheDocument()
    expect(screen.getByText(/The return you enter on a plan stays the typical growth/)).toBeInTheDocument()
  })

  it('shows the saved bounce, 15% until set, and saves a typed one as a setting', () => {
    const onChange = vi.fn().mockResolvedValue(undefined)
    render(<MarketBounceSetting settings={defaultExpenseSettings()} onChange={onChange} />)
    expect(input()).toHaveValue('15,0')

    fireEvent.change(input(), { target: { value: '11' } })
    fireEvent.blur(input())

    expect(onChange).toHaveBeenCalledOnce()
    expect(onChange).toHaveBeenCalledWith({ marketVolatility: 0.11 })
  })

  it('takes no bounce at all, which is a line, and holds a typed value to half', async () => {
    const onChange = vi.fn().mockResolvedValue(undefined)
    render(<MarketBounceSetting settings={settings(0.15)} onChange={onChange} />)
    await act(async () => {
      fireEvent.change(input(), { target: { value: '0' } })
      fireEvent.blur(input())
      await Promise.resolve()
    })
    expect(onChange).toHaveBeenLastCalledWith({ marketVolatility: 0 })
    await act(async () => {
      fireEvent.change(input(), { target: { value: '80' } })
      fireEvent.blur(input())
      await Promise.resolve()
    })
    expect(onChange).toHaveBeenLastCalledWith({ marketVolatility: 0.5 })
  })

  it('steps by half a point and shows the step before the save lands', () => {
    const save = deferred()
    const onChange = vi.fn().mockReturnValue(save.promise)
    render(<MarketBounceSetting settings={settings(0.15)} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Increase Market bounce' }))
    expect(input()).toHaveValue('15,5')
    expect(onChange).toHaveBeenCalledWith({ marketVolatility: 0.155 })
  })

  it('sends only the newest of several quick steps, once the save in flight has landed', async () => {
    const first = deferred()
    const onChange = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue(undefined)
    render(<MarketBounceSetting settings={settings(0.15)} onChange={onChange} />)
    const up = () => fireEvent.click(screen.getByRole('button', { name: 'Increase Market bounce' }))
    up()
    up()
    up()
    expect(onChange).toHaveBeenCalledTimes(1)
    await act(async () => {
      first.resolve()
      await first.promise
    })
    expect(onChange).toHaveBeenCalledTimes(2)
    expect(onChange).toHaveBeenLastCalledWith({ marketVolatility: 0.165 })
  })

  it('offers the three usual bounces, marks the one that is saved, and saves the one chosen', () => {
    const onChange = vi.fn().mockResolvedValue(undefined)
    render(<MarketBounceSetting settings={settings(0.15)} onChange={onChange} />)
    const group = screen.getByRole('group', { name: 'Usual bounce' })
    const buttons = [...group.querySelectorAll('button')]
    expect(buttons.map((b) => b.textContent)).toEqual(['World stocks 15%', 'Stocks and bonds 11%', 'Mostly bonds 7%'])
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false'])

    fireEvent.click(screen.getByRole('button', { name: 'Mostly bonds 7%' }))

    expect(onChange).toHaveBeenCalledWith({ marketVolatility: 0.07 })
    expect(input()).toHaveValue('7,0')
    expect(screen.getByRole('button', { name: 'Mostly bonds 7%' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'World stocks 15%' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('marks none of them for a bounce of its own', () => {
    render(<MarketBounceSetting settings={settings(0.2)} onChange={vi.fn()} />)
    const pressed = [...screen.getByRole('group', { name: 'Usual bounce' }).querySelectorAll('button')].map((b) => b.getAttribute('aria-pressed'))
    expect(pressed).toEqual(['false', 'false', 'false'])
  })

  it('puts the saved bounce back and says so when a save fails', async () => {
    const onChange = vi.fn().mockRejectedValue(new Error('boom'))
    render(<MarketBounceSetting settings={settings(0.15)} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Increase Market bounce' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(input()).toHaveValue('15,0')
  })

  it('follows a bounce saved from elsewhere', () => {
    const { rerender } = render(<MarketBounceSetting settings={settings(0.15)} onChange={vi.fn()} />)
    rerender(<MarketBounceSetting settings={settings(0.11)} onChange={vi.fn()} />)
    expect(input()).toHaveValue('11,0')
  })
})
