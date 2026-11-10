import { describe, expect, it } from 'vitest'
import { DEFAULT_JSON_BODY_BYTES, HttpError, readJson } from './http'

function post(body: BodyInit | null, headers: Record<string, string> = {}): Request {
  return new Request('https://example.test/x', { method: 'POST', body, headers })
}

/** A body of exactly `bytes` bytes once serialised: {"a":"xxx"}. */
function jsonOfSize(bytes: number): string {
  const overhead = JSON.stringify({ a: '' }).length
  return JSON.stringify({ a: 'x'.repeat(bytes - overhead) })
}

async function status(promise: Promise<unknown>): Promise<number | 'ok'> {
  try {
    await promise
    return 'ok'
  } catch (error) {
    if (error instanceof HttpError) return error.status
    throw error
  }
}

describe('readJson', () => {
  it('parses a body under the cap', async () => {
    expect(await readJson(post('{"a":1}'))).toEqual({ a: 1 })
  })

  it('accepts a body of exactly the cap', async () => {
    const body = jsonOfSize(1000)
    expect(new TextEncoder().encode(body).length).toBe(1000)
    expect(await status(readJson(post(body), 1000))).toBe('ok')
  })

  it('refuses a body one byte over the cap with a 413', async () => {
    expect(await status(readJson(post(jsonOfSize(1001)), 1000))).toBe(413)
  })

  it('counts bytes, not characters', async () => {
    // 400 three-byte characters plus the wrapper is over 1000 bytes though under 1000 characters.
    expect(await status(readJson(post(JSON.stringify({ a: '€'.repeat(400) })), 1000))).toBe(413)
  })

  it('refuses a streamed body without reading the rest', async () => {
    let pulled = 0
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1
        controller.enqueue(new Uint8Array(400).fill(120))
        if (pulled > 100) controller.close()
      },
    })
    const request = new Request('https://example.test/x', { method: 'POST', body: stream, duplex: 'half' } as RequestInit)
    expect(await status(readJson(request, 1000))).toBe(413)
    expect(pulled).toBeLessThan(10)
  })

  it('refuses on a declared content-length over the cap before reading', async () => {
    const request = post('{"a":1}', { 'content-length': '5000' })
    expect(await status(readJson(request, 1000))).toBe(413)
  })

  it('uses a default cap of 256 KiB', async () => {
    expect(await status(readJson(post(jsonOfSize(DEFAULT_JSON_BODY_BYTES))))).toBe('ok')
    expect(await status(readJson(post(jsonOfSize(DEFAULT_JSON_BODY_BYTES + 1))))).toBe(413)
  })

  it('answers 400 for an empty body, invalid JSON and null', async () => {
    expect(await status(readJson(post(null)))).toBe(400)
    expect(await status(readJson(post('{')))).toBe(400)
    expect(await status(readJson(post('null')))).toBe(400)
  })
})
