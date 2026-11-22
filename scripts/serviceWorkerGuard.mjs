/**
 * Runs the built service worker (`dist/sw.js`, and any file it loads with `importScripts`) in a Node VM with just
 * enough of a worker's globals, hands it fetch events, and reports what it did. No browser is needed, so it can sit in
 * `npm run verify`.
 *
 * A worker that throws while it is evaluated does not fail to install: the browser keeps it, with the routes
 * registered before the throw and none after, and says nothing a person sees. That is how the app came to have no
 * offline start, so evaluation errors are collected here and reported.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import vm from 'node:vm'

const ORIGIN = 'https://app.example'

/** Workbox tests its handler's event with `instanceof`, so the worker's globals have to have the classes. */
class ExtendableEvent {
  /** A browser holds the promise and ignores how it ends; Node would call a rejected one unhandled. */
  waitUntil(promise) {
    Promise.resolve(promise).catch(() => {})
  }
}
class FetchEvent extends ExtendableEvent {
  constructor(request) {
    super()
    this.request = request
    this.responded = null
  }

  respondWith(promise) {
    this.responded = promise
  }
}
/** A push the worker is handed: its payload, and the promise it asked to be kept alive for. */
class PushEvent extends ExtendableEvent {
  constructor(text) {
    super()
    this.data = { text: () => text }
    this.kept = Promise.resolve()
  }

  waitUntil(promise) {
    this.kept = Promise.resolve(promise)
  }
}
const SHELL_BODY = 'SHELL'
const NETWORK_BODY = 'NETWORK'

/**
 * The URLs a worker precaches, from the manifest it passes to `precacheAndRoute`. A bundler writes each entry's two
 * keys in either order, quoted or not, so both spellings are read.
 */
export function precachedEntries(source) {
  const entry = /\{\s*"?(url|revision)"?\s*:\s*("[^"]*"|null)\s*,\s*"?(url|revision)"?\s*:\s*("[^"]*"|null)\s*\}/g
  const entries = []
  for (const m of source.matchAll(entry)) {
    const fields = { [m[1]]: m[2], [m[3]]: m[4] }
    if (!fields.url || !fields.revision || fields.url === 'null') continue
    entries.push({
      url: JSON.parse(fields.url),
      revision: fields.revision === 'null' ? null : JSON.parse(fields.revision),
    })
  }
  return entries
}

/** A worker resolves the relative URL it is given against its own address; Node's `Request` refuses one. */
class WorkerRequest extends Request {
  constructor(
    input,
    init,
  ) {
    super(typeof input === 'string' ? new URL(input, `${ORIGIN}/`).href : input, init)
  }
}

/** A real `Request` (Workbox constructs others from it), which Node will not make in `navigate` mode, told to be one. */
function navigation(pathname) {
  const request = new WorkerRequest(pathname)
  Object.defineProperty(request, 'mode', { value: 'navigate' })
  return request
}

function subresource(pathname) {
  return new WorkerRequest(pathname)
}

/**
 * Loads the worker with a Cache Storage that holds every precached URL, as it would after an install, and a `fetch`
 * that `network` controls. Returns what the worker registered and the errors it raised while loading.
 */
function load(
  dist,
  entries,
  network,
) {
  const listeners = {}
  const posted = []
  const store = new Map()
  for (const { url, revision } of entries) {
    const absolute = new URL(url, `${ORIGIN}/`).href
    const key = revision === null ? absolute : `${absolute}?__WB_REVISION__=${revision}`
    store.set(key, url.endsWith('.html') ? SHELL_BODY : `ASSET ${url}`)
  }
  const cache = {
    match: async (key) =>
      store.has(typeof key === 'string' ? key : key.url)
        ? new Response(store.get(typeof key === 'string' ? key : key.url))
        : undefined,
    put: async () => {},
    keys: async () => [],
    delete: async () => true,
  }
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    URL,
    Request: WorkerRequest,
    Response,
    Headers,
    ExtendableEvent,
    FetchEvent,
    navigator: { language: 'en-GB' },
    fetch: async () => {
      if (!network.up) throw new TypeError('Failed to fetch')
      return new Response(NETWORK_BODY)
    },
    caches: {
      open: async () => cache,
      keys: async () => [],
      match: (key) => cache.match(key),
      delete: async () => true,
    },
    location: new URL(`${ORIGIN}/sw.js`),
    registration: { scope: `${ORIGIN}/`, showNotification: async () => {} },
    addEventListener: (
      type,
      fn,
    ) => {
      ;(listeners[type] ??= []).push(fn)
    },
    skipWaiting: () => Promise.resolve(),
    clients: {
      claim: () => Promise.resolve(),
      matchAll: async () => [{ postMessage: (message) => posted.push(JSON.stringify(message)) }],
      openWindow: async () => {},
    },
  }
  sandbox.self = sandbox
  const context = vm.createContext(sandbox)
  sandbox.importScripts = (...files) => {
    for (const file of files)
      vm.runInContext(readFileSync(join(dist, new URL(file, `${ORIGIN}/`).pathname), 'utf8'), context)
  }
  // The worker's own promise chains reject after a failed fetch, which a browser logs and Node would exit on; only
  // what is raised while the worker loads is a fault of the worker.
  const errors = []
  const phase = { loading: true }
  const onRejection = (error) => {
    if (phase.loading) errors.push(String(error?.message ?? error).split('\n')[0])
  }
  process.on('unhandledRejection', onRejection)
  vm.runInContext(readFileSync(join(dist, 'sw.js'), 'utf8'), context)
  return {
    listeners,
    posted,
    errors,
    loaded: () => {
      phase.loading = false
    },
    stop: () => process.off('unhandledRejection', onRejection),
  }
}

/** What the worker does with a request: the body of its answer, or null when it leaves the request to the browser. */
async function answer(
  worker,
  request,
) {
  const event = new FetchEvent(request)
  for (const listener of worker.listeners.fetch ?? []) listener(event)
  if (!event.responded) return null
  try {
    return await (await event.responded).text()
  } catch (error) {
    return `an error (${String(error?.message ?? error).split('\n')[0]})`
  }
}

/** The problems with the built worker, one sentence each. Empty when it does what the app relies on. */
export async function problemsOfWorker(dist) {
  let source
  try {
    source = readFileSync(join(dist, 'sw.js'), 'utf8')
  } catch {
    return [`${join(dist, 'sw.js')} does not exist; run the build first`]
  }
  const entries = precachedEntries(source)
  const problems = []
  if (!entries.some((entry) => entry.url === 'index.html' && entry.revision)) {
    problems.push(
      'the shell (index.html) is not precached with a revision, so the worker cannot answer a navigation when the network fails',
    )
  }
  const network = { up: true }
  const worker = load(dist, entries, network)
  await new Promise((resolve) => setTimeout(resolve, 50))
  worker.loaded()
  for (const error of worker.errors) problems.push(`evaluating the worker raised: ${error}`)
  if (!worker.listeners.fetch?.length) {
    worker.stop()
    return [...problems, 'the worker registers no fetch listener']
  }

  const asset = entries.find((entry) => entry.url.endsWith('.js'))
  const expectations = [
    ['a navigation to / while the network answers', () => navigation('/'), true, NETWORK_BODY],
    [
      'a navigation to a deep link while the network answers',
      () => navigation('/settings?tab=data'),
      true,
      NETWORK_BODY,
    ],
    ['a navigation to / while the network fails', () => navigation('/'), false, SHELL_BODY],
    ['a navigation to a deep link while the network fails', () => navigation('/settings'), false, SHELL_BODY],
    [
      'an API URL opened in a tab while the network fails',
      () => navigation('/api/expenses/attachments/7'),
      false,
      null,
    ],
    ['an Access URL opened in a tab while the network fails', () => navigation('/cdn-cgi/access/logout'), false, null],
    [
      'a request of the app for its data while the network answers',
      () => subresource('/api/access/status'),
      true,
      null,
    ],
    ['a request of the app for its data while the network fails', () => subresource('/api/access/status'), false, null],
    ...(asset
      ? [
          [
            'a precached script while the network fails',
            () => subresource(`/${asset.url}`),
            false,
            `ASSET ${asset.url}`,
          ],
        ]
      : []),
  ]
  for (const [what, request, networkUp, expected] of expectations) {
    network.up = networkUp
    const got = await answer(worker, request())
    if (got !== expected)
      problems.push(
        `${what}: expected ${expected === null ? 'no answer from the worker' : `"${expected}"`}, got ${got === null ? 'no answer from the worker' : `"${got}"`}`,
      )
  }
  // A worker that shows pushes must also tell the open windows, or a payment that arrives with the app in front waits
  // for a refresh. The windows are reached through `clients`, which only the push handler can pass on.
  if (worker.listeners.push?.length) {
    const push = new PushEvent(JSON.stringify({ v: 1, kind: 'payment', id: 'p1', url: '/?review=p1' }))
    for (const listener of worker.listeners.push) listener(push)
    await push.kept.catch(() => {})
    if (!worker.posted.includes(JSON.stringify({ type: 'review-changed' }))) {
      problems.push(
        'a push does not tell the open windows (a message of type "review-changed"), so the payment waits for a refresh',
      )
    }
  }
  worker.stop()
  return problems
}
