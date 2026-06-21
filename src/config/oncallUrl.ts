/** On-call app URL until folio-shell ^1.0.2 is published with getSiteUrls().oncall. */
export function getOncallUrl(): string {
  const value = import.meta.env.VITE_ONCALL_URL?.trim()
  return value && value.length > 0 ? value : 'https://oncall.crivolotti.com'
}
