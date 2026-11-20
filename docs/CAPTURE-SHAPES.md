# Shapes and slots

For a contributor working on how capture reads a push. It covers the reader in `src/domain/capture` that turns any
push into a template (its shape) and the numbers in it (its slots), without knowing the bank or the language, what the
Worker makes of each push with it, and what to do when a bank's pushes are read wrong.

## Why it has no words

A rule per bank needs that bank's wording written into code, so a new bank, a rewording or another language would be a
code change. The reader holds no bank word and one worded cue, `ending`, inherited from the old reader (`ending 1234` names a card).
Everything else it looks at is the form of a token: a number, a card's last four digits, a date, a code. The one thing it knows from outside is the set of currency markers
([`currency.ts`](../src/domain/capture/currency.ts)): ISO 4217 codes and a list of symbols (`€`, `$`, `R$`, `kr` and so
on). A code that is also a word somewhere (`all`, `try`, `top`) counts only in capitals.

## Slots

`readSlots(text)` in [`slots.ts`](../src/domain/capture/slots.ts) splits the text on whitespace (`tokenise`, which keeps
punctuation on its token) and returns the tokens it can name. A push is read as `readPushSlots(title, body)`, so the
positions line up with `skeletonOf`.

- **number**: the token as written, its candidate readings in cents, the currency marker glued to it or standing next to
  it, and whether a minus came before it. The minus is a cue about direction and never signs the amount. A marker
  standing alone belongs to one number: the plain number right before it, else the one right after, so `12,50 EUR 3
  items` leaves the 3 with no currency. When the marker is a symbol several currencies share (`$`, `¥`, `kr`), the
  slot carries `currencyGuess: true`. Its ISO code is a guess that whatever uses the slot must treat as unconfirmed.
- **masked-digits**: the last four digits of a card or account, as `**1234`, `*1234`, `····1234`, `…1234` or after the
  word `ending`.
- **date**: `2026-11-20`, `20/11/2026`, `20-11-2026` or `20.11.2026`, the last three day first. A date that does not
  exist (`31/13/2026`) is not a date. When day and month are both 12 or less and differ (`03/04/2026`) the slot is
  read day first and carries `ambiguous: true`, since month first was possible. There are no month names.
- **code**: a bare run of 4 to 8 digits with no marker and no sign. A one-time code looks like this, and so does a
  year, so it is never taken for an amount.

`readNumber` does not know which decimal mark a bank uses, because one bank writes `-50.0 EUR`, `50,00EUR` and
`1.234,56 EUR`. With both marks present the last is the decimal. With one kind, one or two digits after it are a
decimal (`4.54`, `2,99`) and exactly three are a thousands group (`1.234` is 1234 euros). A single separator before
three digits is flagged `ambiguous`, so a mark learned later can overrule it. Anything else that cannot be money (three
decimals, a grouping that is not one, over the cap of 1,000,000 euros) gives no candidate rather than a wrong one, and
the token is still a slot.

`currencyAmount(slots)` picks the amount: the one number with a currency marker. Two marked numbers that read the same
cents are one amount, and two that differ give nothing, since the reader cannot tell the charge from a balance.

## Shape

`skeletonOf(title, body, slots)` in [`shape.ts`](../src/domain/capture/shape.ts) folds the words to lower case without
accents and replaces each slot with a placeholder (`<N>`, `<D>`, `<DATE>`, `<CODE>`) and each currency marker with
`<C>`. Any other token that holds a digit (a time, a reference, a percentage) becomes `<X>`. A marker glued to a number
is written apart from it, so `50,00EUR` and `50,00 EUR` give one skeleton. Two pushes a bank wrote from one template
give one skeleton whatever the amount, card, date, currency or any other number. `shapeId(source, skeleton)`
is the SHA-256 of both, so the same words from two banks stay two shapes.

## The merchant, from siblings

A first push of a shape has nothing to show where its merchant is. Two skeletons of one template share their start and
their end, and what is left in the middle of each is the part that varies. `siblingSlot(a, b)` returns that run for
each side, `{ a, b }`, and `withWildcard(tokens, run)` replaces a run with `<M>`. The two runs may differ in length
(one word against four), and one may be empty when a push names no merchant. Equal skeletons give null, and so do two
texts that only share a few words: the shared start and end must cover half of the shorter one and hold at least three
tokens that are not placeholders, and a run may not pass 8 tokens.

## At receipt

Every push is read the same way, whatever its source word. [`readPush(title, body)`](../src/domain/capture/readPush.ts) reads the words, the slots and the skeleton in one pass, so
a position means the same token in all three. A push becomes a recommendation only when `currencyAmount` finds its one
amount with a currency marker ([`store.ts`](../workers/capture/src/store.ts)): the amount is that number's first reading,
the currency its marker's ISO code, the type `expense`, the card digits the one masked-digits slot when the push shows
exactly one, and the date the push's own. Anything else is counted as unread and nothing of it is kept
([CAPTURE-WORKER.md](CAPTURE-WORKER.md) has the reasons). The skeleton is not one token per word (a glued `50,00EUR` gives `<N>
<C>`), so `readPush` also keeps which word each skeleton token came from, and `spanText` turns a run back into the words
as the bank wrote them.

Then it finds the person's template ([`templates.ts`](../workers/capture/src/templates.ts)):

1. It reads their templates for the same source and the same masked title, the 50 most recently seen.
2. One with the same skeleton is the template.
3. Otherwise the first that is a sibling of the push. If that template already knows where its merchant is, the push
   must differ from it exactly at the `<M>`. If it does not know yet, it learns it now: the run is recorded and the
   template's skeleton is rewritten with `<M>` there. Either way the push's own run is its merchant.
4. If none pairs, the push starts a new template, which knows no merchant yet. A push whose skeleton passes 1,000
   characters gets no template.

So the first push of a new wording is described by its whole body, as before, and from the second push at another
merchant the description is the merchant. A third merchant joins the same template. One pair cannot tell a merchant
from a verb, so a purchase and a refund that share a title and differ in one word can put the `<M>` on that word;
learning a type per template is what settles it. All of it is written in the batch that stores the push, so a failure
stores none of it and a replay changes no template.

A template the person's decisions have muted (three dismissals in a row with no accept ever, [CAPTURE.md](CAPTURE.md),
"What it learns") is still matched the same way. A push with its exact skeleton, or a sibling at its `<M>`, is counted as
unread and as a sighting of the template, and nothing else of it is stored. A template muted before it learned its
merchant still holds the first merchant's words, so a sibling that differs there is another merchant: it is stored as
usual and teaches the template its run. A push that starts a new template is never muted. What is kept, and for how long, is in [CAPTURE.md](CAPTURE.md),
"What is stored".

## Source words

A **source word** is the label of one bank app's pushes: lowercase `a-z`, digits and hyphens, 1 to 32 characters,
starting with a letter or digit (`isSourceWord` in [`source.ts`](../src/domain/capture/source.ts), used by the Worker
and by the card-link route). The shortcut sends the notification's App name as `app`, and the Worker folds it into the
word (`sourceWordOf`): lowercased, accents dropped, every run of other characters a hyphen, trimmed, so "SampleCards"
is `samplecards` and "Bank 24 Online" is `bank-24-online`. A name with nothing left is a 400, so a bank app whose name has no Latin letter or digit (one written in another
script) needs a typed `source` word. An older shortcut sends a typed
`source` word instead, and a valid one wins over `app`, so its templates and card links keep their word. Every word is
read the same way, and nothing in the app depends on which word it is: it keeps one bank's templates and card links
apart from another's, and the Settings screens show it as it is. The word `-` is never a source: it is where
unreadable requests are counted ([CAPTURE-WORKER.md](CAPTURE-WORKER.md)). A
person may have at most 8 different words. A ninth is a 429 with no `Retry-After`, because the cap is permanent until the
person's `capture_counters` rows are cleared. A word already counted is always admitted.

## How a bank is learned

There is nothing to add for a new bank. Its first push with an amount and a currency marker makes a template and a
recommendation, typed as an expense and described by the whole push. The person's decisions do the rest
([CAPTURE.md](CAPTURE.md), "What it learns"): the amount's place and decimal mark, the type and the account come from
what they save, and the merchant's place from the second push of the same wording at another merchant.

When a bank's pushes are read wrong, the fix is on the phone, not in the code:

- **A wrong amount, type or description**: open Review, correct it and save. The template learns from that save.
- **A push that should never be suggested** (an offer, a balance alert): Don't add. Three in a row on a wording never
  added mute it; Settings, Capture, "Muted pushes" brings it back.
- **A push that never shows up**: Settings, Capture, "Capture diagnostics" says whether it arrived and was not read.
  A push with no currency-marked amount is counted and never suggested; that is deliberate, since a one-time code
  looks the same.

If a bank writes amounts in a way the reader cannot read at all, the change belongs in the reader (`slots.ts`,
`currency.ts`), tested with an **invented** push in the same form. Never put a real amount, merchant, name, or card or
account digits in the code, a test or a pull request, and never a bank's or a language's word.
