# App files (R2)

A private bucket, `expense-tracker-app-files`, bound as `APP_FILES`, for deployment files the app serves that are not
user data. Today that is one object, the capture Shortcut at `shortcuts/capture.shortcut` ([CAPTURE.md](CAPTURE.md));
other files go beside it under a prefix for their kind. It has no public access and no custom domain, and the app reads
it only behind the sign-in. Nothing sweeps, lists or expires it, and user data (receipts, backups) never goes in it.

1. `npm run setup:app-files` prints the plan and changes nothing. It needs `CLOUDFLARE_ACCOUNT_ID` and a token with Pages
   and R2 edit rights.
2. `npm run setup:app-files -- --apply` creates the bucket and adds `APP_FILES` to production and preview, keeping the
   other bindings.
3. Redeploy (`npm run deploy`) so the binding reaches the running Functions.

Without the binding or the file the app still works: the setup card shows the manual steps. To put the Shortcut in it, see [CAPTURE.md](CAPTURE.md).
