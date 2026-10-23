import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { isShellNavigation } from './pwaNavigation'

const navigate = (pathname: string) => isShellNavigation({ request: { mode: 'navigate' }, url: { pathname } })

describe('the navigations the service worker answers', () => {
  it('are the app’s own pages', () => {
    for (const path of ['/', '/index.html', '/goals', '/settings/data']) expect(navigate(path), path).toBe(true)
  })

  it('are not an API URL opened in a tab, nor an Access endpoint', () => {
    for (const path of ['/api/expenses', '/api/expenses/attachments/7', '/api/expenses/export', '/cdn-cgi/access/logout']) {
      expect(navigate(path), path).toBe(false)
    }
  })

  it('are not requests for scripts, images or data, whatever the path', () => {
    expect(isShellNavigation({ request: { mode: 'cors' }, url: { pathname: '/' } })).toBe(false)
    expect(isShellNavigation({ request: { mode: 'no-cors' }, url: { pathname: '/assets/index.js' } })).toBe(false)
  })

  it('leave out only the paths under /api/ and /cdn-cgi/', () => {
    for (const path of ['/apiary', '/cdn-cgix', '/goals/api/x', '/api']) expect(navigate(path), path).toBe(true)
  })

  it('is written out whole in the worker, which copies the function as text', () => {
    // A rule that named a variable outside its body would throw in the worker, and only there.
    const copy = runInNewContext(`(${isShellNavigation.toString()})`) as typeof isShellNavigation
    expect(copy({ request: { mode: 'navigate' }, url: { pathname: '/api/expenses' } })).toBe(false)
    expect(copy({ request: { mode: 'navigate' }, url: { pathname: '/goals' } })).toBe(true)
  })
})
