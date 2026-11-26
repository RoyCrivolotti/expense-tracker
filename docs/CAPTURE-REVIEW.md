# Reviewing captured payments

For a contributor changing the Dashboard card that turns recommendations into expenses. It covers what the card shows
for each payment, when one tap may add it, and the typed row a payment may duplicate. The capture key, the routes and
what is stored are in [CAPTURE.md](CAPTURE.md).

## The card

The Dashboard opens with a "To review" card: the newest three open recommendations, each with
all seven fields it would become (type, amount, description, category, account, date, budget month). It is absent when
nothing is waiting, and the Dashboard tab carries the count (the Settings badge still means pending access requests).
"See all" opens the rest in a sheet. The card and the sheet are one lazy chunk with its own line in the bundle budget; the
list, the count and the undo window live in the main bundle, so the badge needs no download. The list is read when the app opens (and kept current, below),
for every approved person; for someone who never made a key it comes back empty and the card's chunk is never fetched.

What each payment becomes is worked out on the device, never stored ([`reviewFields.ts`](../src/ui/capture/reviewFields.ts)).
It takes the list's `suggestion` (below, "What the list suggests") first: its description, category, type, account and
amount. When the suggestion names no description, description and category come from the typed rows the app holds
([`review.ts`](../src/domain/capture/review.ts)): the person's most common ones for the merchant (digit words dropped,
case and accents folded) over their last 12 months, else the newest row, ties to the more recent. Either way one tap
needs the description given at least twice and strictly more than any other, else "Description not settled". Budget
month, edge days and whether a category or account is still in use are always worked out here.

| | |
| --- | --- |
| **One tap Add** | Only when nothing is in doubt. It sends the transaction shown, exactly |
| **Review** | Everything else. It opens the normal add form, filled with only what the push said. With "Add and next (N left)" each save opens the next payment, and the form's "Don't add" moves on without creating anything |
| **Don't add** | Removes only that suggestion and creates nothing. Three in a row on one wording never added stop it being suggested ([CAPTURE.md](CAPTURE.md), "What it learns") |
| **Link** | Offered when the server names a typed row that looks the same (`possibleMatch`). It points the recommendation at that row and creates nothing |

A payment is reviewed rather than added by one tap when: no merchant text, no amount or an amount of zero, a category not
in use or never typed for this merchant, a card not mapped to an account (a card is mapped by answering the question below, once), a currency other than euros (the push's own marker sets it, so a `$18.20` push arrives in dollars and shows "Not in euros"; the amount is not copied into the euro form),
no suggested type or an investment (the user's own money moved), a merchant typed fewer than twice, a typed row that
looks the same, a budget month that could differ, a push wording the person has never added ("New push wording"), or an
amount the wording taught the app to read differently ("Amount re-read").

That last test is one rule: the budget month (the add form's own rule, so the user's rollover day and a settled statement
count) is worked out for the payment's day and for every day the bank might book it on, which are the day before or after
when the payment is within an hour of midnight, and the day its push reached the server. If any of those gives another
budget month the payment is reviewed, and the add form shows a note under the date with both days and a button to move
between them. The payment's time of day is the phone's own, read from `occurredAt` (the endpoint in [CAPTURE-WORKER.md](CAPTURE-WORKER.md)), so
the device's zone does not matter; a row without it counts as next to an edge on the days either side of midnight.

A payment dated by its bank's words (its `localDate` is another day than `occurredAt`'s) shows that day on the row:
"Charges Tue 24 Nov" for a charge the bank announced ahead of time ("Arrives Fri 4 Dec" for money coming in), "Fri 20
Nov, from the message" for one it reported late. No day either side of it is in question, so it raises no budget month edge. The add form opens on that day with a
note saying the date came from the bank's message and when the push arrived, and a button that moves the date to the
arrival day.

A notification tapped on the phone opens the app at `/?review=<id>` and the card opens that payment's form as Review would ([PUSH.md](PUSH.md)). One tap, "Don't add" and Link are held for five seconds, and nothing is sent until then. Undo covers the last one only:
a new decision sends the held one at once, and so does the app going out of sight. A send that fails puts the payment
back with the reason. The add form saves at once, since it needs the new row's id for receipts, so it has no undo.

A payment from a card with no linked account opens with the Account field empty ("Pick an account") and a question under
the date: which account is the card ending in those digits, with "Remember this card" on. Saving is refused until it is
answered, with the message beside the question. The card is remembered after the payment is saved, against the account
the payment was saved with, so if the person changes the form's Account after answering, the card follows the final
account.

Without write access (the offline saved copy, a read-only source) the card shows the rows with no buttons. The phone's
own merchant history reads the rows the app holds, which in the paged ledger mode are the months in view, so without a
suggestion a merchant typed only earlier counts as new.

## Keeping the list current

The list is read by its own hook, apart from the expense dataset, so the dataset's refresh does not reach it. Three
things read it again, all through `reloadRecommendations()` in [`recommendationsApi.ts`](../src/data/recommendationsApi.ts),
the one call anything around the app (a native shell, say) makes to bring the list up to date:

- **The person refreshes**: the header button and pull-to-refresh read the dataset and the list together.
- **The app returns to the foreground**: `visibilitychange` to visible, or `pageshow` for a restored page
  ([`useReloadOnReturn.ts`](../src/ui/capture/useReloadOnReturn.ts)). A return within 30 seconds of the last read is
  ignored, so a quick switch between apps reads once.
- **A push arrives while the app is open**: the service worker posts `{ type: "review-changed" }` to open windows
  ([PUSH.md](PUSH.md)). There is no polling timer.

While the add form or the queue sheet is open the read waits (`holdRecommendationReloads`) and happens once when the
last of them closes, so a row is never pulled from under the person. A read that fails for one of these reasons keeps
the rows on screen and shows nothing; Retry shows its failure. A read that was on its way when a payment was decided never
brings that payment back, since the server may have answered it before it saw the decision.

## One payment, several pushes

A recommendation can have several pushes behind it: a card payment and the balance alert of the same amount, or a
purchase and an offer to split it, join one recommendation at receipt ([CAPTURE.md](CAPTURE.md), "One movement, one
recommendation"). The card shows it once. Everything about it comes from the push that made it: the slots and template
the suggestion reads, the card it names (a balance alert that joined it may show account digits, which do not count),
and the template a decision teaches. A later push only gives the description, when it shows the merchant and the first
push could only give its whole text. Every push behind it is blanked and gets the decision's outcome, and the
diagnostics count the later ones as "Same payment as another", not as suggestions.

## What the list suggests

Each recommendation in `GET /api/recommendations` carries a `suggestion`: what the person's own decisions on earlier
pushes say it should become ([`suggestion.ts`](../src/domain/capture/suggestion.ts)). It is worked out on every list read
and never stored, so it always follows the latest decision, and the recommendation's own amount and type stay as the
push was first read. A recommendation no push made has `suggestion: null`, and the single read leaves it out.

- **Description and category**: the description the person added this merchant with most often at any price, unless
  the votes at this payment's price are settled, or name something other than the settled winner at any price (one
  merchant name can stand for several fixed prices, such as two subscriptions). With no votes at any price, the price's. Spellings that differ only in case and accents count together, the label is the latest spelling,
  and a tie goes to the more recently used. With no votes there is none, and the card falls back to the phone's own
  history and then the bank's text. `sightings` is the votes counted and `settled` says the winner has at least two and
  strictly more than any other, the same rule the phone's history uses.
- **Amount**: the number the template learned to read, when the push has a number with a currency marker at that place,
  else the first reading. When the two differ the reasons say `amount-relearned`.
- **Type**: the template's, else the first guess. **Account**: the card's link, else the template's.
- **Reasons**: `new-shape` when the person has never accepted a push of this wording (or it has no template), so one tap
  never adds a wording before the person has added one by hand.

Two reads serve a whole page, together: the pushes with their templates, and the merchants of the page by key. Both run
before the duplicate check below, which then looks for the amount and direction the person will see.

## A payment that looks like a monthly charge

The card compares each waiting payment with the monthly series the recurring card reminds about
([`seriesMatch.ts`](../src/domain/capture/seriesMatch.ts)): the same series, read the same way (the whole history's when
the model holds only some rows, none at all while that history is still on its way), less the ones stopped there. A
payment fits a series when it moves money the same way, its amount equals the series' latest charge to the cent, and it
falls within five days of a usual day whose charge is not logged yet. Nothing is stored: the match is worked out on
every read ([`reviewSeries.ts`](../src/ui/capture/reviewSeries.ts)).

| Match | The row says | The fields |
| --- | --- | --- |
| One series | "Looks like your monthly X, due D", and "paid from Y" when the push named no account | Description, category and type from the series; the account too when the push named none and showed no card to ask about |
| Two or more | "Looks like one of your monthly payments. Which one?", each a button | Unchanged, and no one-tap Add even when the votes are settled. A button closes the list and opens review filled from that series; none is picked for the person. The add form asks the same question, so a payment reached with "Add and next" or Review still offers both |
| One, on another account | "Looks like X, which you pay from Y. Moved it?" | From the series, keeping the push's account |
| One, but the votes name it differently | "...You added it as V before. Renamed?" | From the series, with its current name |

A filled payment always goes through review, so the first time a bank text is matched it is never added by one tap. Its "New merchant" reason is dropped, since the hint already says what the payment is.
When the person's own settled name for the merchant already is the series' name, the row still says which series it
looks like, but the fields stay as their history has them and one tap follows the usual rule.

The recurring card reads the same hints the other way round: a charge a waiting payment stands for says "Captured from
your bank, review", and its "+" opens that payment's review instead of a new row
([BEHAVIOR.md](BEHAVIOR.md#recurring-suggestions-upcoming-card)).

## The typed row a payment may duplicate

A person often types a payment at the till, and the push arrives minutes later. Each recommendation in the list carries
`possibleMatch: { transactionId, description, date, amountCents, type, accountId }`, or null: a row the person already
typed that looks like the same payment, with enough of it to show the row in full (the amount is as stored). The list never blocks anything, since a wrong match costs one tap: the payment goes to Review, where Link points it at
that row. Submit looks again, because a row can be typed between the list read and the press: it checks the row being
submitted (its date, amount and type, so a payment the person changed is judged as changed) with the same rule and window,
and answers 409 `possible-duplicate` with the match when one exists, creating nothing. Sending `allowDuplicate: true`
skips the check. A row typed between that one read and the insert is not caught, which is a deliberate advisory race.
The add form shows the list's match, with Link and Add anyway, as soon as it opens, so a payment reached through Add and
next is told too; its Add then sends `allowDuplicate: true`, since the person has seen the row.
The rule is [`possibleMatchFor`](../src/domain/capture/duplicate.ts), with its window in one constant,
`DUPLICATE_WINDOW`, shared by both reads:

- the same person's row, never another person's;
- the same direction: an expense and an investment put in are money out, income and a refund and an investment taken
  back out are money in, and a payment with no suggested type has no direction and matches nothing;
- the same amount to the cent, in euros (a payment in another currency or with no amount matches nothing);
- a date from 14 days before the payment's local date to 3 days after it. Back 14, because with no limit a regular price
  (the 12,50 cafe) would match an old row every time and never allow one tap; forward 3, because a row may be dated by the
  day the bank books it. An announced bill (below) also reaches the row that answers for its charge up to seven days
  after it;
- not a cancelled row, and not a row some recommendation already answers for (linked by hand, or made by submitting one),
  so a payment that was captured and added does not match the next push of the same price. The one exception is a bill
  a bank announces and then reports. A recommendation whose words named a later day than its push arrived on
  (`isAnnounced`, from `localDate` and the phone's day in `occurredAt`) has not moved money yet. A row that answers for
  it is offered to a push that reports a movement, and the other way round, when the announcement arrived first and the
  report is dated on the day it named or up to seven days later (`ANNOUNCED_CHARGE_DAYS`), whichever of the two was
  added first. Two reports of one price, two announcements, an announcement after a report, and a payment before the
  named day stay two payments. Linking moves the row to the new recommendation in one batch: the other one stays
  submitted and stops answering for it. The row keeps its own date;
- the closest by date, and the highest id (entered last) on a tie. A row goes to one payment of the page only, the
  one it is closest to (the newer payment first on a tie), and a payment that loses its row falls to its next best or to
  none, so two payments of one price never offer the same row.

The candidates of a whole page come from one query, over the date span of the page widened by the window and only the
prices on the page, using the existing index on owner and date. The cost is the rows of that span, once per list call,
whatever the page size. Each candidate looks up the recommendation that answers for it through the unique index on
owner and transaction, which reads a row only when there is one. The check at submit is the same statement for one
amount and one date, so it reads at most the rows of one 18-day window (22 days for an announced bill) and needs no new
index.
