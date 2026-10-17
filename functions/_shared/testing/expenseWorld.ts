/**
 * The whole expenses API over a database the caller supplies (in tests, SQLite with the real
 * migrations): the real auth middleware, the real D1 repository, and a recording wrapper so a test can
 * see which statements a request ran. It takes the database rather than building one so that this file
 * needs no Node types, which the functions typecheck does not have.
 */
import { vi } from 'vitest'
import type { Env } from '../env'
import { createD1ExpenseRepository } from '../adapters/d1ExpenseRepository'
import { invokeExpenseApiRoute } from './invokeExpenseApiRoute'

// Not owner@example.com: migrations 0003 and 0011 leave a settings row (rollover day 13) under that
// placeholder, and a test owner should start from nothing.
export const OWNER = 'alex@example.com'
export const OTHER = 'sam@example.com'
export const API = 'https://expenses.test/api/expenses'

export type Handler = Parameters<typeof invokeExpenseApiRoute>[0]['handler']

/** The part of node:sqlite's DatabaseSync the world uses to seed access rows and read the token. */
export interface SqliteHandle {
  prepare(sql: string): { run(...args: string[]): unknown; get(...args: string[]): unknown }
}

export interface CallOptions {
  method?: string
  path?: string
  params?: Record<string, string>
  body?: unknown
  rawBody?: BodyInit
  email?: string
  headers?: Record<string, string>
}

export interface World {
  env: Env
  /** Every SQL string prepared since the last `clearLog`, in order. */
  log: string[]
  clearLog(): void
  /** The owner's token as stored, or null when there is no row. */
  token(owner?: string): string | null
  call(handler: Handler, options?: CallOptions): Promise<Response>
  /** Look at every statement before it runs, and throw to fail it. */
  intercept(intercept: (sql: string) => void): void
}

/** A minimal R2 stand-in with the surface the receipt adapter uses. */
function fakeBucket(): R2Bucket {
  const objects = new Map<string, Uint8Array>()
  return {
    put: (key: string, body: ArrayBuffer) => {
      objects.set(key, new Uint8Array(body))
      return Promise.resolve()
    },
    get: (key: string) => {
      const stored = objects.get(key)
      if (!stored) return Promise.resolve(null)
      const body = new ReadableStream({
        start(c) {
          c.enqueue(stored)
          c.close()
        },
      })
      return Promise.resolve({ body, size: stored.length, httpEtag: `"${key}"` })
    },
    delete: (keys: string | string[]) => {
      for (const key of Array.isArray(keys) ? keys : [keys]) objects.delete(key)
      return Promise.resolve()
    },
  } as unknown as R2Bucket
}

export function createExpenseWorld(sqlite: SqliteHandle, d1: D1Database): World {
  const log: string[] = []
  let intercepting: (sql: string) => void = () => undefined
  const recording = {
    prepare: (sql: string) => {
      log.push(sql)
      intercepting(sql)
      return d1.prepare(sql)
    },
    batch: (statements: Parameters<D1Database['batch']>[0]) => d1.batch(statements),
  } as unknown as D1Database
  const env: Env = { DB: recording, OWNER_EMAIL: OWNER, RECEIPTS: fakeBucket() }
  for (const email of [OWNER, OTHER]) {
    sqlite.prepare('INSERT INTO allowed_users (email, granted_by) VALUES (?, ?)').run(email, OWNER)
    sqlite.prepare("INSERT INTO user_group_grants (email, group_id) VALUES (?, 'expenses')").run(email)
  }
  const repo = createD1ExpenseRepository(env)
  return {
    env,
    log,
    clearLog: () => {
      log.length = 0
    },
    token: (owner = OWNER) => {
      const row = sqlite.prepare('SELECT token FROM owner_revision WHERE owner = ?').get(owner) as
        | { token: string }
        | undefined
      return row?.token ?? null
    },
    call: (handler, options = {}) =>
      invokeExpenseApiRoute({
        handler,
        repo,
        env,
        url: `${API}${options.path ?? ''}`,
        method: options.method ?? 'GET',
        email: options.email ?? OWNER,
        ...(options.params ? { params: options.params } : {}),
        ...(options.body !== undefined ? { body: options.body } : {}),
        ...(options.rawBody !== undefined ? { rawBody: options.rawBody } : {}),
        ...(options.headers ? { extraHeaders: options.headers } : {}),
      }),
    intercept: (fn) => {
      intercepting = fn
    },
  }
}

/**
 * Pin the clock to a day, so the budget month a request sees is the one the test means. Only `Date`
 * is faked: the SQLite shim settles its promises without timers. Undo with `vi.useRealTimers()`.
 */
export function pinClock(isoDate: string): void {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(`${isoDate}T12:00:00Z`))
}
