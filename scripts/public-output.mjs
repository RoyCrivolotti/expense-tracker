/**
 * What wrangler wrote, fit for a public log: the repo's Actions logs are public. Wrangler prints each Worker's
 * address, which is private (docs/CAPTURE.md). On an authentication error it goes on to run `whoami`, which names the
 * account and can name its email.
 * @param {string} text
 */
export function publicOutput(text) {
  return text
    .replace(/^.*Getting User settings[\s\S]*$/m, "(wrangler's account details are left out)")
    .replace(/[\w.-]*\.workers\.dev/gi, '<address hidden>')
}
