import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { openFormCount, registerOpenForm, useRegisterOpenForm } from './openForms'

function Open() {
  useRegisterOpenForm()
  return null
}

describe('the forms that are open', () => {
  it('counts a form from when it is registered to when it is let go, each once', () => {
    expect(openFormCount()).toBe(0)
    const a = registerOpenForm()
    const b = registerOpenForm()
    expect(openFormCount()).toBe(2)
    a()
    a()
    expect(openFormCount()).toBe(1)
    b()
    expect(openFormCount()).toBe(0)
  })

  it('counts a component that uses the hook for as long as it is mounted', () => {
    const { unmount } = render(<Open />)
    expect(openFormCount()).toBe(1)
    unmount()
    expect(openFormCount()).toBe(0)
  })
})
