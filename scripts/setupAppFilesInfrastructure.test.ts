// @vitest-environment node
// scripts/setup-app-files-infrastructure.mjs against a fake Cloudflare API. Nothing here reaches the network.
import { describe, expect, it, vi } from 'vitest'
import { BINDING, BUCKET, cloudflareApi, main, parseArgs, planBinding } from './setup-app-files-infrastructure.mjs'

const project = (production: object | undefined, preview: object | undefined) => ({
  deployment_configs: {
    production: production === undefined ? {} : { r2_buckets: production, env_vars: { A: 1 } },
    preview: preview === undefined ? {} : { r2_buckets: preview },
  },
})

describe('planBinding', () => {
  it('adds the binding to both environments and keeps every other R2 binding', () => {
    const { patch, changes } = planBinding(
      project({ RECEIPTS: { name: 'receipts' }, BACKUPS: { name: 'backups' } }, { RECEIPTS: { name: 'receipts' } }),
    )
    expect(patch).toEqual({
      deployment_configs: {
        production: {
          r2_buckets: { RECEIPTS: { name: 'receipts' }, BACKUPS: { name: 'backups' }, [BINDING]: { name: BUCKET } },
        },
        preview: { r2_buckets: { RECEIPTS: { name: 'receipts' }, [BINDING]: { name: BUCKET } } },
      },
    })
    expect(changes[0]).toEqual({ env: 'production', change: 'bind', keeps: ['BACKUPS', 'RECEIPTS'] })
  })

  it('works when an environment has no R2 bindings at all', () => {
    const { patch } = planBinding({})
    expect(patch).toEqual({
      deployment_configs: {
        production: { r2_buckets: { [BINDING]: { name: BUCKET } } },
        preview: { r2_buckets: { [BINDING]: { name: BUCKET } } },
      },
    })
  })

  it('sends nothing when both environments are already bound', () => {
    const bound = { [BINDING]: { name: BUCKET } }
    expect(planBinding(project(bound, bound))).toMatchObject({ patch: null })
  })

  it('only patches the environment that lacks it', () => {
    const { patch } = planBinding(project({ [BINDING]: { name: BUCKET } }, {}))
    expect(Object.keys(patch!.deployment_configs)).toEqual(['preview'])
  })

  it('refuses to overwrite the binding when it points at another bucket', () => {
    expect(() => planBinding(project({ [BINDING]: { name: 'other' } }, {}))).toThrow(/different bucket/)
  })
})

describe('parseArgs', () => {
  it('is a dry run unless --apply is given, and rejects anything else', () => {
    expect(parseArgs([])).toEqual({ apply: false })
    expect(parseArgs(['--apply'])).toEqual({ apply: true })
    expect(() => parseArgs(['--delete'])).toThrow(/Unknown argument/)
  })
})

describe('main', () => {
  const setup = () => {
    const api = vi.fn((_path: string, _init?: object) => Promise.resolve(project({ RECEIPTS: { name: 'receipts' } }, {})))
    const createBucket = vi.fn(() => 'created')
    const log = vi.fn()
    return { api, createBucket, log, deps: { api, createBucket, log, accountId: 'acct', token: 't' } }
  }

  it('writes nothing in a dry run, neither the bucket nor the binding', async () => {
    const { api, createBucket, deps } = setup()
    const result = await main([], deps)
    expect(result.applied).toBe(false)
    expect(createBucket).not.toHaveBeenCalled()
    expect(api).toHaveBeenCalledTimes(1)
  })

  it('creates the bucket and patches the project with --apply', async () => {
    const { api, createBucket, deps } = setup()
    const result = await main(['--apply'], deps)
    expect(createBucket).toHaveBeenCalledOnce()
    expect(api).toHaveBeenLastCalledWith('/pages/projects/expense-tracker', {
      method: 'PATCH',
      body: JSON.stringify(result.patch),
    })
  })

  it('skips the patch when already bound', async () => {
    const bound = { [BINDING]: { name: BUCKET } }
    const { api, deps } = setup()
    api.mockImplementation(() => Promise.resolve(project(bound, bound)))
    await main(['--apply'], deps)
    expect(api).toHaveBeenCalledTimes(1)
  })

  it('needs an account id', async () => {
    await expect(main([], { accountId: '', token: 't' })).rejects.toThrow(/CLOUDFLARE_ACCOUNT_ID/)
  })
})

describe('cloudflareApi', () => {
  it('returns the result, and throws the API error text on failure', async () => {
    const ok = vi.fn(() => Promise.resolve({ json: () => Promise.resolve({ success: true, result: { x: 1 } }) } as Response))
    expect(await cloudflareApi('t', 'acct', ok)('/p')).toEqual({ x: 1 })
    expect((ok.mock.calls as unknown as string[][])[0]?.[0]).toBe('https://api.cloudflare.com/client/v4/accounts/acct/p')
    const bad = vi.fn(() =>
      Promise.resolve({ json: () => Promise.resolve({ success: false, errors: [{ message: 'nope' }] }) } as Response),
    )
    await expect(cloudflareApi('t', 'acct', bad)('/p')).rejects.toThrow('/p: nope')
  })
})
