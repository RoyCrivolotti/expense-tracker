# Checking the Access sign-in — expense-tracker

For an operator who wants the app to check the signed token Cloudflare Access adds to every request, instead of
believing the email header alone.

## What is checked

A request that passed the Access login carries the person's email twice: in `Cf-Access-Authenticated-User-Email`, which
is plain text, and in `Cf-Access-Jwt-Assertion`, a token Access signs. Without the check the app believes the header,
which is safe while every hostname that reaches the app is behind Access, since Access removes a header a client sent
itself. With the check on, a request is a 401 unless its token is RS256, signed by a key the team publishes, issued by
the team, for this application, not expired, and names the same address as the header. The answer never says which of
these failed; the log does, without the token.

## The settings

Two variables on the Pages project:

- `ACCESS_TEAM_DOMAIN`: `<team>.cloudflareaccess.com`. In the Zero Trust dashboard: Settings, General, Team domain.
- `ACCESS_AUD`: the application's Audience tag. In the Zero Trust dashboard: Access, Applications, the application's
  configuration, the Application Audience (AUD) tag. The dashboard moves it between releases, so look for that name.

The team domain is read as a hostname with at least one dot, in any case, with an optional `https://`, trailing slashes
and surrounding spaces, so a real `<team>.cloudflareaccess.com` is never refused. The name alone, a path, a port or
`http://` are not hostnames.

With neither set nothing changes, and blank counts as not set. If either is set, the check is meant to be on, so a pair
that cannot be used is never read as off: with only one of them, or a team domain that is not a hostname, every request
is a 503 and the log names the setting that is wrong. The names must be spelled exactly: a misspelled name, or a pair
saved in Preview instead of Production, reads as not set, so the check is off and nothing says so. The forged-header
request in step 3 below is what catches that.

## Turning it on

1. Set both on the staging project first. Add them to the **Production** variable set (the project's Settings, then
   Variables and Secrets), not Preview, which is for branch builds, whose hostnames Access usually does not cover.
2. Deploy again. A variable change applies from the next deployment and not to the one already live. Use the repo's own
   routes: `npm run deploy:dev` for staging and `npm run deploy` for production, each from the `main` branch (from any
   other, wrangler makes a Preview deployment, which reads the Preview variables), or a merge to `main`, which deploys
   both.
3. Check it took:
   - A request to the project's `*.pages.dev` address with a forged header,
     `curl -H 'Cf-Access-Authenticated-User-Email: <an allowed address>' https://<project>.pages.dev/api/expenses`,
     goes from the data (200) to a 401. That address is not behind Access, so the check is what closes it.
   - Signing in on the real hostname still loads the data.
4. Then do the same for the production project.

A hostname Access does not protect carries no token, so every request there is a 401. That is the point on an address
people should not reach, and the reason not to set the variables for an environment that is used on one. The installed
phone app must be installed from the custom domain: one installed from a `*.pages.dev` address stops loading data.
Each Access application has its own tag, so a project that serves hostnames of two applications cannot use one.
`npm run dev:local` has no Access; leave them unset there.

## Reading the log

`npx wrangler pages deployment tail --project-name <project>`, run from the repo with the same Cloudflare login the
deploy scripts use, streams the project's function logs. The lines this check writes start with `access:` and name the
problem (which setting is wrong, that a token was missing, expired or for another application). They never print the
token or the value of a setting.

## Going back

If everyone sees "Couldn't check access", or the app cannot load, delete both variables or correct them and deploy again
the same way.
Server data is untouched. A device refused with a 401 or 403 drops the offline copy it kept and loads it again once
access works; a 503 leaves the copy where it is.

## Keys

The team's public keys come from `https://<team>/cdn-cgi/access/certs`. They are kept in memory for an hour, and fetched
again, at most once a minute, when a token names a key that is not held, so a key rotation is picked up. If the fetch
fails, keys already held go on being used; with none held a request is a 503, since an identity that cannot be checked
is not let through.
