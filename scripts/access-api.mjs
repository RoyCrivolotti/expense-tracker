import { resolveCloudflareToken } from './cloudflare-auth.mjs'

export const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID ?? '800abdfb2ec1687266f66fd349c41d6a'

export function requireToken() {
  const token = resolveCloudflareToken()
  if (!token) throw new Error('CLOUDFLARE_API_TOKEN required (OAuth lacks Access API scope)')
  return token
}

export async function cf(token, path, init = {}) {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  })
  const data = await res.json()
  if (!data.success) {
    const msg = data.errors?.map((e) => e.message).join('; ') ?? res.statusText
    throw new Error(`${path}: ${msg}`)
  }
  return data.result
}

export async function listAccessApps(token) {
  return cf(token, `/accounts/${ACCOUNT_ID}/access/apps?per_page=100`)
}

export async function findAccessApp(token, name) {
  const apps = await listAccessApps(token)
  return apps.find((a) => a.name === name) ?? null
}

export function googleIdpRule(idps) {
  const google = idps.find((idp) => idp.type === 'google')
  if (!google) throw new Error('Google identity provider not found on this account')
  return { identity: { id: google.id } }
}

export async function ensureGoogleAllowPolicies(token, appId) {
  const idps = await cf(token, `/accounts/${ACCOUNT_ID}/access/identity_providers?per_page=100`)
  const googleRule = googleIdpRule(idps)
  const policies = await cf(token, `/accounts/${ACCOUNT_ID}/access/apps/${appId}/policies?per_page=100`)
  const allowPolicies = policies.filter((p) => p.decision === 'allow')

  if (allowPolicies.length === 0) {
    await cf(token, `/accounts/${ACCOUNT_ID}/access/apps/${appId}/policies`, {
      method: 'POST',
      body: JSON.stringify({
        decision: 'allow',
        name: 'Allow Google',
        include: [googleRule],
        exclude: [],
        require: [],
        precedence: 1,
      }),
    })
    console.log('Created Allow Google policy')
    return
  }

  for (const policy of allowPolicies) {
    const body = {
      decision: policy.decision,
      name: policy.name,
      include: [googleRule],
      exclude: policy.exclude ?? [],
      require: policy.require ?? [],
      precedence: policy.precedence,
    }
    const appPath = `/accounts/${ACCOUNT_ID}/access/apps/${appId}/policies/${policy.id}`
    const accountPath = `/accounts/${ACCOUNT_ID}/access/policies/${policy.id}`
    try {
      await cf(token, appPath, { method: 'PUT', body: JSON.stringify(body) })
    } catch (err) {
      if (!String(err.message).includes('reusable')) throw err
      await cf(token, accountPath, { method: 'PUT', body: JSON.stringify(body) })
    }
    console.log(`Access policy "${policy.name}" → Google sign-in only`)
  }
}

export async function syncAccessHostnames(token, app, hostnames) {
  const domains = new Set(app.domains ?? [])
  const added = []
  for (const host of hostnames) {
    if (!domains.has(host)) {
      domains.add(host)
      added.push(host)
    }
  }
  if (added.length === 0) {
    console.log(`${app.name}: already includes ${hostnames.join(', ')}`)
    return app
  }
  const updated = await cf(token, `/accounts/${ACCOUNT_ID}/access/apps/${app.id}`, {
    method: 'PUT',
    body: JSON.stringify({ ...app, domains: [...domains] }),
  })
  console.log(`${app.name}: added ${added.join(', ')}`)
  return updated
}
