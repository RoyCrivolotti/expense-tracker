import { createD1AccessRepository } from '../adapters/d1AccessRepository'
import type { AccessServiceDeps } from './accessService'
import type { Env } from '../env'

export function createAccessDeps(env: Env): AccessServiceDeps {
  return {
    repo: createD1AccessRepository(env),
    env,
  }
}
