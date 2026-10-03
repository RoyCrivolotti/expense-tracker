import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useToastAside } from './useToastAside'

describe('useToastAside', () => {
  it('marks the page while it is mounted and takes the mark away when it goes', () => {
    const root = document.documentElement
    expect(root).not.toHaveAttribute('data-toast-aside')

    const { unmount } = renderHook(() => useToastAside())
    expect(root).toHaveAttribute('data-toast-aside')

    unmount()
    expect(root).not.toHaveAttribute('data-toast-aside')
  })
})
