import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { collectAccessDiagnostics } from './accessDiagnostics'

describe('collectAccessDiagnostics', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }))
    vi.stubGlobal('navigator', {
      onLine: true,
      serviceWorker: {
        controller: { scriptURL: 'https://expenses.crivolotti.com/sw.js' },
        getRegistration: vi.fn().mockResolvedValue({ waiting: { state: 'installed' } }),
      },
    })
    document.head.innerHTML =
      '<script type="module" src="/assets/index-D8KT9Hlv.js"></script>'
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    document.head.innerHTML = ''
  })

  it('collects build, SW, and error fields', async () => {
    const diagnostics = await collectAccessDiagnostics('no-response status: 0')
    expect(diagnostics.errorKind).toBe('connection')
    expect(diagnostics.rawError).toContain('no-response')
    expect(diagnostics.standalone).toBe(false)
    expect(diagnostics.online).toBe(true)
    expect(diagnostics.swController).toContain('sw.js')
    expect(diagnostics.swWaiting).toBe(true)
    expect(diagnostics.assetHash).toBe('D8KT9Hlv')
    expect(diagnostics.capturedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('truncates very long errors', async () => {
    const long = 'x'.repeat(600)
    const diagnostics = await collectAccessDiagnostics(long)
    expect(diagnostics.rawError).toHaveLength(500)
  })
})
