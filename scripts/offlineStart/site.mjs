/**
 * A static server that answers like Cloudflare Pages does for this app, and a stand-in for the page Access sends a
 * person to. What matters to a service worker is how they differ from a plain file server:
 *
 * - `/index.html` is a redirect to `/`.
 * - A project without a 404 page is a single page app: a path that is not a file, whatever it ends in, is `index.html`.
 * - Behind Access, a request without a session is a redirect to another origin, not an error.
 */
import { createServer } from 'node:http'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

/**
 * `root` can be changed while the server runs, which is a deploy. `failing` maps a path to a status it answers with,
 * `down` makes every connection fail, and `requests` lists what the server was asked for.
 */
export async function startSite({ root, access = null, port = 0 }) {
  const state = { root, failing: new Map(), requests: [], down: false }
  const sockets = new Set()
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://site')
    state.requests.push({ path: url.pathname, mode: req.headers['sec-fetch-mode'] ?? '' })
    if (access && !(req.headers.cookie ?? '').includes('CF_Authorization=ok')) {
      res.writeHead(302, { location: `${access}/login` })
      return res.end()
    }
    const failing = state.failing.get(url.pathname)
    if (failing) {
      res.writeHead(failing, { 'content-type': 'text/plain' })
      return res.end('failing on purpose')
    }
    const send = (status, body, type) => {
      res.writeHead(status, { 'content-type': type, 'cache-control': 'public, max-age=0, must-revalidate' })
      res.end(body)
    }
    if (url.pathname === '/index.html') {
      res.writeHead(308, { location: '/' })
      return res.end()
    }
    if (url.pathname.startsWith('/api/')) return send(404, JSON.stringify({ error: 'There is no API behind this server' }), 'application/json')
    let file = normalize(join(state.root, url.pathname === '/' ? 'index.html' : url.pathname))
    if (!file.startsWith(state.root) || !existsSync(file) || statSync(file).isDirectory()) file = join(state.root, 'index.html')
    return send(200, readFileSync(file), TYPES[extname(file)] ?? 'application/octet-stream')
  })
  server.on('connection', (socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
    if (state.down) socket.destroy()
  })
  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve))
  const bound = server.address().port
  return {
    origin: `http://127.0.0.1:${bound}`,
    state,
    /** A refused connection, as when the device has no network. */
    async takeDown() {
      state.down = true
      for (const socket of sockets) socket.destroy()
      server.close()
    },
    async bringUp() {
      state.down = false
      await new Promise((resolve) => server.listen(bound, '127.0.0.1', resolve))
    },
    async close() {
      for (const socket of sockets) socket.destroy()
      await new Promise((resolve) => server.close(resolve))
    },
  }
}

/**
 * Where Access sends a person without a session. Signing in sets the session cookie and sends them back to the app,
 * as Access does; cookies are not kept apart by port, so the app's server sees it.
 */
export async function startLogin() {
  const state = { returnTo: '' }
  const server = createServer((req, res) => {
    if (req.url === '/done') {
      res.writeHead(302, { 'set-cookie': 'CF_Authorization=ok; Path=/', location: `${state.returnTo}/` })
      return res.end()
    }
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end('<title>Sign in</title><h1>Sign in</h1><a id="go" href="/done">Sign in</a>')
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    state,
    close: () => new Promise((resolve) => server.close(resolve)),
  }
}
