import type { AccessGroupId } from '../../domain/accessGroups'
import { runMutation } from './inMemoryAccessDbMutations'
import { queryAll, queryFirst } from './inMemoryAccessDbQueries'

interface AllowedRow {
  email: string
  status: 'active' | 'revoked'
  granted_at: string
  granted_by: string | null
  last_seen_at: string | null
}

interface RequestRow {
  id: string
  email: string
  requested_at: string
  status: 'pending' | 'approved' | 'rejected'
  token_hash: string
  expires_at: string
}

interface BoundStmt {
  sql: string
  args: unknown[]
  first(): Promise<unknown>
  all(): Promise<{ results: unknown[] }>
  run(): Promise<{ meta: { changes: number } }>
}

export interface AccessState {
  users: Map<string, AllowedRow>
  requests: Map<string, RequestRow>
  grants: Map<string, Set<string>>
  purgedOwners: string[]
  revisionBumps: string[]
}

export interface InMemoryAccessDb {
  db: D1Database
  purgedOwners: string[]
  /** One entry per dataset revision bump, in order: the owner it was for. */
  revisionBumps: string[]
  seedActiveUser(
    email: string,
    opts?: { grantedBy?: string | null; groups?: AccessGroupId[] },
  ): void
  seedPendingRequest(id: string, email: string): void
}

export const NOW = '2026-01-01T00:00:00.000Z'

export function asEmail(value: unknown): string {
  return String(value)
}

export function activeUsers(users: Map<string, AllowedRow>): AllowedRow[] {
  return [...users.values()].filter((row) => row.status === 'active')
}

export function bindStatement(sql: string, state: AccessState, args: unknown[] = []): BoundStmt {
  return {
    sql,
    args,
    first: () => Promise.resolve(queryFirst(sql, state, args)),
    all: () => Promise.resolve({ results: queryAll(sql, state, args) }),
    run: () => Promise.resolve(runMutation(sql, state, args)),
  }
}

export function createAccessDb(state: AccessState): D1Database {
  return {
    prepare(sql: string) {
      const stmt = bindStatement(sql, state, [])
      return {
        bind(...args: unknown[]) {
          return bindStatement(sql, state, args)
        },
        first: () => stmt.first(),
        all: () => stmt.all(),
        run: () => stmt.run(),
      }
    },
    batch(stmts: BoundStmt[]) {
      // A read in a batch (the revision token before a bump) finds nothing here: the fake keeps no tokens.
      return Promise.resolve(
        stmts.map((stmt) => (/^\s*select/i.test(stmt.sql) ? { results: [] } : (void stmt.run(), { results: [] }))),
      )
    },
  } as unknown as D1Database
}

export function createInMemoryAccessDb(): InMemoryAccessDb {
  const state: AccessState = {
    users: new Map(),
    requests: new Map(),
    grants: new Map(),
    purgedOwners: [],
    revisionBumps: [],
  }

  return {
    db: createAccessDb(state),
    get purgedOwners() {
      return state.purgedOwners
    },
    get revisionBumps() {
      return state.revisionBumps
    },
    seedActiveUser(email, opts = {}) {
      state.users.set(email, {
        email,
        status: 'active',
        granted_at: NOW,
        granted_by: opts.grantedBy ?? null,
        last_seen_at: null,
      })
      if (opts.groups?.length) state.grants.set(email, new Set(opts.groups))
    },
    seedPendingRequest(id, email) {
      state.requests.set(id, {
        id,
        email,
        requested_at: NOW,
        status: 'pending',
        token_hash: id,
        expires_at: '2027-01-01T00:00:00.000Z',
      })
    },
  }
}
