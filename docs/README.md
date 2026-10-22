# Docs

For anyone looking for a doc: each is written for one audience, named in its first line.

| Doc | Audience | Holds |
| --- | --- | --- |
| [CHANGELOG.md](./CHANGELOG.md) | User | What changed in the product |
| [SCREENSHOT-GALLERY.md](./SCREENSHOT-GALLERY.md) | User | The UI, screen by screen |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Contributor | Layers, and the rules the code must keep obeying |
| [LEDGER-MODE.md](./LEDGER-MODE.md) | Contributor | How the browser holds and reads a ledger in parts: the switch, the session, the lists in pages, the writes, and what a window asks the server |
| [API.md](./API.md) | Contributor | Every read and bulk route: parameters, bounds, errors, caching, cost |
| [BEHAVIOR.md](./BEHAVIOR.md) | Contributor | How import, instalment plans, recurring suggestions and budget months behave |
| [TESTING.md](./TESTING.md) | Contributor | Test layers, coverage gates, local test tooling |
| [GOALS-MODEL.md](./GOALS-MODEL.md) | Contributor | The Goals projection engine and its assumptions |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Operator | Hosting, access control, migrations, backups, receipts |
| [BACKUPS.md](./BACKUPS.md) | Operator | The resumable backup, and restoring from either form |
| [OPS.md](./OPS.md) | Operator | Staging setup, the scripts, the demo account |
| [MEASURING.md](./MEASURING.md) | Operator | Measuring rows billed per route on a deployed D1, safely |
| [SCALING.md](./SCALING.md) | Engineer deciding | How data reaches the browser, the platform limits, the design for large ledgers |
| [ENGINE-HISTORY.md](./ENGINE-HISTORY.md) | Engineer deciding | How much history each engine and screen reads |
| [decisions/](./decisions/) | Engineer deciding | Short records of design choices, with what was not chosen |

The writing rules are in [AGENTS.md](../AGENTS.md#documentation).
