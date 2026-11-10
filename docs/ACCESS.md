# Checking the Access sign-in — expense-tracker

For an operator of the app: it checks the signed token Cloudflare Access adds to every request, and answers a 503 on
every route until it can.

## What is checked

A request that passed the Access login carries the person's email twice: in `Cf-Access-Authenticated-User-Email`, which
is plain text, and in `Cf-Access-Jwt-Assertion`, a token Access signs. The header is not proof of anything: a request
that reaches the app without passing Access can carry any value in it. Cloudflare's own advice is to validate the token
for that reason, so the app believes the header only after the token is checked. A request is a 401 unless its token is
RS256, signed by a key the team publishes, issued by the team, for this application, not expired, and names the same
address as the header. The answer never says which of these failed; the log does, without the token.

Access admits any Google account by design: the sign-in is authentication only, and a stranger who signs in is then
asked to request access, which the owner approves by hand. The allow-list in D1 (`allowed_users`) is the authorisation,
not Access.

## The settings

Two variables on the Pages project:

- `ACCESS_TEAM_DOMAIN`: `<team>.cloudflareaccess.com`. In the Zero Trust dashboard: Settings, General, Team domain.
- `ACCESS_AUD`: the application's Audience tag. In the Zero Trust dashboard: Access, Applications, the application's
  configuration, the Application Audience (AUD) tag. The dashboard moves it between releases, so look for that name.

The team domain is read as a hostname with at least one dot, in any case, with an optional `https://`, trailing slashes
and surrounding spaces, so a real `<team>.cloudflareaccess.com` is never refused. The name alone, a path, a port or
`http://` are not hostnames.

Both are required. With either missing, blank, or a team domain that is not a hostname, every request is a 503 with a
generic message, and the log names the setting that is wrong without printing a value. The names must be spelled
exactly: a misspelled name, or a pair saved in Preview instead of Production, reads as not set, and the deployment then
refuses everything instead of trusting the header.

The one exception is a request to `localhost`, `127.0.0.1` or `[::1]`, where Access does not run: with the settings
unset it is identified by the header alone, so `npm run dev:local` and the tests need no settings. A deployed request
reaches the app only through a hostname Cloudflare routes to the project, so it never arrives with one of those hosts.

Every environment that serves the app needs the pair: the Production and the Preview variable sets of each Pages
project. A Preview deployment of a project whose Access application does not cover it has no token to offer, so it
answers 503, which is the intended state.

## Turning it on

1. Set both on the staging project first, in the **Production** variable set (the project's Settings, then Variables
   and Secrets) and, so that branch previews work, in the **Preview** set.
2. Deploy again. A variable change applies from the next deployment and not to the one already live. Use the repo's own
   routes: `npm run deploy:dev` for staging and `npm run deploy` for production, each from the `main` branch (from any
   other, wrangler makes a Preview deployment, which reads the Preview variables), or a merge to `main`, which deploys
   both.
3. Check it took:
   - The deploy workflows do the first check themselves (see "The check after a deploy" below).
   - Signing in on the real hostname still loads the data.
4. Then do the same for the production project.

A hostname Access does not protect carries no token, so every request there is a 401. That is the point on an address
people should not reach, and the reason not to set the variables for an environment that is used on one. The installed
phone app must be installed from the custom domain: one installed from a `*.pages.dev` address stops loading data.
Each Access application has its own tag, so a project that serves hostnames of two applications cannot use one.
`npm run dev:local` has no Access; leave them unset there.

## The check after a deploy

`deploy.yml` ends with a probe of each project's bare `pages.dev` host after it deploys: one request with a made-up
address in `Cf-Access-Authenticated-User-Email` and no token. It passes only on a 401. Anything else fails the job
with a one-line message and no response body: a 503 means the settings are missing for that deployment, a 200 or 403
means the token is not being checked. The address is on no allow-list, so even a failing probe cannot read data.
The probe checks the project's production deployment only, not each preview.

## Reading the log

`npx wrangler pages deployment tail --project-name <project>`, run from the repo with the same Cloudflare login the
deploy scripts use, streams the project's function logs. The lines this check writes start with `access:` and name the
problem (which setting is wrong, that a token was missing, expired or for another application). They never print the
token or the value of a setting.

## With no network

The app asks for the person's access before anything else, and with no network nothing can answer. A device that holds a
saved copy of someone's data then opens the app on it, for the person the copy names, read-only, with a line that says
when it was saved and that nothing can be changed until there is a connection. Offline nothing can confirm who is
holding the phone, so whoever can open the installed app on an unlocked device reads the last person's figures there.
The device's own lock is what protects them, and turning this check on does not change that. A device with no copy says
the person is offline and offers Try again only. A ledger copy of a large ledger holds the rows of the months last
read and the totals of the rest, and the app says which months it has rows for.

A copy opens only for the person it names, and copies that name two people open for neither. The access check removes
every copy on the device, the ledger's too, when it refuses the person: a 401 or 403, an answer that they are not
allowed, or one that lets them in without the Expenses group (the owner always has it). Signing out removes them all as
well. Loading the data is narrower. A 401 or 403 there removes only the copy of the app that was loading (the dataset
copy, or the signed-in person's ledger copy when the ledger opens), and leaves any other. A 503 is the server failing
and says nothing about the person, so it leaves the copy and shows the "Couldn't check access" screen. If the device's
store has not answered after three seconds, the lookup gives up and the screen says the person is offline. The copy is
only a fallback for a server that does not answer: with the network back, refreshing reads the data again, and closing
the app and opening it again runs the whole access check.

## Going back

There is no setting that turns the check off. If everyone sees "Couldn't check access", or the app cannot load, put
back the last pair that worked, or correct the one that is wrong (a recreated Access application has a new tag), and
deploy again the same way. Deleting the variables does not help: the app then answers 503 everywhere but on localhost.

To restore service before the next deploy, use Pages' rollback to an earlier production deployment whose variables were
right; a deployment keeps the variables it was built with. Server data is untouched either way. A device refused with a
401 or 403 drops the offline copy it kept and loads it again once access works; a 503 leaves the copy where it is.

## Keys

The team's public keys come from `https://<team>/cdn-cgi/access/certs`. They are kept in memory for an hour, and fetched
again, at most once a minute, when a token names a key that is not held, so a key rotation is picked up. If the fetch
fails, keys already held go on being used; with none held a request is a 503, since an identity that cannot be checked
is not let through.
