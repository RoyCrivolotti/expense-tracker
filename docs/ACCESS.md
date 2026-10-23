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

- `ACCESS_TEAM_DOMAIN`: `<team>.cloudflareaccess.com`. In the Zero Trust dashboard: Settings → General → Team domain.
- `ACCESS_AUD`: the application's Audience tag. Zero Trust → Access → Applications → the application → Overview →
  Application Audience (AUD) Tag.

With neither set nothing changes. If either is set, the check is meant to be on, so a pair that cannot be used is never
read as off: with only one of them, or a team domain that is not a bare hostname (the name alone, or with a path, a
port or `http://`), every request is a 503 and the log names the setting that is wrong. Blank counts as not set.

## Turning it on

1. Set both on the staging project first. Add them to the **Production** variable set (Workers & Pages → the project →
   Settings → Variables and Secrets), not Preview, which is for branch builds, whose hostnames Access usually does not cover.
2. Redeploy. A variable only reaches deployments made after it was saved (Deployments → the latest → Retry deployment).
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

## Going back

If everyone sees "Couldn't check access", or the app cannot load, delete both variables or correct them and redeploy.
Server data is untouched. A device refused with a 401 or 403 drops the offline copy it kept and loads it again once
access works; a 503 leaves the copy where it is.

## Keys

The team's public keys come from `https://<team>/cdn-cgi/access/certs`. They are kept in memory for an hour, and fetched
again, at most once a minute, when a token names a key that is not held, so a key rotation is picked up. If the fetch
fails, keys already held go on being used; with none held a request is a 503, since an identity that cannot be checked
is not let through.
