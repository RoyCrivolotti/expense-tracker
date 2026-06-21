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
}

export interface InMemoryAccessDb {
  db: D1Database
  purgedOwners: string[]
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
      for (const stmt of stmts) {
        void stmt.run()
      }
      return Promise.resolve([])
    },
  } as unknown as D1Database
}

export function createInMemoryAccessDb(): InMemoryAccessDb {
  const state: AccessState = {
    users: new Map(),
    requests: new Map(),
    grants: new Map(),
    purgedOwners: [],
  }

  return {
    db: createAccessDb(state),
    get purgedOwners() {
      return state.purgedOwners
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
