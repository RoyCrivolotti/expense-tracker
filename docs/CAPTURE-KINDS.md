# Source words and push kinds

For a contributor who has a real bank push to teach the app. How capture reads pushes is in [CAPTURE.md](CAPTURE.md).

## Source words

A **source word** is a free label for one phone automation, usually a bank's name: lowercase `a-z`, digits and hyphens,
1 to 32 characters (`isSourceWord` in [`source.ts`](../src/domain/capture/source.ts), used by the Worker and by the
card-link route). A word with no kind rows is accepted and only counted as unrecognised, so a bank can start sending
before its kinds are written. A person may have at most 8 different words. A ninth is a 429 with no `Retry-After`, because
the cap is permanent until the person's `capture_counters` rows are cleared. A word already counted is always admitted. The status route lists `iberia` and `santander` always, then any other counted word.

## Adding a kind

A kind is one row in [`KIND_RULES`](../src/domain/capture/classify.ts). Adding one is a data change plus a test. Start
from a real push the owner has sent and write only what its wording says. Never fill a row from memory of how a bank
phrases things.

1. Take the **title** exactly as received. It is compared without case or accents.
2. If two different pushes share a title, add a **body** pattern that tells them apart. Leave it out otherwise.
3. Set the `kind`, and the decimal `mark` the amounts in that body use (`comma` for `33,40`, `dot` for `33.40`).
4. Set `keepsText` to false when the body holds another person's name, so the text is never kept.
5. Add a test beside the existing ones in `classify.test.ts` with an **invented** body in the same shape as the real one.

Only product wording goes into the repository: the title and the fixed words of a body pattern. Never an amount, a
merchant, a person's name, or card or account digits, in the row, the test or the pull request. The row's `source` is the
word the person's Shortcut sends. A new source needs no other change: any valid word is accepted and counted, and it
appears in the setup status once pushes arrive.
