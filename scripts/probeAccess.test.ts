// @vitest-environment node
// scripts/probe-access.sh against a local server that answers what a deployment would.
import { spawn, spawnSync } from 'node:child_process'
import { createServer, type IncomingMessage, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const SCRIPT = join(import.meta.dirname, 'probe-access.sh')
let server: Server | undefined
afterEach(() => new Promise<void>((done) => (server ? server.close(() => done()) : done())))

interface Probe {
  code: number | null
  output: string
  seen: IncomingMessage[]
}

async function probe(status: number, body = 'SECRET-BODY'): Promise<Probe> {
  const seen: IncomingMessage[] = []
  server = createServer((req, res) => {
    seen.push(req)
    res.writeHead(status).end(body)
  })
  await new Promise<void>((ready) => server!.listen(0, '127.0.0.1', ready))
  const { port } = server.address() as AddressInfo
  // Not spawnSync: that would block the event loop that serves the request.
  return await new Promise<Probe>((done) => {
    const child = spawn('bash', [SCRIPT, 'the project', `http://127.0.0.1:${port}/`])
    let output = ''
    child.stdout.on('data', (d: Buffer) => (output += d.toString()))
    child.stderr.on('data', (d: Buffer) => (output += d.toString()))
    child.on('close', (code) => done({ code, output, seen }))
  })
}

describe('probe-access.sh', () => {
  it('passes on a 401', async () => {
    const result = await probe(401)

    expect(result.code).toBe(0)
    expect(result.output).toContain('the project: the Access token is checked')
  })

  it('sends an address on no allow-list, no token, to /api/access/status', async () => {
    const { seen } = await probe(401)

    expect(seen).toHaveLength(1)
    expect(seen[0]?.url).toBe('/api/access/status')
    expect(seen[0]?.headers['cf-access-authenticated-user-email']).toBe('deploy-probe@example.com')
    expect(seen[0]?.headers['cf-access-jwt-assertion']).toBeUndefined()
  })

  it('fails on a 503 and says the settings are missing', async () => {
    const result = await probe(503)

    expect(result.code).toBe(1)
    expect(result.output).toContain('ACCESS_TEAM_DOMAIN or ACCESS_AUD is missing')
  })

  it.each([200, 403, 404, 500])('fails on a %i and names it', async (status) => {
    const result = await probe(status)

    expect(result.code).toBe(1)
    expect(result.output).toContain(`answered ${status}`)
  })

  it('never prints what the deployment sent back', async () => {
    for (const status of [200, 401, 503]) {
      expect((await probe(status, 'SECRET-BODY')).output).not.toContain('SECRET-BODY')
      await new Promise<void>((done) => server!.close(() => done()))
    }
  })

  it('fails when nothing answers', () => {
    const result = spawnSync('bash', [SCRIPT, 'the project', 'http://127.0.0.1:9'], { encoding: 'utf8' })

    expect(result.status).toBe(1)
    expect(result.stdout).toContain('did not answer')
  })
})
