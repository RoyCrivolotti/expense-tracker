# Precache the shell, and serve it only when the network fails

For an engineer changing the service worker or the build that generates it. The invariant is in [ARCHITECTURE.md](../ARCHITECTURE.md).

**Context.** The app is a single page behind Cloudflare Access, and it is installed to the home screen. An Access session
ends, and the installed app on iOS has a cookie jar of its own, so a launch has to reach the network for Access to ask for
a sign-in. A worker that answered the launch from a cached shell skipped that, and the app loaded without being able to
reach its API. The app also has to start with no network at all, which needs the shell and the assets it names in the
worker's precache, from the same build.

**Decision.** `index.html` is precached with a revision, with the assets it names. A navigation goes to the network, and the
precached shell answers only when the request fails. Two defaults of the generated worker answer from the precache first,
and both are off: the route that answers every navigation with the shell, and the directory index that answers `/` with
the precached `index.html`. `/` is the URL the installed app launches at. An API URL, an Access URL and the app's own
requests for its data are left to the browser, and the worker keeps no response outside its precache.

**Consequences.**
- A launch with no network opens the app. What it shows is the app's connection screen: the access check comes first, and
  the saved copy of the data is read only after it passes.
- The shell and its assets are installed or kept together. An update whose files cannot all be fetched leaves the worker
  that is installed in place.
- A navigation to `/index.html` itself, which Pages redirects to `/`, is answered from the precache.
- A server that answers with an error status, or a network that stalls, is not a failed request: the browser shows what
  it got.

**Not chosen.**
- The shell first, as a navigation route: the worker would be one the app cannot sign in through, as above.
- The network first, keeping the last page fetched in a runtime cache: the page kept can name assets the installed
  worker does not hold, and Workbox only takes a timeout for a strategy that keeps it.
- A shell with an integrity hash: a page that a proxy rewrites on the way would fail every install, and the worker would
  never update.
- No shell in the precache, as the worker was: `createHandlerBoundToURL` throws while the worker is evaluated, which the
  browser does not report as a failed install, and the worker answers no navigation.
