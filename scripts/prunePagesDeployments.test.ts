// @vitest-environment node
// scripts/prune-pages-deployments.mjs against a fake Cloudflare API. Nothing here reaches the network.
import { describe, expect, it } from 'vitest'
import {
  cloudflareApi,
  KEEP_PREVIEW,
  KEEP_PRODUCTION,
  listDeployments,
  main,
  parseArgs,
  planPrune,
  pruneProject,
  summarize,
} from './prune-pages-deployments.mjs'

interface Fake {
  id: string
  created_on: string
  environment: 'production' | 'preview'
  aliases: string[] | null
  latest_stage: { name: string; status: string }
}

const DAY = 86_400_000
const T0 = Date.parse('2026-01-01T00:00:00Z')
let counter = 0

function fake(over: Partial<Fake> & { day: number }): Fake {
  const { day, ...rest } = over
  counter += 1
  return {
    id: `id-${counter}`,
    created_on: new Date(T0 + day * DAY).toISOString(),
    environment: 'production',
    aliases: null,
    latest_stage: { name: 'deploy', status: 'success' },
    ...rest,
  }
}

const many = (n: number, environment: Fake['environment'], startDay = 0) =>
  Array.from({ length: n }, (_, i) => fake({ day: startDay + i, environment }))

interface Call {
  method: string
  path: string
  query: Record<string, unknown>
}

type Query = Record<string, unknown>
type Api = (method: string, path: string, query?: Query) => Promise<any> // eslint-disable-line @typescript-eslint/no-explicit-any

interface FakeOptions {
  canonical?: string | null
  domains?: string[]
  pageSize?: number
  refuse?: boolean
}

/** The three endpoints the script uses, with Cloudflare's paging and its refusal to delete an aliased deployment. */
function fakeApi(deployments: Fake[], { canonical, domains = [], pageSize = 25, refuse = false }: FakeOptions = {}) {
  const calls: Call[] = []
  const live = [...deployments]

  const remove = (path: string, query: Query) => {
    const found = live.find((d) => d.id === path.split('/').pop())
    if (!found) throw new Error('DELETE: HTTP 404 (8000007: not found)')
    if (refuse && found.aliases?.length && query.force !== 'true') throw new Error('DELETE: HTTP 400 (aliased)')
    live.splice(live.indexOf(found), 1)
    return { success: true, result: null }
  }
  const page = (query: Query) => {
    const number = Number(query.page)
    const size = Math.min(Number(query.per_page ?? pageSize), pageSize)
    const newestFirst = [...live].sort((a, b) => b.created_on.localeCompare(a.created_on))
    return {
      success: true,
      result: newestFirst.slice((number - 1) * size, number * size),
      result_info: { page: number, per_page: size, total_count: live.length, total_pages: Math.ceil(live.length / size) },
    }
  }
  const project = () => {
    const id = canonical === undefined ? deployments.filter((d) => d.environment === 'production').at(-1)?.id : canonical
    return { success: true, result: { canonical_deployment: id ? { id } : null } }
  }
  const answer = (method: string, path: string, query: Query) => {
    if (method === 'DELETE') return remove(path, query)
    if (path.endsWith('/domains')) return { success: true, result: domains.map((name) => ({ name })) }
    return path.endsWith('/deployments') ? page(query) : project()
  }

  const api: Api = (method, path, query = {}) => {
    calls.push({ method, path, query })
    return new Promise((resolve) => resolve(answer(method, path, query)))
  }
  return { api, calls, live }
}

const deletes = (calls: Call[]) => calls.filter((c) => c.method === 'DELETE')
const kept = (plan: ReturnType<typeof planPrune>) => new Set(plan.keep.map((k: { deployment: { id: string } }) => k.deployment.id))
const removed = (plan: ReturnType<typeof planPrune>) => new Set(plan.remove.map((r: { deployment: { id: string } }) => r.deployment.id))

async function planOf(deployments: Fake[], options: { canonical?: string | null; domains?: string[] } = {}) {
  const { api } = fakeApi(deployments, options)
  const listed = await listDeployments(api, 'proj')
  const canonicalId = options.canonical === undefined ? deployments.filter((d) => d.environment === 'production').at(-1)?.id ?? null : options.canonical
  return { listed, plan: planPrune({ deployments: listed, canonicalId, domains: options.domains ?? [] }) }
}

describe('the keep numbers', () => {
  it('are 10 production and 5 preview', () => {
    expect(KEEP_PRODUCTION).toBe(10)
    expect(KEEP_PREVIEW).toBe(5)
  })
})

describe('planPrune', () => {
  it('keeps the newest 10 production and 5 preview deployments and deletes the rest', async () => {
    const prod = many(14, 'production')
    const preview = many(9, 'preview', 100)
    const { plan } = await planOf([...prod, ...preview])

    expect(plan.remove).toHaveLength(4 + 4)
    expect(removed(plan)).toEqual(new Set([...prod.slice(0, 4), ...preview.slice(0, 4)].map((d) => d.id)))
  })

  it('counts each environment on its own', async () => {
    const { plan } = await planOf([...many(3, 'production'), ...many(40, 'preview', 10)])

    expect(plan.remove).toHaveLength(35)
    expect(plan.remove.every((r: { deployment: { environment: string } }) => r.deployment.environment === 'preview')).toBe(true)
  })

  it('honours other numbers when asked', async () => {
    const { listed } = await planOf(many(6, 'production'))
    const plan = planPrune({ deployments: listed, canonicalId: (listed[0] as { id: string }).id, keepProduction: 2, keepPreview: 0 })

    expect(plan.keep).toHaveLength(2)
    expect(plan.remove).toHaveLength(4)
  })

  it('never deletes the current production deployment, however old', async () => {
    const old = fake({ day: 0 })
    const { plan } = await planOf([old, ...many(30, 'production', 10)], { canonical: old.id })

    expect(kept(plan).has(old.id)).toBe(true)
    expect(plan.keep.find((k: { deployment: { id: string } }) => k.deployment.id === old.id)!.reasons).toContain('current production')
  })

  it('never deletes the latest successful deployment of an environment, when newer ones failed', async () => {
    const good = fake({ day: 0 })
    const failed = many(12, 'production', 1).map((d) => ({ ...d, latest_stage: { name: 'build', status: 'failure' } }))
    const { plan } = await planOf([good, ...failed], { canonical: failed.at(-1)!.id })

    expect(kept(plan).has(good.id)).toBe(true)
    expect(plan.keep.find((k: { deployment: { id: string } }) => k.deployment.id === good.id)!.reasons).toEqual(['latest successful'])
  })

  it('keeps a deployment a custom domain points at, by listing or by host', async () => {
    const live = fake({ day: 0, environment: 'preview', aliases: ['https://stg.example.com'] })
    const named = fake({ day: 1, environment: 'preview', aliases: ['staging.example.org'] })
    const { plan } = await planOf([live, named, ...many(20, 'preview', 10), ...many(1, 'production', 50)], { domains: ['staging.example.org'] })

    expect(kept(plan).has(live.id)).toBe(true)
    expect(kept(plan).has(named.id)).toBe(true)
  })

  it('deletes a branch-aliased preview outside the window, with force', async () => {
    const aliased = fake({ day: 0, environment: 'preview', aliases: ['https://feature-x.proj.pages.dev'] })
    const plain = fake({ day: 1, environment: 'preview' })
    const { plan } = await planOf([aliased, plain, ...many(5, 'preview', 10), ...many(1, 'production', 50)])

    const byId = new Map(plan.remove.map((r: { deployment: { id: string }; force: boolean }) => [r.deployment.id, r.force]))
    expect(byId.get(aliased.id)).toBe(true)
    expect(byId.get(plain.id)).toBe(false)
  })

  it('keeps a deployment that has not finished building', async () => {
    const building = fake({ day: 0, environment: 'preview', latest_stage: { name: 'build', status: 'active' } })
    const { plan } = await planOf([building, ...many(20, 'preview', 10), ...many(1, 'production', 50)])

    expect(plan.keep.find((k: { deployment: { id: string } }) => k.deployment.id === building.id)!.reasons).toEqual(['still building'])
  })

  it('breaks a tie in creation date the same way every time', async () => {
    const a = fake({ day: 5 })
    const b = fake({ day: 5 })
    const first = planPrune({ deployments: (await planOf([a, b])).listed, canonicalId: b.id, keepProduction: 1, keepPreview: 0 })
    const second = planPrune({ deployments: (await planOf([b, a])).listed, canonicalId: b.id, keepProduction: 1, keepPreview: 0 })

    expect(removed(first)).toEqual(removed(second))
  })

  it('refuses when the current production deployment is not in the listing', async () => {
    const { listed } = await planOf(many(20, 'production'))

    expect(() => planPrune({ deployments: listed, canonicalId: 'not-listed' })).toThrow(/not in the listing/)
  })

  it('refuses when production deployments exist but the project names none as current', async () => {
    const { listed } = await planOf(many(20, 'production'))

    expect(() => planPrune({ deployments: listed, canonicalId: null })).toThrow(/no current production deployment/)
  })

  it('plans nothing for a project with no deployments', () => {
    expect(planPrune({ deployments: [], canonicalId: null })).toEqual({ keep: [], remove: [] })
  })
})

describe('listDeployments', () => {
  it('reads every page', async () => {
    const { api, calls } = fakeApi(many(60, 'production'), { pageSize: 25 })

    expect(await listDeployments(api, 'proj')).toHaveLength(60)
    expect(calls.filter((c) => c.path.endsWith('/deployments')).map((c) => c.query.page)).toEqual([1, 2, 3])
  })

  it('throws when the pages hold fewer than the total', async () => {
    const all = many(30, 'production')
    const { api } = fakeApi(all)
    const short: Api = (method, path, query = {}) =>
      api(method, path, query).then((body: object) => (query.page === 2 ? { ...body, result: [] } : body))

    await expect(listDeployments(short, 'proj')).rejects.toThrow(/incomplete: read 25 of 30/)
  })

  it('throws when a page repeats a deployment', async () => {
    const { api } = fakeApi(many(30, 'production'))
    const repeating: Api = (method, path, query = {}) => api(method, path, { ...query, page: 1 })

    await expect(listDeployments(repeating, 'proj')).rejects.toThrow(/repeated a deployment/)
  })

  it.each([
    ['no result_info', { success: true, result: [] }],
    ['a result that is not a list', { success: true, result: {}, result_info: { total_count: 0, total_pages: 0 } }],
    ['a count that is not a number', { success: true, result: [], result_info: { total_count: '0', total_pages: 0 } }],
  ])('throws on %s', async (_name, body) => {
    await expect(listDeployments(() => Promise.resolve(body), 'proj')).rejects.toThrow(/shape this script does not know/)
  })

  it.each([
    ['no id', { environment: 'preview', created_on: '2026-01-01T00:00:00Z' }, /no id/],
    ['a bad date', { id: 'x', environment: 'preview', created_on: 'soon' }, /creation date/],
    ['an unknown environment', { id: 'x', environment: 'canary', created_on: '2026-01-01T00:00:00Z' }, /unknown environment/],
    ['odd aliases', { id: 'x', environment: 'preview', created_on: '2026-01-01T00:00:00Z', aliases: [1] }, /aliases/],
    ['a non-object entry', 'x', /no id/],
  ])('throws on a deployment with %s', async (_name, entry, message) => {
    const body = { success: true, result: [entry], result_info: { total_count: 1, total_pages: 1 } }

    await expect(listDeployments(() => Promise.resolve(body), 'proj')).rejects.toThrow(message)
  })

  it('lists an empty project', async () => {
    const body = { success: true, result: [], result_info: { total_count: 0, total_pages: 0 } }

    expect(await listDeployments(() => Promise.resolve(body), 'proj')).toEqual([])
  })
})

describe('pruneProject', () => {
  const setup = () => {
    const prod = many(14, 'production')
    const preview = [
      fake({ day: 0, environment: 'preview', aliases: ['https://old-branch.proj.pages.dev'] }),
      ...many(8, 'preview', 100),
    ]
    return { prod, preview, all: [...prod, ...preview] }
  }

  it('deletes nothing in a dry run, and its log has counts and dates but no id', async () => {
    const { all } = setup()
    const { api, calls } = fakeApi(all)
    const lines: string[] = []

    await pruneProject({ api, project: 'proj', apply: false, log: (l: string) => lines.push(l) })

    expect(deletes(calls)).toHaveLength(0)
    const text = lines.join('\n')
    expect(text).toContain('23 deployments (14 production, 9 preview)')
    expect(text).toContain('deleting 8 (4 production, 4 preview), created 2026-01-01 to')
    expect(text).toContain('1 of them have a branch alias and are deleted with force')
    expect(text).toContain('dry run')
    for (const d of all) expect(text).not.toContain(d.id)
  })

  it('deletes exactly the planned set, forcing only the aliased one', async () => {
    const { all, prod, preview } = setup()
    const { api, calls, live } = fakeApi(all, { refuse: true })

    await pruneProject({ api, project: 'proj', apply: true, log: () => {} })

    const gone = deletes(calls).map((c) => c.path.split('/').pop())
    expect(new Set(gone)).toEqual(new Set([...prod.slice(0, 4), ...preview.slice(0, 4)].map((d) => d.id)))
    expect(deletes(calls).filter((c) => c.query.force === 'true')).toHaveLength(1)
    expect(live).toHaveLength(15)
  })

  it('does not delete when the listing cannot be read to the end', async () => {
    const { api, calls } = fakeApi(many(30, 'production'))
    const failing: Api = (method, path, query = {}) =>
      method === 'GET' && query.page === 2 ? Promise.reject(new Error('GET: HTTP 500 (boom)')) : api(method, path, query)

    await expect(pruneProject({ api: failing, project: 'proj', apply: true, log: () => {} })).rejects.toThrow(/HTTP 500/)
    expect(deletes(calls)).toHaveLength(0)
  })

  it('does not delete when the current production deployment is missing from the listing', async () => {
    const { api, calls } = fakeApi(many(30, 'production'), { canonical: 'someone-elses-id' })

    await expect(pruneProject({ api, project: 'proj', apply: true, log: () => {} })).rejects.toThrow(/not in the listing/)
    expect(deletes(calls)).toHaveLength(0)
  })

  it('stops at the first failed delete and says how far it got, without the id', async () => {
    const all = many(20, 'production')
    const { api } = fakeApi(all)
    let n = 0
    const flaky: Api = (method, path, query = {}) =>
      method === 'DELETE' && ++n === 3 ? Promise.reject(new Error('DELETE: HTTP 500 (boom)')) : api(method, path, query)

    const error = await pruneProject({ api: flaky, project: 'proj', apply: true, log: () => {} }).catch((e: Error) => e)

    expect((error as Error).message).toBe('Stopped after deleting 2 of 10: DELETE: HTTP 500 (boom)')
    expect(n).toBe(3)
  })

  it('reports progress on a long run', async () => {
    const { api } = fakeApi(many(80, 'production'))
    const lines: string[] = []

    await pruneProject({ api, project: 'proj', apply: true, log: (l: string) => lines.push(l) })

    expect(lines).toContain('  deleted 25 of 70')
    expect(lines).toContain('  deleted 50 of 70')
    expect(lines.at(-1)).toBe('  deleted 70')
  })

  it('says so when there is nothing to delete', async () => {
    const { api, calls } = fakeApi(many(3, 'production'))
    const lines: string[] = []

    await pruneProject({ api, project: 'proj', apply: true, log: (l: string) => lines.push(l) })

    expect(lines.join('\n')).toContain('nothing to delete')
    expect(deletes(calls)).toHaveLength(0)
  })

  it.each([
    ['a project in an unknown shape', { success: true, result: null }, { success: true, result: [] }],
    ['custom domains in an unknown shape', { success: true, result: {} }, { success: true, result: {} }],
    ['a domain without a name', { success: true, result: {} }, { success: true, result: [{}] }],
    ['a production deployment id that is not text', { success: true, result: { canonical_deployment: { id: 7 } } }, { success: true, result: [] }],
  ])('refuses %s', async (_name, project, domains) => {
    const api: Api = (_m, path) => Promise.resolve(path.endsWith('/domains') ? domains : project)

    await expect(pruneProject({ api, project: 'proj', apply: false, log: () => {} })).rejects.toThrow(/does not know/)
  })
})

describe('summarize', () => {
  it('says "none" when nothing is kept by a rule', () => {
    expect(summarize('p', { keep: [], remove: [] }).join('\n')).toContain('by rule: none')
  })
})

describe('cloudflareApi', () => {
  const respond = (status: number, body: unknown) =>
    (() => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) })) as unknown as typeof fetch

  it('sends the token, the method and the query', async () => {
    let seen: { url: URL; init: RequestInit } | undefined
    const fetchImpl = ((url: URL, init: RequestInit) => {
      seen = { url, init }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ success: true, result: [] }) })
    }) as unknown as typeof fetch

    await cloudflareApi('tkn', fetchImpl)('DELETE', '/accounts/a1/pages/projects/p/deployments/d1', { force: 'true' })

    expect(seen!.url.searchParams.get('force')).toBe('true')
    expect(seen!.init.method).toBe('DELETE')
    expect((seen!.init.headers as Record<string, string>).Authorization).toBe('Bearer tkn')
  })

  it('reports an error with its status and Cloudflare message, and leaves out ids and the token', async () => {
    const api = cloudflareApi('tkn-secret', respond(400, { success: false, errors: [{ code: 8000035, message: 'aliased' }] }))

    const error = await api('DELETE', '/accounts/acct-secret/pages/projects/p/deployments/dep-secret').catch((e: Error) => e)

    expect((error as Error).message).toBe('DELETE /accounts/:account/pages/projects/p/deployments/:id: HTTP 400 (8000035: aliased)')
  })

  it('reports an error with no detail', async () => {
    const api = cloudflareApi('t', respond(500, {}))

    await expect(api('GET', '/x')).rejects.toThrow('GET /x: HTTP 500 (no error detail)')
  })

  it('treats success: false on a 200 as an error', async () => {
    const api = cloudflareApi('t', respond(200, { success: false, errors: [] }))

    await expect(api('GET', '/x')).rejects.toThrow(/no error detail/)
  })

  it('reports a response that is not JSON', async () => {
    const fetchImpl = (() =>
      Promise.resolve({ ok: false, status: 502, json: () => Promise.reject(new SyntaxError('x')) })) as unknown as typeof fetch

    await expect(cloudflareApi('t', fetchImpl)('GET', '/x')).rejects.toThrow('GET /x: HTTP 502, and the response was not JSON')
  })
})

describe('the command line', () => {
  it('reads the project and the delete flag', () => {
    expect(parseArgs(['--project', 'my-proj'])).toEqual({ project: 'my-proj', apply: false })
    expect(parseArgs(['--delete', '--project', 'my-proj'])).toEqual({ project: 'my-proj', apply: true })
  })

  it.each([[[]], [['--project']], [['--project', 'Bad Name']], [['--project', 'ok', '--force']], [['--project', '../x']]])(
    'rejects %j',
    (argv) => {
      expect(() => parseArgs(argv)).toThrow()
    },
  )

  it('runs a dry run end to end through fetch, and sends no DELETE', async () => {
    const all = many(14, 'production')
    const { api, calls } = fakeApi(all)
    const fetchImpl = (async (url: URL, init: RequestInit) => {
      const query = Object.fromEntries(url.searchParams)
      const body = (await api(init.method!, url.pathname.replace('/client/v4', ''), query)) as unknown
      return { ok: true, status: 200, json: () => Promise.resolve(body) }
    }) as unknown as typeof fetch
    const lines: string[] = []

    await main(['--project', 'proj'], { token: 'tkn', fetchImpl, log: (l: string) => lines.push(l) })

    expect(deletes(calls)).toHaveLength(0)
    expect(lines.join('\n')).toContain('deleting 4')
  })

  it('reads the token from the environment by default', async () => {
    const fetchImpl = (() => Promise.reject(new Error('stop here'))) as unknown as typeof fetch
    const saved = process.env.CLOUDFLARE_API_TOKEN
    process.env.CLOUDFLARE_API_TOKEN = 'from-env'
    try {
      await expect(main(['--project', 'proj'], { fetchImpl })).rejects.toThrow('stop here')
    } finally {
      if (saved === undefined) delete process.env.CLOUDFLARE_API_TOKEN
      else process.env.CLOUDFLARE_API_TOKEN = saved
    }
  })
})
