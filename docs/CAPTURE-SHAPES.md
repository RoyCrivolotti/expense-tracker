# Shapes and slots

For a contributor working on how capture reads a push. It covers the reader in `src/domain/capture` that turns any
push into a template (its shape) and the numbers in it (its slots), without knowing the bank or the language. The
Worker still recognises pushes with the kind rules in [CAPTURE-KINDS.md](CAPTURE-KINDS.md).

## Why it has no words

The kind rules need a bank's wording written into code, so a new bank, a rewording or another language is a code
change. The reader holds no bank word and one worded cue, `ending`, inherited from the old reader (`ending 1234` names a card).
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

Nothing reads these modules yet; a later change wires them into the Worker.
