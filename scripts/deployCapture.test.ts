// @vitest-environment node
// scripts/deploy-capture.mjs with a fake Cloudflare API and a stand-in for wrangler. Nothing is deployed.
import { spawnSync, type SpawnSyncOptions } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CAPTURE_ENVIRONMENTS,
  captureTarget,
  FILLED_CONFIG,
  filledConfig,
  findDatabaseId,
  main,
  shippedCommit,
  TEMPLATE_CONFIG,
} from './deploy-capture.mjs'
import { publicOutput } from './public-output.mjs'

const SHIPPED = 'a'.repeat(40)
const HEAD = 'c'.repeat(40)
const ACCOUNT = 'account-for-test'
const TEMPLATE = readFileSync(TEMPLATE_CONFIG, 'utf8')
/** As Cloudflare answers a search for the production name: the staging database contains it, and comes first. */
const DATABASES = [
  { name: 'roy-expenses-dev', uuid: 'id-of-the-staging-database' },
  { name: 'roy-expenses', uuid: 'id-of-the-production-database' },
]

const ok = (result: unknown) => new Response(JSON.stringify({ success: true, errors: [], result }))

function fakeD1(respond: () => Response = () => ok(DATABASES)) {
  const fetchFake = vi.fn((_url: string, _init: RequestInit) => Promise.resolve(respond()))
  vi.stubGlobal('fetch', fetchFake)
  return fetchFake
}

const unauthorised = () =>
  new Response(JSON.stringify({ success: false, errors: [{ code: 10000, message: 'Authentication error' }] }), {
    status: 403,
  })

interface Run {
  command: string
  args: string[]
  env: Record<string, string | undefined>
  options: SpawnSyncOptions
  /** The filled config as wrangler would have read it. */
  config: string
}

interface Setup {
  env?: Record<string, string>
  token?: string | null
  /** What `git status --porcelain` answers. */
  changes?: string
  result?: { status: number | null; error?: Error; stdout?: string; stderr?: string }
}

async function deploy(
  argv: string[],
  setup: Setup = {},
) {
  const { env = { GITHUB_SHA: SHIPPED, CLOUDFLARE_ACCOUNT_ID: ACCOUNT }, result = { status: 0 }, changes = '' } = setup
  // `null` is a case of its own: no token at all.
  const token = setup.token === undefined ? 'not-a-token' : setup.token
  const runs: Run[] = []
  const lines: string[] = []
  const code = await main(argv, {
    env,
    token: () => token,
    git: (args: string[]) => (args[0] === 'status' ? changes : HEAD),
    run: (
      command: string,
      args: string[],
      options: SpawnSyncOptions,
    ) => {
      const path = args[args.indexOf('--config') + 1]
      runs.push({ command, args, env: options.env ?? {}, options, config: readFileSync(path, 'utf8') })
      return result
    },
    log: (line: string) => lines.push(line),
  })
  return { code, runs, output: lines.join('\n') }
}

afterEach(() => vi.unstubAllGlobals())

describe('which Worker and database', () => {
  it('names a Worker and a database for each environment, staging first', () => {
    expect(CAPTURE_ENVIRONMENTS).toEqual(['staging', 'prod'])
    expect(CAPTURE_ENVIRONMENTS.map((name) => captureTarget(name, {}))).toEqual([
      { worker: 'expense-capture-stg', database: 'roy-expenses-dev' },
      { worker: 'expense-capture', database: 'roy-expenses' },
    ])
  })

  it('takes the database names the workflow migrates', () => {
    const env = { DEV_D1_NAME: 'their-dev', PROD_D1_NAME: 'their-prod' }

    expect(captureTarget('staging', env).database).toBe('their-dev')
    expect(captureTarget('prod', env).database).toBe('their-prod')
  })

  it.each([undefined, '', 'production', 'dev', 'constructor'])('refuses %j', (name) => {
    expect(() => captureTarget(name, {})).toThrow('staging or prod')
  })

  it.each([
    ['staging is given the production name', { DEV_D1_NAME: 'roy-expenses' }],
    ['production is given the staging name', { PROD_D1_NAME: 'roy-expenses-dev' }],
    ['both are given one name', { DEV_D1_NAME: 'one', PROD_D1_NAME: 'one' }],
  ])('refuses either environment when %s', (_why, env: Record<string, string>) => {
    for (const name of CAPTURE_ENVIRONMENTS) {
      expect(() => captureTarget(name, env)).toThrow('both set to the database')
    }
  })
})

describe('shippedCommit', () => {
  it('is the commit GitHub names, or else HEAD', () => {
    expect(shippedCommit({ GITHUB_SHA: SHIPPED }, () => HEAD)).toBe(SHIPPED)
    expect(shippedCommit({}, () => HEAD)).toBe(HEAD)
  })

  it.each(['abc1234', 'main', 'A'.repeat(40)])('refuses %s', (value) => {
    expect(() => shippedCommit({ GITHUB_SHA: value }, () => HEAD)).toThrow('Not a full commit id')
  })
})

describe('filledConfig', () => {
  const values = { worker: 'a-worker', accountId: ACCOUNT, database: 'a-database', databaseId: 'an-id' }

  it('fills the committed config and leaves the rest of it alone', () => {
    const filled = filledConfig(TEMPLATE, values)
    const expected = TEMPLATE.replace('name = "expense-capture"', 'name = "a-worker"')
      .replace('database_name = "<database name>"', 'database_name = "a-database"')
      .replace('database_id = "<database id>"', 'database_id = "an-id"')

    expect(filled).toBe(`account_id = "${ACCOUNT}"\n${expected}`)
    expect(filled).not.toContain('"<')
  })

  it.each(['name', 'database_name', 'database_id'])('refuses a config without exactly one %s line', (key) => {
    const line = new RegExp(`^${key} = .*$`, 'm')

    expect(() => filledConfig(TEMPLATE.replace(line, ''), values)).toThrow(`one line setting ${key}`)
    expect(() => filledConfig(TEMPLATE.replace(line, '$&\n$&'), values)).toThrow(`one line setting ${key}`)
  })

  it('keeps the filled copy beside the original, where git ignores it', () => {
    expect(dirname(FILLED_CONFIG)).toBe(dirname(TEMPLATE_CONFIG))
    const ignored = spawnSync('git', ['check-ignore', '--quiet', FILLED_CONFIG], {
      cwd: join(import.meta.dirname, '..'),
    })
    expect(ignored.status).toBe(0)
  })
})

describe('findDatabaseId', () => {
  it('takes the database with exactly that name, not one that contains it', async () => {
    const fetchFake = fakeD1()

    await expect(findDatabaseId('not-a-token', ACCOUNT, 'roy-expenses')).resolves.toBe('id-of-the-production-database')
    expect(fetchFake.mock.calls[0]?.[0]).toBe(
      `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/d1/database?name=roy-expenses&per_page=100`,
    )
  })

  it('fails when no database has the name', async () => {
    fakeD1(() => ok([DATABASES[0]]))

    await expect(findDatabaseId('not-a-token', ACCOUNT, 'roy-expenses')).rejects.toThrow('No D1 database called')
  })
})

describe('deploy-capture.mjs', () => {
  it.each([
    ['staging', 'expense-capture-stg', 'roy-expenses-dev', 'id-of-the-staging-database'],
    ['prod', 'expense-capture', 'roy-expenses', 'id-of-the-production-database'],
  ])('deploys %s under the commit, bound to its own database', async (environment, worker, database, id) => {
    fakeD1()

    const { code, runs } = await deploy([environment])

    expect(code).toBe(0)
    expect(runs).toHaveLength(1)
    expect(runs[0]?.command).toBe('npx')
    expect(runs[0]?.args).toEqual([
      'wrangler',
      'deploy',
      '--config',
      FILLED_CONFIG,
      '--keep-vars',
      '--message',
      SHIPPED,
      '--tag',
      SHIPPED.slice(0, 8),
    ])
    expect(runs[0]?.env.CLOUDFLARE_ACCOUNT_ID).toBe(ACCOUNT)
    expect(runs[0]?.config).toContain(`\nname = "${worker}"\n`)
    expect(runs[0]?.config).toContain(`database_name = "${database}"\ndatabase_id = "${id}"\n`)
    expect(existsSync(FILLED_CONFIG)).toBe(false)
  })

  // The backup cron's script skips this case and exits 0, which leaves its Worker on old code behind a green run.
  it('fails on a token without the Workers scope, and says nothing was skipped', async () => {
    fakeD1()

    const { code, output } = await deploy(['prod'], {
      env: { GITHUB_ACTIONS: 'true', GITHUB_SHA: SHIPPED },
      result: { status: 1 },
    })

    expect(code).toBe(1)
    expect(output).toMatch(/^::error::Capture Worker deploy failed for expense-capture\. wrangler did not finish\./)
    expect(output).toContain('Workers Scripts > Edit')
    expect(output).not.toMatch(/skipped|deployed a{40}/)
    expect(existsSync(FILLED_CONFIG)).toBe(false)
  })

  it.each([
    ['staging', 'expense-capture-stg', 'The production capture Worker was not touched, and the check did not run.'],
    ['prod', 'expense-capture', 'The staging capture step had passed, and the check did not run.'],
  ])('says where things stand when wrangler fails on %s in CI', async (environment, worker, rest) => {
    fakeD1()

    const { output } = await deploy([environment], {
      env: { GITHUB_ACTIONS: 'true', GITHUB_SHA: SHIPPED },
      result: { status: 1 },
    })

    expect(output).toContain(`failed for ${worker}.`)
    expect(output).toContain('Both Pages projects had already shipped.')
    expect(output).toContain(`${worker} may be on either version`)
    expect(output).toContain(rest)
  })

  it('says the Worker was not touched when it fails before wrangler', async () => {
    fakeD1(unauthorised)

    const { output } = await deploy(['staging'], { env: { GITHUB_ACTIONS: 'true', GITHUB_SHA: SHIPPED } })

    expect(output).toContain('failed for expense-capture-stg.')
    expect(output).toContain('Authentication error. Both Pages projects had already shipped.')
    expect(output).toContain('expense-capture-stg was not touched.')
  })

  it('claims nothing about the app or the other Worker when run by hand', async () => {
    fakeD1()

    const { output } = await deploy(['prod'], { env: { GITHUB_SHA: SHIPPED }, result: { status: 1 } })

    expect(output).toContain('expense-capture may be on either version')
    expect(output).not.toMatch(/Pages|staging/)
  })

  it('fails when wrangler cannot be started', async () => {
    fakeD1()

    const { code, output } = await deploy(['prod'], { result: { status: null, error: new Error('spawn npx ENOENT') } })

    expect(code).toBe(1)
    expect(output).toContain('spawn npx ENOENT')
  })

  it.each([
    ['the token cannot read D1', unauthorised],
    ['the database is not there', () => ok([])],
    ['the answer is not JSON', () => new Response('<html>', { status: 502 })],
  ])('fails without deploying when %s', async (_why, respond) => {
    fakeD1(respond)

    const { code, runs, output } = await deploy(['prod'])

    expect(code).toBe(1)
    expect(runs).toEqual([])
    expect(output).toContain('::error::')
  })

  it('fails without a token, before asking anything', async () => {
    const fetchFake = fakeD1()

    const { code, runs, output } = await deploy(['prod'], { token: null })

    expect(code).toBe(1)
    expect(output).toContain('CLOUDFLARE_API_TOKEN is not set')
    expect(runs).toEqual([])
    expect(fetchFake).not.toHaveBeenCalled()
  })

  it('names a hand deploy after HEAD', async () => {
    fakeD1()

    const { code, runs } = await deploy(['staging'], { env: {} })

    expect(code).toBe(0)
    expect(runs[0]?.args).toContain(HEAD)
  })

  it('refuses a hand deploy of an edited tree', async () => {
    fakeD1()

    const { code, runs, output } = await deploy(['staging'], { env: {}, changes: ' M workers/capture/src/index.ts' })

    expect(code).toBe(1)
    expect(runs).toEqual([])
    expect(output).toContain('working tree has changes')
  })

  it('exits non-zero from the command line', () => {
    // The real script: no token and no login of whoever runs the tests may reach it.
    const home = mkdtempSync(join(tmpdir(), 'no-login-'))
    try {
      const result = spawnSync(process.execPath, [join(import.meta.dirname, 'deploy-capture.mjs'), 'nowhere'], {
        encoding: 'utf8',
        env: { PATH: process.env.PATH, HOME: home },
      })

      expect(result.status).toBe(1)
      expect(result.stdout).toContain('Say which Worker: staging or prod. No Worker was touched.')
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })
})

describe("what reaches the log of wrangler's output", () => {
  const SUBDOMAIN = 'made-up-subdomain'
  const DEPLOYED = [
    'Uploaded expense-capture (2.95 sec)',
    'Deployed expense-capture triggers (2.11 sec)',
    `  https://expense-capture.${SUBDOMAIN}.workers.dev`,
    '  schedule: 0 * * * *',
    'Current Version ID: 00000000-0000-0000-0000-000000000000',
  ].join('\n')
  const WARNING = `Could not reach ${SUBDOMAIN}.workers.dev/capture, retrying`
  /** What wrangler 4 prints when Cloudflare refuses the token: the hint, then all of `whoami`. */
  const REFUSED = [
    'It looks like you are authenticating Wrangler via a custom API token set in an environment variable.',
    'Getting User settings...',
    'You are logged in with an User API Token, associated with the email someone@example.com.',
    '│ Account Name          │ Account ID │',
    "│ Someone's own account │ an-id      │",
    'Membership roles in "Someone\'s own account": Contact account super admin to change your permissions.',
  ].join('\n')

  it.each([0, 1])('hides the address and keeps every other line, when wrangler exits %i', async (status) => {
    fakeD1()

    const { code, output } = await deploy(['prod'], { result: { status, stdout: DEPLOYED, stderr: WARNING } })

    expect(code).toBe(status)
    expect(output).not.toContain(SUBDOMAIN)
    expect(output).not.toMatch(/[\w-]\.workers\.dev/)
    for (const line of DEPLOYED.split('\n').filter((l) => !l.includes(SUBDOMAIN))) expect(output).toContain(line)
    expect(output).toContain('  https://<address hidden>')
    expect(output).toContain('Could not reach <address hidden>/capture, retrying')
  })

  it("leaves out whoami's account details, and keeps what came before them", async () => {
    fakeD1()

    const { output } = await deploy(['prod'], {
      result: { status: 1, stdout: REFUSED, stderr: 'Authentication error [code: 10000]' },
    })

    expect(output).toContain('custom API token')
    expect(output).toContain('Authentication error [code: 10000]')
    expect(output).toContain('account details are left out')
    expect(output).not.toMatch(/someone|Account Name|Membership/i)
  })

  it('leaves text without an address or an account as it was', () => {
    const text = 'Register a workers.dev subdomain\nworkers_dev = true\n'

    expect(publicOutput(text)).toBe(text)
  })

  // The filter only sees what is captured, so this runs a real child process with the options wrangler is given.
  it('captures what a real child process writes, rather than letting it through', async () => {
    fakeD1()
    const lines: string[] = []
    let captured = ''

    await main(['prod'], {
      env: { GITHUB_SHA: SHIPPED, CLOUDFLARE_ACCOUNT_ID: ACCOUNT },
      token: () => 'not-a-token',
      run: (
        _command: string,
        _args: string[],
        options: SpawnSyncOptions,
      ) => {
        const script = `console.log('https://a.${SUBDOMAIN}.workers.dev'); console.error('b.${SUBDOMAIN}.workers.dev')`
        const result = spawnSync(process.execPath, ['-e', script], options)
        captured = `${String(result.stdout)}${String(result.stderr)}`
        return result
      },
      log: (line: string) => lines.push(line),
    })

    expect(captured).toContain(SUBDOMAIN)
    expect(lines.slice(0, 2)).toEqual(['https://<address hidden>', '<address hidden>'])
  })
})
