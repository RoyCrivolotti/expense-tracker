# Docs

For anyone looking for a doc: each is written for one audience, named in its first line.

| Doc | Audience | Holds |
| --- | --- | --- |
| [CHANGELOG.md](./CHANGELOG.md) | User | What changed in the product |
| [SCREENSHOT-GALLERY.md](./SCREENSHOT-GALLERY.md) | User | The UI, screen by screen |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Contributor | Layers, and the rules the code must keep obeying |
| [API.md](./API.md) | Contributor | Every read and bulk route: parameters, bounds, errors, caching, cost |
| [TESTING.md](./TESTING.md) | Contributor | Test layers, coverage gates, local test tooling |
| [GOALS-MODEL.md](./GOALS-MODEL.md) | Contributor | The Goals projection engine and its assumptions |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Operator | Hosting, access control, migrations, backups, receipts |
| [OPS.md](./OPS.md) | Operator | Staging, setup scripts, importing data |
| [MEASURING.md](./MEASURING.md) | Operator | Measuring rows billed per route on a deployed D1, safely |
| [SCALING.md](./SCALING.md) | Engineer deciding | How data reaches the browser, the platform limits, the design for large ledgers |
| [ENGINE-HISTORY.md](./ENGINE-HISTORY.md) | Engineer deciding | How much history each engine and screen reads |
| [decisions/](./decisions/) | Engineer deciding | Short records of design choices, with what was not chosen |

The writing rules are in [AGENTS.md](../AGENTS.md#documentation).
