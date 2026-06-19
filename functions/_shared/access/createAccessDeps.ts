import { createD1AccessRepository } from '../adapters/d1AccessRepository'
import { createAccessNotifier } from '../adapters/createAccessNotifier'
import type { AccessServiceDeps } from './accessService'
import type { Env } from '../env'

function appOrigin(request: Request, env: Env): string {
  const configured = env.APP_ORIGIN?.trim()
  if (configured) return configured.replace(/\/$/, '')
  return new URL(request.url).origin
}

export function createAccessDeps(request: Request, env: Env): AccessServiceDeps {
  return {
    repo: createD1AccessRepository(env),
    env,
    notifier: createAccessNotifier(env),
    appOrigin: appOrigin(request, env),
  }
}
