// @vitest-environment node
// What .github/workflows/prune-deployments.yml promises: the weekly run deletes, a manual run does not unless asked,
// no pull request can start it, and it prunes the projects the deploy workflows ship to.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (file: string) => readFileSync(join(import.meta.dirname, '..', '.github/workflows', file), 'utf8')
const prune = read('prune-deployments.yml')
const triggers = prune.slice(prune.indexOf('\non:'), prune.indexOf('\npermissions:'))

describe('prune-deployments.yml', () => {
  it('runs weekly and by hand, and never for a pull request', () => {
    expect(triggers).toMatch(/schedule:\n\s+- cron: '[^']+ \* \* \d'/)
    expect(triggers).toContain('workflow_dispatch:')
    expect(prune).not.toMatch(/pull_request/)
  })

  it('makes a manual run a dry run unless dry_run is switched off', () => {
    expect(triggers).toMatch(/dry_run:[\s\S]*type: boolean\n\s+default: true/)
    expect(prune).toContain('[ "$EVENT" = schedule ] || [ "$DRY_RUN" = false ]')
  })

  it('reads the repository and nothing else', () => {
    expect(prune).toMatch(/^permissions:\n {2}contents: read\n/m)
    expect(prune).not.toMatch(/write/)
  })

  it('stays out of forks', () => {
    expect(prune).toMatch(/if: github\.repository == '[\w-]+\/[\w-]+'/)
  })

  it('uses the account and token the deploy uses', () => {
    const accountId = /CLOUDFLARE_ACCOUNT_ID: '(\w+)'/
    expect(prune.match(accountId)?.[1]).toBe(read('deploy.yml').match(accountId)?.[1])
    expect(prune).toContain('CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}')
  })

  it('prunes the projects the deploy ships to', () => {
    const matrix = /project: \[([^\]]+)\]/.exec(prune)?.[1]?.split(',').map((name) => name.trim())
    const deploy = read('deploy.yml')

    expect(matrix).toHaveLength(2)
    for (const project of matrix!) expect(deploy).toContain(project)
  })
})
