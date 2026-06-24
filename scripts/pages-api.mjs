import { ACCOUNT_ID, cf } from './access-api.mjs'

export async function findPagesProject(token, projectName) {
  try {
    return await cf(token, `/accounts/${ACCOUNT_ID}/pages/projects/${projectName}`)
  } catch (err) {
    if (String(err.message).includes('8000007') || String(err.message).includes('not found')) {
      return null
    }
    throw err
  }
}

export async function ensurePagesDomain(token, projectName, domain) {
  let domains
  try {
    domains = await cf(token, `/accounts/${ACCOUNT_ID}/pages/projects/${projectName}/domains`)
  } catch (err) {
    throw new Error(`${projectName}: ${err.message}`, { cause: err })
  }
  const exists = domains.some((d) => d.name === domain || d.domain === domain)
  if (exists) {
    console.log(`${projectName}: custom domain ${domain} already registered`)
    return
  }
  await cf(token, `/accounts/${ACCOUNT_ID}/pages/projects/${projectName}/domains`, {
    method: 'POST',
    body: JSON.stringify({ name: domain }),
  })
  console.log(`${projectName}: registered custom domain ${domain}`)
}
