import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CAPTURE_FLAG_KEY } from '../../config/captureFlag'
import { CaptureSwitch } from './CaptureSwitch'

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

const show = (reload = vi.fn()) => {
  render(
    <dl>
      <CaptureSwitch reload={reload} />
    </dl>,
  )
  return reload
}

describe('the capture screens switch', () => {
  it('is off by default, and turning it on keeps the choice and reloads', () => {
    const reload = show()
    const box = screen.getByRole('checkbox', { name: /Off/ })

    fireEvent.click(box)

    expect(localStorage.getItem(CAPTURE_FLAG_KEY)).toBe('on')
    expect(reload).toHaveBeenCalledOnce()
    expect(screen.getByRole('checkbox', { name: /On/ })).toBeChecked()
  })

  it('shows on when the flag is on, and turning it off keeps that', () => {
    localStorage.setItem(CAPTURE_FLAG_KEY, 'on')
    const reload = show()

    fireEvent.click(screen.getByRole('checkbox', { name: /On/ }))

    expect(localStorage.getItem(CAPTURE_FLAG_KEY)).toBe('off')
    expect(reload).toHaveBeenCalledOnce()
  })

  it('says so, and does not reload, when the browser would not keep the choice', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full')
    })
    const reload = show()

    fireEvent.click(screen.getByRole('checkbox'))

    expect(screen.getByRole('alert')).toHaveTextContent('would not keep the choice')
    expect(reload).not.toHaveBeenCalled()
  })

  it('reloads on the address without its query by default', () => {
    const replace = vi.fn()
    vi.stubGlobal('location', { pathname: '/', hash: '#x', replace })
    render(
      <dl>
        <CaptureSwitch />
      </dl>,
    )
    fireEvent.click(screen.getByRole('checkbox'))

    expect(replace).toHaveBeenCalledWith('/#x')
    vi.unstubAllGlobals()
  })
})
