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

## Turning it on

Set two variables on the Pages project:

- `ACCESS_TEAM_DOMAIN`: `<team>.cloudflareaccess.com` (Zero Trust → Settings → General → Team domain).
- `ACCESS_AUD`: the Audience tag of the application (Zero Trust → Access → Applications → it → Overview).

With neither set nothing changes. With only one, or a domain that is not a hostname, the check stays off and the log
says so once, so half a setting never takes the app down. Set them only for an environment whose hostnames are all
behind that Access application: a hostname Access does not protect carries no token, so every request there would be
a 401. Each Access application has its own tag, so a Pages project that serves hostnames of two applications cannot use
one. `npm run dev:local` has no Access; leave them unset there.

## Keys

The team's public keys come from `https://<team>/cdn-cgi/access/certs`. They are kept in memory for an hour, and fetched
again, at most once a minute, when a token names a key that is not held, so a key rotation is picked up. If the fetch
fails, keys already held go on being used; with none held a request is a 503, since an identity that cannot be checked
is not let through.
