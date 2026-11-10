/**
 * The same URL on `localhost`. The auth middleware identifies a request by its unsigned header only on a local
 * development host (`isLocalDevelopmentHost`), so the helpers that run a route through it send the request there and
 * the tests keep writing the URL they mean. A test of what a deployed host gets passes `host: 'as-given'`.
 */
export function onLocalHost(url: string): string {
  const local = new URL(url)
  local.protocol = 'http:'
  local.host = 'localhost'
  return local.toString()
}

export type HostChoice = 'local' | 'as-given'

export function requestUrl(url: string, host: HostChoice | undefined): string {
  return host === 'as-given' ? url : onLocalHost(url)
}
