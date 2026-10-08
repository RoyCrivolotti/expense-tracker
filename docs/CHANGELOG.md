# Changelog (product-facing)

High-signal UX and reliability changes on `main`. Internal refactors omitted unless they affect behavior.

## October 2026 (months ahead or behind, along the plan)

- **"Months ahead" is now the distance along the plan's line.** It used to divide the gap in money by what the plan invests each month. That left out what the portfolio earns by itself, so a gap read as more months than the chart shows (10.000 € ahead on 1.400 € a month said 7 months, where the plan's line gets there in 5), and it jumped on the day the monthly amount changed. The figure is now the months between the check-in and the point on the plan's line that has your balance, and the Progress snapshot says when that is: "12 months ahead of the plan, which only reaches this balance on 1 Oct 2027".
- **A pause no longer takes it away.** With a month of nothing there was no monthly amount to divide by, so no months were shown and the dashboard badge said "On track" however far ahead you were. The line keeps rising with the return during a pause, so it has a distance.
- **When the plan's line never has your balance there are no months, and the gap in money is said instead.** That is a balance above where the plan ends or below where it started, as after taking a house deposit out earlier than planned. The dashboard badge then reads "5k € behind" rather than a month count that was never measured.

## October 2026 (values on the chart)

Checked in Chromium and in Safari's engine, at 1280x800 and wider.

- **Each line's value is on the chart, beside its dot.** At the year you point at, a solid chip in the line's colour sits level with the dot, so the amounts can be read and compared without looking up at the scenario chips. Where the right has no room (the last years) the chips move to the left of the dots. Chips that would overlap are moved together, in the order of the lines, centred on where the lines are.
- **Lines that read the same figure share one chip**, with a dot of each colour, so a scenario and its copy take one place and not two.
- **The shaded band's over and under values are on the chart too**, in dashed chips above and below, each with the return it stands for (for example "4,0% · 1,38M €"). They belong to the open scenario, since the band is the line being edited.
- **Millions are written to two decimals** on the chart's chips and the line under it (2,26M €, not 2,3M €). Thousands stay whole, and the axes and tooltips keep one decimal.
- **The scenario chips above the chart show the whole amount**, to the euro (2.241.873 €), since the rounded one is now on the chart. The phone is unchanged.

## October 2026 (scenario chips)

Checked in Chromium and in Safari's engine, at 1280x800 and wider, and on an iPad.

- **One set of chips above the chart replaces the scenario tabs and the chart's legend.** Each chip has the scenario's colour, its whole name (on two lines where it needs them), its value in the year you point at (the last year when you are not pointing), and an eye to hide its line. All chips are one width and wrap to more rows, so a long name never cuts another chip or overlaps it. Plan and Edited sit inside the open chip, under its value, so the name keeps its width. The line under the chart keeps the year and the plan-from-today key.
- **The purchase breakdown has a place under the chart.** It floated over the bottom of the chart and hid the axis labels and part of the lines. It now takes the place of the note about the dashed lines while you point at a purchase year, in room that is kept whenever a line has a purchase, so nothing is covered and nothing moves. The chart is 316px tall on a wide screen, down from 330, to make room for the taller open chip.
- **Duplicate, the options menu and Save / Discard are in the title row**, beside the Plan | Progress | Assumptions switch, so editing a scenario no longer changes what is above the chart.

## October 2026 (the projection, full screen)

Checked in Chromium and in Safari's engine, upright at 375x812 and on its side at 812x375.

- **The Invested portfolio projection opens full screen on a phone.** A button at the end of the card's title opens the chart over the whole screen, turned a quarter turn when the phone is held upright (with a line that says to turn it to the left), as the milestone sheet is. Thirty years get about 17px each across instead of about 8, and the plot is taller.
- **A rail beside the chart reads the year.** It lists every line's value in the year you touch, with the purchase breakdown under it, and tapping a scenario there still hides or shows its line. The year stays when you lift your finger, and a screen reader is told it once the year settles.
- **The readout can float over the chart.** A control in the rail takes the rail away, so the chart has the whole width, and the same readout becomes a card over it that you drag by its grip, or move with the arrow keys, anywhere inside the chart. It is always shown whole, with nothing to scroll: a corner makes the whole card larger or smaller, and in a year with a purchase its breakdown is a column beside the scenarios. It stays until its cross puts it back in the rail, and it never leaves the chart or covers the bar. The sheet always opens with the rail.
- **The bar has the window buttons and the Nominal / Purchasing power switch**, and the window buttons are the card's own, so closing the sheet leaves the card as you set it.

## October 2026 (Analytics, made clearer)

- **Cash starts counting at your first count.** Months from before you began counting are muted and never asked for, and the first count is the starting point that drift is measured from, instead of showing every month since the opening balance as new drift.
- **Each comparison chip names what it compares against**, for example "vs 2.840 € last month", so a percentage can be checked.
- **"Where the income went" counts the same days as the headline numbers** while the month is open.
- **The cards explain themselves.** Pace, allocation and baseline each have a closed "How is this calculated?" note, and a new closed "Detected fixed costs" card lists every pattern and instalment plan counted as fixed, with the ones taken out of this month's pace budget marked.
- **The spending baseline says what it is**: a trailing average over the history there is (up to 12 months), not a calendar year, to set against Goals' Annual spend at FI.
- **Merchant is now Description**, since the app has no merchant, only the transaction's text. A By amount / By items sort works for every grouping.

## October 2026 (renaming transactions in bulk)

**Edit selected can now set the description on every chosen transaction.** Search for the old name in
Transactions, select the rows and tick Description; the sheet lists the descriptions it is about to
replace, and picking an existing one reuses its spelling. Rows that end up with the same description
count as one recurring pattern in Analytics, so this is how "NETFLIX.COM" and "Netflix 0912" become a
single line. The confirmation names the new description ("Renamed 14 transactions to Netflix").

## October 2026 (Goals: monthly investing that changes)

- **A scenario can change what it invests each month, from a date.** "From March 2028, 2,500 a
  month", or a pause, added under "Monthly investing changes" on the Goals plan. Before the first
  change the scenario is exactly as it was, so nothing you have saved moves. After one, the line,
  the milestone dates, the comparison table and the "What this means" sentence follow it.
- **The figures that compare you with the plan follow it too.** Months ahead or behind, the pace
  sentence, the dashboard headline and the investing-against-plan chart now read the amount the
  plan was investing at the time, not the amount it started with. This also corrects plans that
  grow their monthly amount each year, which were being measured against their first year.
- **A re-baseline carries the changes.** It restarts from the amount in force at the check-in and
  keeps only the changes still to come, on their own months.

## October 2026 (the Analytics redesign)

Analytics was the workbook, ported: four wide tables and three small charts that reported numbers
and stopped. It is now three views — **Overview**, **Spending**, **Cash** — identical on phone and
desktop, each built to answer a question and lead somewhere.

- **Two correctness bugs fixed first.** Dashboard and Analytics disagreed on net saving whenever a
  card statement was unpaid (they counted charges on different bases); both now default to the
  committed basis, with a visible committed/paid toggle and the basis named next to it. And the
  desktop "YTD" column summed every month in the data, so it would have been wrong from the first
  January with two years of data; it is now the calendar year through the selected month, and says
  which year.
- **Overview: how am I doing?** Five tiles (income, spent, net saved, savings rate, invested), each
  with a sparkline and a change chip naming its baseline — last month, your 3-month average, or last
  year. A trend chart with the unpaid share of each month hatched; clicking a month moves the page
  there. Flexible-spending pace against what the budget implies, with fixed costs counted but kept
  out of the clock. Up to three signals computed from your numbers, each opening the place to act.
  Where the income went, what changed, and the spending baseline. An open month is only ever
  compared with the same days of other months.
- **Spending: where does it go?** Ranked rows grouped by category, fixed vs flexible (detected from
  instalment plans and recurring patterns, not tagged by hand), label (your trips) or merchant.
  Category rows carry a budget bullet with a "where should I be today" tick; every row opens its
  story — typical month, worst month, months over (against today's budget, and saying so), the
  month's biggest transactions — and a deep link that lands on Transactions with the filters set.
  The exact workbook grid stays one tap away as the Grid mode, now with CSV export.
- **Cash: do my numbers match?** One dot per month (counted, drift found, ready, waiting on its
  statement) and a banner pointing at the month ready to count. A bridge from opening cash to
  expected cash with the count entered right under it, drift bars with a ±5 € tolerance band, and
  balances labelled as cost — the "net worth" column is gone; market value lives in Goals. The
  full table sits in a fold for audit.
- **The baseline feeds Goals.** "Use in Goals" opens the scenario editor with your measured spend
  prefilled as an unsaved draft; saving stays yours.
- **Removed:** the pie (ranked rows beat it at comparison), the two-line YTD chart (the gap between
  the lines was the information), the duplicate month picker on the phone, and the Monthly totals
  table as a section (it lives behind the trend's Table toggle).
- **The open month is counted from its own first day.** With a rollover day, a budget month starts
  on that day of the month before, but the like-for-like cut used the day of the calendar month, so
  on a day-13 rollover the open month's first weeks were left out of the numbers until it closed.
  Spent, pace, movers and the Spending rows now cut every month at the same number of days since it
  began.
- **Year to date and the last 12 months are compared with the same months a year earlier**, with
  the open month and its counterpart cut at the same days. The baseline used to shift back by the
  window's own length, which overlapped the window across a gap in the data and read as a drop
  whenever the month was half over.
- **The pace clock measures the categories that have a budget.** Spend in a category with no
  budget no longer turns the meter red against an envelope it was never part of.
- **Cash names one month ready to count**, in the banner and the Overview signal alike, and a
  month that has not ended shows as such instead of "ready".
- **Use in Goals says what it did**, with a toast naming the annual spend it set and that it is
  unsaved.

## October 2026 (typed numbers in Assumptions)

- **A milestone amount is read by the currency's format.** The field was a number field, which reads the browser's idea of a number and not the currency's: typing "150.000" for a hundred and fifty thousand euros saved 150. It is now a text field with the decimal keypad, written as the currency writes it ("150.000,00") and read as the rest of the app reads an amount, so "150.000" is 150 000 where the point groups thousands, "150,000" is where the comma does, and "2500,5" in a point currency is 2 500,50. Text with no digit in it puts the saved amount back, as before. The stepper arrows that moved it by 1 000 are gone.
- **The cash reserve is whole months.** "1e1", which a number field lets through, was saved as 10 months. It now takes digits (and "6.0" or "6,0"), and anything else puts the saved value back.

## October 2026 (years to milestone on a phone)

Measured on phones 320, 375 and 430px wide, with 1, 3 and 12 milestones, in Chromium and in Safari's engine.

- **The table shows as many milestone columns as the screen holds, and the rest are a page away.** Seven columns in 325px left each one about 30px wide, so the heads and the figures ran into each other. A page now holds 3 columns at 320px, 4 at 375px and 4 to 5 at 430px, none narrower than 46px, and chips above the table ("150k-400k", "500k-1,5M") turn the page. The milestones are split as evenly as they can be, so no page is left with one column, and a tablet or a phone on its side that can hold them all shows one page with no chips.
- **A path's whole name is shown, on as many lines as it takes.** It was cut after two lines at 60px wide ("Investm ent-focus..."). The names now take 38% of the table, and the plan's "plan" tag is back next to its name.
- **Milestones every path already has are one line of text, not a column of ticks.** "Already there on every path: 100k, 200k (by May '26)". A milestone that only some paths have stays a column. If every milestone is there already, nothing is folded.
- **A second way to read the table, "By goal".** Pick a milestone (the chips scroll, with Previous and Next buttons) and the paths are listed under it, soonest first, each with its whole name, the years or the calendar year, a bar for how far away it is and, with "vs plan" on, how much sooner or later than the plan. The wide page is as it was.
- **A sheet with every milestone, from an "All milestones" button.** Where the card is paged, the button opens the whole table over the screen: every milestone is a column (the ones the card folds too, with the currency sign), the names and the heads are held while the figures scroll, and years or calendar year and "vs plan" are the card's own, so it keeps them when the sheet closes. On a phone on its side the bar is one row. Escape and the close button leave it, with the focus back on the button.
- **Held upright, the sheet is drawn on its side.** A page cannot turn a locked phone (Safari on iPhone has no `screen.orientation.lock`, and elsewhere it only works in full screen), so on a touch phone under 600px wide held upright the sheet takes a quarter turn and says "Turn your phone to the left to read this." Turn the phone and it straightens; with the phone's rotation unlocked it does that by itself. Scrolling, taps, the pinned names and heads, and the notch and home indicator (which swap sides with the turn) work as they do on its side; checked on an iPhone 17 in the iOS simulator. A mouse in a narrow window, or a tablet, gets the sheet as it is.

## October 2026 (stars and the controls beside them)

Measured by pressing a grid of points inside every control on the Plan page with the inputs panel open, on touch screens 1032x1376, 1133x744 and 1366x1024 and with a mouse, in Chromium and in Safari's engine.

- **A press on a control next to a star is the control's.** The star's tap area is taller and wider than the star so a finger can find it, and it reached over its neighbours. On an iPad 1032px wide, a press on the right part of the Contribution growth + button starred the next column's input instead of adding to the percentage (20 of 45 points over the button), and the ends of three sliders, the left edge of the House price, Purchase fees, Rent and Annual spend fields, and the plan start date and Re-baseline buttons did the same. At 1032x1376 that was 62 of the points sampled, over 11 controls; with a mouse it was 5, over one slider. The star's area now sits under every input and label it reaches over, so it is only what nothing else has taken, and no control loses a point to a star in either state of the bar.
- **The star's area in the inputs panel is the 24px gutter it hangs in, 44px high, on a touch screen**, where it was 46 wide (35 wide for the first column's star, which has the card's padding beside it). The star itself and everything around it are as they were, and the bar's stars keep their full area.
- **A percentage stepper is 8px narrower on a touch screen, with 4px less between it and its label.** In the narrowest columns (an iPad 1032px wide) its + button reached 9px past its column and under the next column's star, which a taller area could not fix. The field between - and + is 40px wide, not 48.
- **Where the bar's levers wrap onto two rows**, a slider stays above the star of the lever below it.
- **A percentage's + button no longer hangs over the next column in a wider font.** In a font a little wider than a Mac's (CI's Linux fonts, or Windows and Android) the label of Contribution growth and House appreciation could not be narrower than its longest word, so the row came out 2px wider than its four-column panel and the + button covered 2px of the next column's star. The label may now shrink (breaking a word as a last resort) and the gap is smaller. With the usual fonts the rows are exactly as they were.

## October 2026 (years to milestone, counted from today)

- **Every row counts its years from today.** A path's years used to count from its own start date, so a scenario that started two years ago said "7y" for a milestone that is five years away, and the "from today" row counted from your latest check-in. Each cell is now the whole years from today until the path reaches the milestone, rounded up, so "Years from now" means what it says. A path that started less than a year ago shows the same numbers as before. A milestone a path passed before today is a tick, and its sentence says so ("reached it before today, in 2025"). "Calendar year" is unchanged. The hint under the title says how the years are counted.
- **"vs plan" works on every row.** It skipped any path whose scenario started on another day than the plan, which on real data is every one, so the rows grew taller and the line under each cell stayed empty. It now shows how many years sooner or later than the plan each path gets there, for every path including the plan from today, as the difference of the two cells on screen. The plan's own row and rows with nothing to compare no longer reserve a blank line.
- **The milestone columns are the same width.** One long name, such as "3rd goal (phase 1)", made its column and its tinted boxes about twice as wide as the others. On the wide page every column is now the same width: a long name wraps to two lines and then ends in an ellipsis (the full name is in its tooltip), and the table scrolls inside its card when there are too many columns to fit. The phone layout is unchanged.
- **The timeline starts at "now".** The axis counted from the plan's start year; it now starts today, every path's line starts at "now", and each dot is where the table's cell for it says, with the calendar year still underneath.

## October 2026 (Save says why it is off when you press it)

- **Pressing a Save that needs a name says why.** With a scenario's name cleared, the Save buttons (Save changes in the scenario row and in the phone's pinned row and card, Save scenario for a draft, and every Save as new) still look off, but a tap, a click, Enter or Space on one now shows "Give the scenario a name to save it" at the bottom of the screen, and a mouse pointing at it gets the same words as a tooltip. A screen reader reads them as the button's description. Before, the button was disabled, which a finger and a mouse cannot press, so all it could do was sit there.
- **No line of text for it.** The words that sat beside the button on the wide page and under the buttons on the phone are gone, so nothing in the page moves or changes size when a name is cleared; the pinned chart, chips and Save row keep their height. A Save that is off because a save is under way stays plainly disabled, with nothing to say.

## October 2026 (years to milestone as a timeline)

- **The card has a Timeline view beside the Table, on the wide page.** A switch in the card's header (from 900px wide; the phone keeps the table alone) shows each path as a row on one axis of years, with the calendar year underneath. Every milestone is a dot at the year the path reaches it, and milestones that fall in the same year share one dot with their number.
- **Badges for what is already there and what is out of reach.** Milestones a path already has, or that a check-in reached, are one badge at the left edge ("✓ 3"); the ones not within the path's horizon are one badge past the end of the line ("→ 2"). A path with a shorter horizon than the longest ends in hatching, the path you are editing is dashed, and the plan from today sits under the plan and lands on its own calendar years.
- **Follow one milestone.** Pressing a milestone's chip dims the other dots, writes the year on each path's dot for it and joins those dots with a dashed line, so you can see which path gets there first.
- **The same sentences.** Pointing at, focusing or tapping a dot or badge writes the same kind of plain sentence under the timeline as the table does, and every dot and badge is a button with that sentence as its name. Tab goes through them path by path, and Enter or Space reads one out.

## October 2026 (the years to milestone table)

- **The table is neutral, with a tint for distance.** The cells were fixed pastel colours, from green to red, that glared in the dark theme. A cell is now plain text on a tint of the theme's accent that deepens with the years (the darkest is the longest horizon among the rows), "already there" is a tick, and "not within the horizon" is a hatched box with the horizon and a plus. A line under the table says what each means. The text is always the normal colour, so it reads in both themes and in forced colours, where the tint goes and the numbers stay.
- **Pointing at a cell says it in a sentence.** Pointing at, focusing or tapping a cell marks its row and column and writes one sentence under the table, such as "Path B reaches 750k in 6 years, by 2032. Your check-ins reached it by May '26." Every cell carries the same sentence for a screen reader. The arrow keys, Home and End move between cells, and the grid is one Tab stop.
- **Years from now or calendar year.** A switch above the table shows each cell as the year the path gets there instead of the years it takes. The hint under the title now says that a year here is the yearly step at which a path first reaches the amount, so it can be up to a year later than the date on the Progress tab.
- **"vs plan" shows who is ahead.** The button puts, under each cell, how many years sooner (green, with a minus) or later (with a plus) than the plan the path gets there, "=" when level, and "sooner" or "later" where one of the two never gets there. The plan and the plan from today have no figure, and neither does a path that starts on another day than the plan, whose years are counted from somewhere else. With no scenario marked as the current plan the button is off and says why.
- **On the phone the seven milestones fit 375px.** Amounts lose the currency sign in the column heads, the check-in dates take two lines and the columns lose their padding. At 320px the table scrolls in its own box with the names held.

## October 2026 (messages on the wide Goals page)

- **"Removed Real return from the bar", with its Undo, now shows at the bottom left, in the side rail.** It was centred over the levers bar. At 1200x800 and 1280x800, where the bar is held to the bottom edge, it covered the legend chips for six seconds, and the legend is what shows the lines' values after you take an input out. On a taller screen (1440x1024, or a 12.9-inch iPad on its side), where the bar is in the page and not at the edge, it covered the bottom of the bar and some of its controls. The rail is empty between its links and its menu button and the page never goes under it, so nothing is covered at any of the sizes measured. The same goes for the other messages on this page ("Saved Path A", a failed save).
- **Where there is no room for it the message stays where it was.** Under 1024px wide the rail is icons only, so the message is centred as before; the phone has no stars and keeps its message above the bottom bar (11px clear of it, as before).

## October 2026 (typing in the levers bar on a laptop screen)

Measured at 1200x800, 1280x800 and 1440x800, where the bar is held to the bottom edge, in Chromium and in Safari's engine.

- **Clicking beside a figure no longer scrolls the page.** A click on the unit next to a lever's number (the euro sign, "yrs", the percent sign) made Chrome scroll the page 309px, though the bar was on screen, and the top of the chart went out of sight. The click now puts the cursor in the field and leaves the page where it is, as a click on the digits always did.
- **The bar stays one row while you type.** With the net worth at 15 characters (5.675.259.434 € after typing 5000000 a month) the result's column widened, the fifth lever wrapped to a second row at 1200px, and the bar grew from 99px to 178px, up over the chart's axis and legend by 60px. The levers now share the room that is left, and a figure that is wider than its column is cut off with an ellipsis. Nothing changes at the figures a plan has now (8.179.020 € is 160px, as before).
- **Removing a lever with the keyboard no longer jumps the page in Safari.** Focus moves to the next star in the bar, and Safari scrolled 249px to reveal it.

## October 2026 (what the touch round left, and Undo from the keyboard)

- **A star is tapped from 44px.** The tap area round a star in the inputs panel and in the bar was 46px by 34px, so a thumb a little above or below it missed. It is 44px high now with nothing moved: in the panel it is the height of the star's own row, and in the bar it goes up, since below the star is the figure it belongs to and a tap on that must not take the lever out of the bar.
- **The plan start date is 44px tall on a touch screen.** It was 40.8px, the one field in the inputs panel under a finger's size. The text stays in the middle of it.
- **Alt+Z takes a removed star back from the keyboard.** The Undo button in the toast is the last stop in Tab order, so someone who removed a star with the keyboard could only reach it after tabbing through the whole page. While the toast is up, Alt+Z puts the input back where it was, from wherever focus is and without moving it; the toast says so, in words for a screen reader and as a small key beside Undo for a mouse (a touch screen, with no key to press, shows only Undo).

## October 2026 (why Save is off, on the phone)

- **The phone says why Save is off.** With a scenario's name cleared, Save was greyed out and the reason ("Give the scenario a name to save it") was only a tooltip, which a finger never sees; a new draft's Save scenario had no reason at all. The words now sit on a line under the buttons, in the pinned Save and Discard row and in the scenario card, and go when a name is typed. The pinned chart and chips above do not move for it. The card's Save changes is also off for an empty name now, like the other two, instead of sending the edit to be refused.

## October 2026 (a first draft is not lost without a word)

- **Leaving Goals with an edited first draft asks first.** With no saved scenario, or after the one on screen was deleted, you could change every input and leave Goals or reload with no question, and the edits were gone. The question was only asked when there was a saved scenario to compare the edits with. A draft with nothing behind it is now compared with how it started: change an input and leaving asks ("The unsaved draft will be lost if you leave"), put it back by hand and it does not.

## October 2026 (a typed comma in a dollar format)

- **A comma typed into an amount or a percentage is the decimal mark in a point format too.** With US dollars (1,234.56), typing 12,5 into Monthly investing made $125 and 1,5 made $15, and a percentage typed as 5,5 read as 0%. The mirror of the typed point in a comma format applies: a single comma with one or two digits after it, and no point, is the decimal mark, so 12,5 is $12.50 and 5,5 is 5.5%. Three digits after it (1,500) are still a thousand and a half. This is in every amount and percentage field, and the file importers still read only a comma as the decimal mark.

## October 2026 (slow answers, a typed point and a lost connection, from a review of the wide page)

- **A point typed into an amount is a decimal point.** On a numeric keypad the point is the key there is, and with the default format (comma for decimals) typing 2500.75 into Monthly investing made 250.075 €, 12.5 made 125 € and 1.5 made 15 €. A single point with one or two digits after it, and no comma, now reads as the decimal mark: 2500.75 is 2.500,75 €. Three digits after it (1.500) and several points (1.234.567) are still thousands, and a point-decimal format such as US dollars is unchanged. This is in every amount field (transactions, budgets, settings, goals, check-ins). A typed percentage already read 5.5 as 5,5%.
- **The phone's Duplicate button makes one copy.** A double tap on a slow connection made two scenarios, and the phone opened whichever answered last over any edit made meanwhile. It now waits for the first copy like the wide screen's button does.
- **An answer that arrives late cannot undo a newer change.** After a slow reply to the inflation setting, the starred inputs could jump back to the old five on screen while the saved row was right; a slow Save landing after Use as my plan could leave nothing marked as the plan, and the reverse could bring back old values of a saved edit. A reply now changes only what its own write changed.
- **A star that was never sent no longer looks saved.** If the session went read-only while a star change was waiting behind another, the bar kept the unsaved list. It goes back to the saved one and says so.
- **Dropping edits brings back a hidden line.** Hide the saved line of the scenario you are editing from the legend, press Discard (or Save), and the legend listed it dimmed beside "(editing)", the same scenario twice. The hidden mark goes when the edits do.
- **Going offline in the middle of an edit says what the edit is worth.** The edit stays and keeps drawing on the chart, but nothing can be saved, so a note under the scenario tabs says that and that it is lost when you leave Goals or reload. The tab no longer says Edited, and the question asked before loading another scenario no longer says to save first.

## October 2026 (reading the lines on the Goals chart)

- **The pale scenario colours are drawn darker in the light theme.** Emerald, amber, cyan and lime were 2.2, 1.9, 2.1 and 1.7 to 1 against the chart card (3 to 1 is the floor for a line), so a path in one of them was thin and washed out. The colour you pick is kept; the line, its band and its key are drawn the same colour taken toward black just far enough to reach 3 to 1, and a colour that already has it (indigo, red, violet, pink) is not touched. The dark theme, where all eight already pass, is unchanged. This applies on the phone too.
- **The check-in dots are no longer amber.** They were the same amber as the third scenario's line, so a dot read as part of Path C. They are now the text colour.
- **The chart says what its dots and diamonds are.** The legend named the lines and nothing else. A line under it now names the check-in dots and the life events (money in, money out), each only when it is on the chart.

## October 2026 (nothing moves under the pointer on the wide Goals page)

- **The first edit no longer pushes the page down.** At 1280px the scenario row wrapped when Unsaved changes, Discard and Save appeared, and everything under it moved 40px. The row stays one line: the tabs give up width (names are cut, then the strip scrolls), and the Unsaved changes pill is drawn only from 1500px wide, since the tab already says Edited. A screen reader still reads it.
- **Pointing at a purchase year no longer grows the page.** The breakdown (start of year, return, down payment and so on) was added under the legend, which made the hero card 144px taller at 1440px and moved the cards and the bar below it. It now floats over the chart on the side away from the year you point at, and lets the pointer through. The phone keeps it under the legend.
- **The legend does not wrap when you point at the chart.** At 1200 to 1280px the chips fitted on one line until the values arrived, then wrapped to two and slid under the bar held at the bottom of the screen (26px under it at 1280x800). A chip now keeps room for its value, gives up some of its name before the row wraps, and shows the full name when you rest the pointer on it.

## October 2026 (the rest of the wide Goals page, for a finger)

Measured at 1032px with an iPad's touch emulation. Only a touch screen from 900px wide changes; a mouse and the phone layout keep their sizes.

- **The inputs panel is 44px a row.** The - and + buttons went from 26px to 44px square, and the fields (the amounts, the percentages, the years) from 26px to 44px tall. The panel is taller for it, 815px to 1001px with its columns across, and a star still sits on the first line of its label when the label wraps, which it was off by 5px on before.
- **A slider is 44px to press.** It was 17px tall and a touch anywhere in a slider's box moves it (checked in Safari on an iPad, a tap 17px above the track moved it), so the box is 44px while it takes 28px of the page. The thumb is the one the browser draws, about 23px wide on the iPad, and is not changed.
- **A lever's whole row of digits is 44px.** It was 30px. A bar of one row, from 1376px wide, is as tall as before; one that wraps to two rows (1032px) is 44px taller, 186px to 230px.
- **The chart's legend chips are tapped from 44px.** They stay 26px tall, so the chart does not move; the tap area reaches past them. Where the chips wrap onto a second line each has 34px, since the lines are 8px apart.
- **The scenario menu is for a finger.** Its rows went from 34px to 44px and the name field from 29px to 44px, and the colour dots from 20px to 28px with a 36 by 44px tap area. The menu is 40px wider (344px) to keep the nine dots in one row.
- **Life events, Save, Discard and Reset to defaults are 44px.** Add life event and Add were 24px, Cancel 28px, the remove cross 14px by 16px, Save, Discard and Reset 31px, and the help line under the page 34px.
- **Taking an input out of the bar says so, with Undo.** Pressing a star in the bar took the input out and the others moved up with nothing to say why, and on a touch screen the star's tooltip is not there. A message at the bottom, "Removed Real return from the bar", has an Undo that puts the input back in its place for six seconds. Where the bar is held to the bottom edge the message sits above it.
- **Save says why it is off.** With no name, Save changes (and Save scenario for a draft) showed the reason only as a tooltip, which touch never shows. It is written beside the button now. The phone's narrow row keeps the tooltip.

## October 2026 (leaving Goals with unsaved edits)

- **Leaving Goals with an unsaved edit asks first.** Typing 900 over Monthly investing, pressing Dashboard and coming back to Goals showed 500 again with nothing said. Pressing any other section, in the side rail or the phone's bottom bar, now asks "Leave without saving?" and says that your changes to the scenario (or to the unsaved draft) will be lost. Stay closes the question and leaves everything as it was, with focus back on the button you pressed (Escape does the same); Leave goes to the section you pressed. In a read-only session the question says the changes cannot be saved instead of suggesting a save.
- **It does not ask when nothing would be lost.** Pressing the section you are already in, moving between Plan, Progress and Assumptions (which keep the edit), and leaving while a save is on its way do not ask. Switching to another scenario tab asks the same question as before.
- **Reloading or closing the tab with an unsaved edit gets the browser's own warning.** That also covers Back and the Navigate menu's links to other apps, which leave the page and cannot show this one's question. It is only there while an edit is unsaved.

## October 2026 (headline figures on the wide Goals page, from a review of it)

- **The FI year counts the invested portfolio, as the milestones do.** It used the net worth, house included, so a plan with a house said "Financial independence: year 0" beside a 1,0M milestone, the same amount as the FI target, ten years off. A withdrawal rate draws on what can be sold and spent, which a house is not, so the FI year and the drawdown chart's starting balance now use the portfolio.
- **The bar shows the invested part of the net worth when there is a house.** A plan with a house read 9,0M in the bar and 4,4M at the end of its line, with nothing to say why. The bar adds a line, "4.388.000 € invested", when the two differ at the horizon.
- **Purchase year 0 is called "Already own".** "Now" read like a purchase still to be paid for, but year 0 takes nothing out of the portfolio and counts the house from the start. The bar, the panel, its hint and the comparison table say "Already own", and a purchase year past the horizon says "past horizon", since the chart never reaches it.

## October 2026 (labels and numbers on the Goals charts, from a review of the wide page)

- **"Years to milestone" says how far it looked.** A milestone not reached was always "40+", though the search stops at the scenario's own horizon: on a 30 year plan a milestone reached in year 32 read "40+", and with the horizon at 45 the same cell read "32y". It now says "30+" or "12+", the horizon it was looked for over.
- **A copy and its original are two names in the tables.** Both tables cut a name at its colon, so "Path A: Invest only" and its copy were two rows both called Path A, told apart only by a swatch. A row keeps its full name when another scenario would be given the same short one.
- **The composition chart's house is its value, not its equity.** The legend and tooltip said "House equity 4,0M" and "Mortgage owed 3,2M" for a house with 0,8M of equity, and the hint took the mortgage off twice if read as written. The tooltip also uses the legend's names now.
- **No FI drawdown where FI is never reached.** The card said "not reached in horizon" and still drew a balance climbing from the target, 1,0M to 3,9M for a plan worth 907k at year 30. It now says so and draws nothing.
- **Compact amounts use your decimal mark.** The axes, the legend and the tables wrote "8.2M" beside "8.179.020 €" and "4,0%", where a point means thousands; it is "8,2M" with the default format. 999,600 printed as "1000k" and is now "1,0M".
- **The purchase breakdown says when it is in today's money.** In the Nominal view the legend above it shows inflated values and the breakdown does not ("Path C 703k" over "End invested 637k"), so it says so.

## October 2026 (editing scenarios, from a review of the wide page)

- **A scenario saved elsewhere is no longer written back over.** After a refresh that brought back a scenario another device had re-baselined, the editor went on with its older copy: the tab showed Edited with no edit made, the bar showed the old start balance, and Save wrote the whole copy back over the new values. The editor now puts your own edits on the new row as it arrives, and Save writes only the keys you edited.
- **A double press makes one copy.** Two quick clicks on + Duplicate (or on Save scenario with no saved scenarios) made two scenarios on a slow connection; the button is held until the first is made. The new scenario also opens only if you have not touched anything meanwhile: an edit made, or another scenario opened, while it was being created used to be dropped without a word when it landed.
- **Copies are told apart.** A copy of a copy counts on past the ones that exist ("Path A (copy 2)", "(copy 3)"), and a draft saved as a new scenario gets a colour no scenario has, where it kept the one it was loaded with and drew two lines alike.
- **The inputs panel keeps the value when you type nothing, or text, over it.** Clearing the House price and tabbing out set it to 0, clearing the mortgage term set it to 1 and "abc" in a percentage set it to 0%. The panel's fields, and the percentage stepper in Settings and the Nominal preview, now put the value back, as the bar's already did.
- **The bar's percentage field is tidier.** A typed 1,1 is stored as 0.011 and not 0.011000000000000001, which made a scenario read as edited with identical figures; Escape drops what was typed; and on a touch screen a figure is selected as it takes focus, so typing replaces it where a tap left the caret at the end and typing 5 into 1.000.000 made 10.000.005.
- **The panel says what a house bought now does.** Moving the purchase year from Never to Now added about 4.6M to the net worth (8.2M to 12.8M in the demo) with nothing to say why. A purchase now takes nothing out of the portfolio later, which reads the starting balance as what is left after buying; the panel now says so under the purchase year.

## October 2026 (a finger, a keyboard and forced colours on the wide Goals page)

- **The switches on the wide page are 44px tall on a touch screen.** The Plan, Progress and Assumptions switch, the Nominal and Purchasing power switch and the window pickers were 22px, the smallest things on the page and the ones used most. Measured at 1032px with an iPad's touch emulation, all 13 went from 22px to 44px (the scenario tabs were already 44px); under 900px, the phone, is not changed.
- **A table that scrolls sideways can be reached from the keyboard, and shows there is more.** Scenarios side by side is wider than its card at 900 to 1100px, so its Monthly column was out of sight with nothing to say so, and in Safari a scroller that cannot take focus cannot be scrolled from the keyboard. Both tables are focusable named regions with a shadow on the side that has more, and a scenario's name is the row header of its row, so a screen reader can say whose figure it is on.
- **A chart says how to step through it from the keyboard** (the left and right arrow keys, Home, End and Escape), as its description for a screen reader. The values are not read out as they change; that needs a screen reader to judge.
- **The chart keys keep their colours in forced-colours mode.** In Windows High Contrast the legend chips and the dots beside the table rows were white on white and the lines had no key.
- **Discard and Delete can be read in the dark theme.** White on the dark theme's red was 2.8:1; the theme now says which text goes on a solid danger fill (6.8:1 in the dark theme) and the button takes it.
- **The note under Where you are today is not faded.** At 11px it was 4.2:1 in the light theme, the only text on the page under 4.5:1.
- **Rent vs buy says it is not the plan's net worth.** It is the two choices on their own, without the starting portfolio and contributions, so it will not match the figure in the bar.

## October 2026 (Goals on a tablet, and for assistive technology)

- **Every percentage stepper, slider and button says which input it belongs to.** Each was announced as "Annual return percentage" with "Increase percentage" buttons, and the levers bar's sliders as "Real return slider". They now carry the input's name, a percentage slider reads out "7,0%" and the purchase year slider "Year 4", and a purchase year past a shortened horizon stays on the slider's track instead of being drawn at its end.
- **The "years to milestone" colours can be read.** White text sat on the yellow, orange and red cells (1.3 to 2.8 against the background) and dark text on the dark green of "now". Only "now" is white now, and every other cell has at least 6.8.
- **The bar's controls are bigger for a finger.** On an iPad the scenario tabs, the options button and "All inputs" are 44px tall, a star takes a tap from 46px across, and a tap beside a lever's digits puts the cursor in it. Without a hover the figures carry a faint line so it is clear they can be typed over.
- **A star no longer looks removed when it is not.** On a touch screen the star that took the place of one just taken out of the bar drew itself as an outline, because the screen kept the hover on the spot where the finger had been.
- **A tap outside the scenario menu closes it on a touch screen.** It stayed open, and opening it raised the keyboard over half of the page; the menu now takes the focus itself and the name is a tap away.
- **Focusing the bar's controls no longer scrolls the page.** In Safari each Tab or Enter on one of them moved the page up by the bar's height, and in Chrome on a 1280x800 screen pressing a star scrolled it 366px and left the bar mid-page. "All inputs" also opens with its panel clear of the bar when pressed from the keyboard, where it had opened with its first 111px under it.
- **"+ New" is "+ Duplicate"**, which is what it does, and duplicating a copy gives "Path A (copy 2)" instead of "Path A (copy) (copy)".
- **Milestone lines that would run together are left out.** The 100k to 1M lines of a plan past its first milestones drew as a dashed smear along the bottom of the chart; a line is drawn only if it is at least 8px from the one above.
- **The bar's "nothing is starred" message sits in the middle of the bar** instead of at its top edge.

## October 2026 (room on the wide Goals page)

- **A laptop screen now holds the whole chart and the levers bar at once.** The chart starts 94px higher (273px down at 1280px wide instead of 367px), so the chart, its legend and the bar fit a 1280x800 screen with the bar held to the bottom edge, where before the bar would have covered the chart's bottom and so was left below the fold on anything under 896px tall. The bar is pinned from 800px tall now.
- **The title and the view switch are one row.** Goals, with Plan, Progress and Assumptions at the right, take the height one line used to. The phone is unchanged.
- **The chart card's header holds the Nominal and Purchasing power switch, beside the window buttons.** It was at the foot of the card, below the summary box, where on a laptop the bar sat over it.
- **The summary box is gone from the wide chart.** Its net worth was the levers bar's figure a second time, now labelled "Net worth in 30 yrs" in the bar, and the year of financial independence and of the next milestone are one line under the legend. The phone keeps its summary box.
- **The marks on the chart are explained.** A note under the legend says that the dashed vertical lines are purchase years, why a purchase dips the line, and what the shaded band is: the line you are editing at a real return three points either side (4,0% to 10,0% at 7%), which nothing said before. It replaces the paragraph above the chart on a wide screen and is under the legend, so the page does not move when a year is hovered.

## October 2026 (fixes to Goals on a wide screen)

- **"All inputs" shows you the inputs.** On a laptop-height screen the panel opened below the bottom edge and nothing seemed to happen. It now scrolls up under the header as it opens, and a panel that opens higher up leaves the page where it is.
- **The bar no longer covers the bottom of the chart.** On a 1280x800 screen it hid the year axis and, on shorter windows, the legend that gives the chart's values. It is held to the bottom edge only on a screen at least 1200px wide and tall enough to leave the chart above it (800px, since the page was made shorter: it was 896px); on a shorter one it stays in its place in the page.
- **Deleting the scenario you are editing leaves a draft you can save again.** The tabs showed nothing selected and the legend still called the deleted scenario "(editing)". Its numbers now stay on screen as an Unsaved draft.
- **Passing through a lever no longer changes it.** Tabbing through a real return of 4.25%, shown as "4,3", wrote 4.3% back and moved the plan's end net worth. A lever now changes only when you type in it, shows its value again afterwards, and ignores an empty or non-numeric entry instead of turning it into zero (or one year, for the horizon). A comma now works as the decimal mark of a percentage whatever the locale.
- **Keyboard focus stays put when you press a star.** It used to fall to the top of the page. It now moves to the star that takes the pressed one's place, or to the "All inputs" button when none is left.
- **"Years to milestone" shows every column.** On a 1280px screen the 1.0M column was scrolled out of sight with nothing to say so. The table now has a row of its own across the page, and the other six cards are split three and three so the two columns end close together.
- **The stars say what they do.** Resting on one shows what pressing it does, and a filled star shows the outline it is about to become. The area that takes a click is 24px square instead of 18px, the filled star in the light theme is dark enough to read (3.8:1 against the card, from 2.8:1), the ones held back are easier to see, and the stars in the panel sit on the middle of their label's first line instead of 3px above it.
- **A session that cannot save has no stars in the inputs panel.** The bar already had none, and the panel's were a row of buttons that did nothing for the keyboard to stop on.
- **Starring an input no longer takes its explanation with it.** What the purchase takes from the portfolio, the note that the mortgage rate and house appreciation are nominal, and the formula for the FI target stay on the page while an input they are about is still in the panel (the purchase figure always stays).
- **A scenario cannot be saved with no name.** Clearing the name and pressing Save said "Saved" and left a tab with nothing on it. Save is now disabled, with a tooltip saying why, while the name is empty, and the service refuses it too. The wide screen's button says "Save changes".
- **A long scenario name is cut short in its tab.** A 78 character name made a tab 680px wide and pushed the buttons onto a row of their own. A tab is at most 22rem, the name ends in an ellipsis and its tooltip has all of it. The "Unsaved changes" pill lines up with the buttons beside it, where it sat 9px higher.
- **The levers show the currency sign where the currency puts it, and say "1 yr".** A dollar amount read "500 $" beside a result of "$8,179,020", and a one year horizon read "1 yrs".
- **The levers bar scrolls with the page below 1200px wide.** There the five levers wrap to two or three rows and the bar is 186px tall, a quarter of a 768px screen, which stayed stuck over the page the whole time it was scrolled.
- **Taking the first star out no longer moves the panel.** The row above the columns was 15px shorter without the "Reset to defaults" button than with it. The bar's net worth also says in a tooltip that it is in today's money.

## October 2026 (Goals on a wide screen)

- **Plan is one column on a wide screen.** The 300px side panel with its own scroll is gone, and with it the second scroll position to keep track of. The scenario row, the chart across the page, the inputs and the detail charts follow one another down a single scroll. The chart is about 1,130px wide on a 1440px screen instead of 588px, and 330px tall instead of 300px.
- **The inputs a plan is mostly tuned with sit in a bar under the chart.** Monthly investing, real return, horizon, the year you buy a house and the starting balance are in a row beside the net worth they move. Amounts and the horizon are typed over, and the percentages and the purchase year keep their sliders. On a screen at least 1200px wide and 800px tall the bar is held to the bottom edge until the page scrolls up to its place, so it is in sight on a first load, and it sticks under the header once the page has scrolled past it. On a shorter screen it stays in the page so it does not cover the chart, and on a window under 1200px wide, where five levers no longer fit one row, it scrolls with the page instead of sticking.
- **You choose which five inputs are in the bar.** Each lever has a star that takes it out of the bar and puts it back in the panel, and each input in the panel has a star that puts it in the bar, at the end, up to five. A full bar holds the other stars back and says why, and "Reset to defaults" brings back monthly investing, real return, horizon, the purchase year and the starting balance. The choice is kept with your settings, so it follows you to another device, and a session that cannot save (offline) shows the bar as it was saved without stars to press.
- **Every other input opens from "All inputs".** The panel folds open under the bar in as many columns as the width holds: Portfolio, Housing, Financial independence with the plan start, and Life events. An input that is in the bar is not in the panel as well.
- **A scenario is a tab.** The tabs show which one is your plan and which has unsaved edits, and the open tab follows the name as it is typed. Arrows move between tabs and Enter opens one, so the question about unsaved edits is not asked for every tab the arrow passes. "+ New" makes a copy of the open scenario. Rename, colour, use as my plan, duplicate, delete, save as new and keep these edits as a draft are in the menu at the end of the row, which opens with the name field ready. The old chip's eye is gone: the chart's legend, which already did the same, hides and shows a line.
- **The detail charts are two columns of cards.** Each column stacks its own cards, so "Where you are today" is no longer stretched to match the chart beside it. The All charts and One chart switch went with the old layout, since there is one arrangement.
- **The chart's legend is a row of chips with their values** on a wide screen, instead of one row under another with each figure far from its name. The Nominal and Purchasing power switch sits beside the summary figures.
- **Progress and Assumptions keep the page width they were laid out for.** Only Plan takes the wider page. The phone is unchanged.
- **A scenario with a shorter horizon no longer drops to zero on the chart.** Giving the scenario you are editing a 60 year horizon drew the saved 30 year paths falling straight to nothing at year 30, which read as the portfolio being wiped out. Each line now ends at its own horizon, the legend shows a dash for it in a later year instead of 0, and the tooltip on a phone leaves it out. This holds on the phone chart too.

## October 2026 (section tabs)

- **A tapped section leaves a little air under the row.** Totals, Cash and Year in Analytics put their first line half under the row, and every other section, and each Goals view on a phone, touched it. They now stop 8px under it, as the Scenarios chips do.
- **The first heading in Settings and in Analytics' Summary sits closer to the row.** It no longer adds a margin of its own above it, so at the top of the page it is 16px under the row instead of 40px, the same distance as the first line in the other sections.
- **The Analytics and Settings sections stay under the header.** The Summary, Totals, Cash and Year row on a phone, and the Preferences, Setup, Account and Data row in Settings, are stuck under the header as you scroll, as Goals' row is, so changing section from deep in a long page no longer means scrolling back to the top. A section you have not been in opens at its content, just under the row, tapping the one you are on goes back up, and a section you left comes back where you left it. The row is 44px high on a phone and is announced to a screen reader as tabs over one panel. "Preferences" now fits whole on the narrowest phones. On a desktop the Settings row stays put too, at its old height.
- **Goals no longer leaves a gap at the foot of the page on a tablet in portrait.** From 768px the rail replaces the bottom bar, but Goals still kept focus and jumps 72px above the bottom edge up to 899px, for a bar that was not there.
- **Keyboard focus stays clear of what is pinned on every page.** Tab and Shift+Tab scrolled a control only to the edge of the screen everywhere but Goals, which could leave it behind the header or the bottom bar. In Transactions it could also be behind the filter bar or the day heading stuck under it. The page now keeps focus clear of them.

## October 2026 (Goals on a phone)

- **One row to move around Goals on a phone.** Chart, Adjust, Progress and Assumptions are a single row under the header that stays put as you scroll, so changing view from deep in Adjust no longer means scrolling back to the top. A view you have not been in opens at its content, just under the row, and tapping the one you are on is a quick way back up. Wide screens keep Plan, Progress and Assumptions. The row is announced to a screen reader as tabs over one panel.
- **The pinned chart in Adjust sits flush under the row.** It used to tuck 5px under the header.
- **Chips in Adjust jump between its sections.** Portfolio, Housing, FIRE, Tracking and Events sit under the pinned chart. Tapping one scrolls to that section, opening it if it was closed, and the chip for the section you are reading is marked as you scroll. The last sections cannot always reach the top of a short page, so a chip you tap stays marked until you scroll for yourself. On a narrower phone the row scrolls sideways.
- **Adjust opens at its controls.** The first time you open it, Adjust scrolls to the first section under the chart, instead of leaving you at the cards above it. Tapping Adjust again takes you back up to those cards.
- **A view comes back where you left it.** Going back to Chart, Adjust, Progress or Assumptions puts the page where it was, instead of at the top of the view. That holds when a link took you away, such as "Open Assumptions" in the Nominal note or "Set up accounts" on an empty Progress, and Adjust comes back with the same sections open.
- **Chart leads with the chart.** On a phone the projection chart comes first in Chart. The intro and glossary moved below the charts and controls, so the chart is no longer a screen down.
- **Plan opens on the chart on a wide screen too.** The projection chart leads the right-hand column, above "Where you are today", so it and the scenarios share the first screen on a laptop or a tablet on its side. The intro and glossary moved to the end of the sidebar, under the controls whose words they explain, instead of leading the page.
- **The pinned chart in Adjust says where its line ends.** A label such as "Year 30 · 1.2M €" sits at the top left of the chart, or at the bottom left when the line runs along the top, so a slider can be judged without reading the axis. A screen reader hears the same figure in the chart's name.
- **Save and Discard are in the chip row in Adjust.** Edits to a saved scenario can be saved or dropped from beside the chips, without scrolling up to the scenario card that holds those buttons. Save is named after the scenario, both buttons are held while the write is in flight, a save confirms with "Saved" and the scenario's name, and focus moves to the marked chip when the buttons go. The text on Save is dark enough to read in the dark theme, where white on its light blue was 2.2:1.
- **Adjust scrolls away on a short screen.** On a phone on its side, or with large text, the pinned chart and chips would leave almost no page between them and the bottom bar, so they scroll with the page and only the view row stays.
- **Keyboard focus stays clear of what is pinned.** A control that takes focus is scrolled out from under the header, the view row, Adjust's chart and the bottom bar, and a field in Adjust is kept clear of the chart when the on-screen keyboard arrives.
- **Segmented controls take the arrow keys.** Each is one Tab stop, on the selected option, and the arrows move between options (wrapping at the ends) while Home and End jump to the first and last. A row of tabs takes only Left and Right, so Up and Down still scroll the page. Alt, Ctrl and Cmd with an arrow are left to the browser, so Alt+Left still goes Back. Tab from the Filters sheet's date scope now stays in the sheet, instead of moving on to the page behind it.
- **"Set up accounts" lands on the accounts.** On an empty Progress the button opens Assumptions at the Wealth accounts card, as the Nominal note's link already did for the assumed inflation.
- **Goals' Setup view is now called Assumptions.** It holds the milestones, the wealth accounts, the cash reserve and the assumed inflation, and shared its name with Settings' Setup. The Nominal note, the glossary and the empty Progress card point to it by the new name. Earlier entries below still say Setup.

## October 2026 (marking a card statement paid)

- **A due card on the dashboard has a "Mark as paid today" button.** One tap marks the statement paid and dates it today, as the Due pill in the sheet used to. To use another day, tap the row and pick it before marking it paid. The button shows only while a statement is due and has something to settle, and not in Settings, where every month of every card is listed.
- **A statement row shows at a glance whether it is due or paid.** The word is amber when due and green when paid, instead of the muted grey of everything around it, on the dashboard, in Settings and in Transactions. A screen reader now hears the status and the amount along with the name.
- **A statement row you can tap shows a chevron.** Nothing marked these rows as something to open. A statement with nothing to settle has no chevron, since there is nothing to open.
- **The card statement sheet has buttons, not a pill to tap.** The small Due/Paid pill was also the control, and it was labelled with the state the statement was in rather than what tapping it did. A due statement now shows a date field, set to today, and a "Mark as paid" button that saves and closes the sheet. A paid one shows its date and a "Mark as due" button. A save that fails now says why in the sheet and leaves it open.
- **The Transactions statement sheet shows a new paid date straight away.** It used to jump back to the old date until the sheet was reopened.

## September 2026 (one chart tooltip at a time)

- **Opening one chart's tooltip now closes another's.** Charts stacked on the same screen, such as Progress's net worth history above the check-in history, or Analytics' monthly and year-to-date charts beside the category pie, could each have their tooltip open at once. Tapping or hovering a chart now closes whichever other one was open.
- **The composition chart's legend now shows live figures for the focused point**, the way the main projection chart's does, instead of only naming the three series with a fixed colour key.

## September 2026 (chart readability)

- **The Y axis fits the lines.** The projection chart no longer stretches to the uncertainty band's upper edge or to the other view's height, so the lines fill the plot and can be told apart; a band that runs higher is clipped at the top. Purchasing power and Nominal each fit their own axis, so switching between them rescales. On every chart the axis now stops at most 8% past the data, and the income and expense charts follow the same rule.
- **A far-off FI target no longer stretches the chart.** It follows the same rule as the milestones, in every window: left off the axis when the plan does not come near it, and marked with an arrow and its amount on the chart's top edge. The axis labels are also held to what the chart's height can show, so the small pinned chart no longer crowds them.
- **Long scenario names wrap** in the projection legend (and the purchase breakdown title, and the category names beside the pie) instead of being cut off, and the plan from today shows its figure at the last year (it stopped a fraction of a year short), with a dash before the check-in.

## September 2026 (the plan from today)

- **The plan as it stands from your latest check-in**, without re-baselining. A dotted line in the plan's colour on the portfolio projection from the check-in on, a "from today" row under the plan in the comparison and milestone tables (years counted from the check-in), a second date for each unreached milestone on Progress, and a second FI year on the dashboard card. The plan line and ahead/behind keep their baseline; this says what happens now from the balance actually there.

## September 2026 (chart tooltips on a phone)

- **A chart's tooltip opens on the side of the chart with more room**, above or below it, and stays there while you slide along the chart. It is laid over the page instead of sitting in it, so it takes no space, the chart never moves and nothing scrolls to reach it. The income and expense charts, and the composition, FIRE, rent-versus-buy and savings-rate charts, do this. The main projection chart and the category pie only ever go above theirs (the main one had no tooltip before this at all, its values were only in a legend below it), since each has its own always-shown legend to fall back to instead of a second readout below the chart. Wide screens keep the tooltip at the pointer. A tooltip too tall for the room on either side, such as the purchase breakdown on a small phone, goes where less of it is cut off, and scrolls its own rows rather than losing them under the header or the tab bar.
- **The tooltip stays with its chart as you scroll.** It sits against the chart's edge and moves with it instead of following the screen, so it is not left over the next card once the chart has gone. It moves to the other side of the chart when the page scrolls and there is no longer room for it, and it is not shown while its chart is mostly off screen. Scrolling does not close it, since the breakdown may sit below the fold; a tap outside does.
- **The main projection chart's legend always shows its figures.** The tooltip above the chart is only an extra readout for while the legend has scrolled out of view; it never makes the legend itself hide or show anything.
- **Tooltip rows carry the colour of their series**, as the Progress charts already did: the composition, FIRE, rent versus buy, savings rate and main projection charts showed plain text, with the colours only in the legend.
- **Negative amounts are compact too** (-5.0M, not -5.000.000,00). The Composition chart's lowest tick, the mortgage below zero, lost the start of its label. The same form now applies wherever an amount is negative, such as the behind-plan figure on the summary card, which used to print to the cent while the ahead figure was compact.

## September 2026 (comparison table and chart tooltips)

- **The comparison table reads at a year.** The same 5Y, 10Y and 20Y windows as the hero chart, or each path's horizon as before; a path whose horizon is shorter says so in the cell. A loaded, unchanged scenario is listed once, as the chart draws it, and a long name runs to two lines with the full name on hover; the milestone table follows both.
- **The Progress snapshot says what pace has been kept**: the monthly average invested since the plan started against the monthly figure the plan assumes, and a typical month beside it when a lump sum has pulled the average away from it.
- **Hiding a scenario keeps its place in the legend** instead of dropping to the bottom.
- **Chart tooltips.** A finger sliding along a chart keeps the nearest step lit instead of blinking out between steps; a scroll that starts outside the chart no longer closes the tooltip, only a tap does; on a phone the tooltip scrolls into view when a chart at the bottom of the screen opens it below the fold; and the Progress charts name the nearest reading, with its date, from a step that has none of its own.

## September 2026 (wealth follow-ups)

- **The plan is in today's money, and Progress compares like with like.** The projection, the FI target, the milestones and the comparison table are real; a check-in is a balance in the money of its day, so on/off track, "Actual vs plan" and the measured return take the assumed inflation off it before setting it against the plan. That is one setting, 2% until you change it, in Setup beside the cash reserve target; every Goals view uses it. The hero chart opens on Purchasing power, and its Nominal view inflates the plan and its band at the same rate, and can preview another rate without saving it, with a note pointing to Setup for changing it for real; the FI and milestone lines are only drawn in today's money.
- **Withdraw.** Money taken out of the portfolio (a sale to cash, a dividend paid out) is recorded as a negative investment. The goals pace counts only what went in, and the measured return chains across check-ins and counts what came out.
- **Milestones and accounts live under Setup**, with an optional target date for a milestone, and Progress says whether you are on track, late or overdue for it.
- **A cash reserve target**, in months of spending, set under Setup; Progress says how many months your cash accounts cover.
- **Re-baseline from Progress** asks first and says what it will change: the new start, the start it replaces, the monthly investing a growing contribution has reached, and where each life event and the house purchase land. Events already behind the new start are dropped, since their money is in the balance.
- **A check-in nudge** on the dashboard once the last one is a month old, and a hint to re-baseline when the gap to the plan has held still for half a year.
- **The scenario comparison table, shorter windows on the history chart, and horizon windows with a legend that hides lines on the hero chart.**
- **Housing is in today's money too.** The mortgage rate and house appreciation are nominal, as quoted; the plan takes the assumed inflation off both.
- **Fixes.** A new account's check-in field starts empty instead of "0,00" (typing appended to it); an unknown scenario id from a stale tab no longer leaves you with no active plan; switching scenarios from "Unsaved draft" asks before dropping edits; a failed cash reserve or re-baseline save says so instead of looking saved; a CSV import names the line it refused.

## September 2026 (correctness pass)

Mostly fixes to things the app was getting quietly wrong rather than new ground.

- **A sent expense report stops changing after you send it.** Reports were recomputed from live rows every time you opened one, so editing or deleting a covered transaction afterwards silently rewrote your record of what you had submitted. What a report covered is now stamped when it is settled, and a report whose rows have since moved says so instead of redrawing itself.
- **Bulk actions report what happened, not what you asked for.** Deleting five rows where one had already gone elsewhere still said "Deleted 5". The count now comes from the server, and reads "Deleted 4 of 5" when they differ.
- **Settling several transactions no longer half-succeeds.** If one of them had already been settled by a different reimbursement, the others were committed before the conflict was raised, so you were told the whole thing failed while part of it had gone through. Every row is checked before any is written.
- **Reimbursement failures say something true.** The old message claimed nothing had been recorded even when a refund transaction existed, which invited you to create a second one. There are now three messages for the three things that actually happen.
- **The purchasing-power toggle stops overstating your progress.** Switching to real terms deflated the projection line but left the check-in dots at nominal values, so a scenario you were exactly on track for could read as far ahead of plan.
- **Future-dated wealth check-ins are refused**, on the phone as well. The date field had been trusting an HTML attribute that iOS Safari ignores outright.
- **Bulk edit uses your budget rollover day** when it prefills the budget month, instead of the calendar month, so it no longer assigns a month a single edit never would.
- **Exported CSVs cannot execute.** A description beginning with `=` or `+` is neutralised on the way out and restored on the way back in.
- **Installments stay visible and say when one is paid.** The Installments card sat behind the same one-day "due soon" gate as the guessed recurring bills, so a declared plan vanished until its payment was nearly due, and again as soon as it was logged. It now shows every plan's payment for the viewed month as Due or Paid, with the real payment date.
- **A finished plan closes itself.** A plan stayed active after its last payment until someone pressed Complete. It now completes when the final installment is recorded, and plans that had already finished were closed out in one pass.
- **Paid no longer overstates a card charge.** An installment on a credit card read Paid the moment it was logged, even while its card statement was unpaid and the same charge read Forecast in the list. The Installments card and the plan progress line now say Forecast too.
- **Credit-card installments create themselves.** Nothing tells the app a card charged this month's installment, and it is a certainty from the day the plan is made, so the first time you open the app after a month comes due, that month's installment is added for you. Missed months are all added at once, oldest first. Debit-card plans stay manual, because logging one is the only sign the money left the account. It counts a month as due by your budget rollover day, not the calendar.
- **Installment dates follow the month the charge posts.** If you count a charge in the month its card bill is paid, a first installment dated in August and counted in September was followed by one dated and counted in October, a month late and in the future. The gap is now read from the plan's first installment, so the second is dated in September and counted in October.
- **Installment rows are easier to read.** Each row used to run its whole story together in one dotted line. On a wide screen it is now a table with column headers (plan and position, Debit or Credit, last payment, amount, status). On a phone it is two lines, and three below 375px so the name still fits. The status is a single pill with the date inside ("Due 12 Jun", "Forecast for Jun", "Paid 4 Jun"), so a credit-card installment no longer shows Paid and Forecast together, and once its statement is paid it shows the day you recorded paying it instead of the day of the charge. Manage plans uses the same words. Pill text is also darker in the light theme, where it was about 2.3:1 against its tint and is now above 5:1.

## July 2026 (follow-ups)

- **Budget month on transaction rows.** Every row now carries the budget month it is charged to, so filtering across months (investments over a year, say) no longer loses track of which month each row belongs to, and the "31 Jul charged to the Aug budget" rollover reads straight off the row. The month sits under the amount, alongside the `Forecast` badge, which gives the category and account names the full width of the row and lines the months up in a column down the right edge. Every row is the same height at every screen width.
- **Readable milestone matrix.** With named milestones the years-to-milestone table used to squeeze every column into an equal sliver and let long labels overlap their neighbours. Columns now size to their content and the table scrolls sideways with the scenario names pinned. Headers stack the name over the amount, with the full name and reached date on hover.
- **Named milestones show their amount too.** Previously a name replaced the amount, so "Coast FI" gave no sense of the target. Named milestones now read "Coast FI (150k €)" throughout the Goals tab.

## July 2026 (Goals & Wealth Management overhaul)

### Goals tab — Plan view

- **Scenario editor now exposes previously hidden engine controls.** Contribution growth, mortgage rate, mortgage term, and house appreciation are available as sliders and inputs in GoalControls (previously engine-only constants). Home carry rate remains an engine default for now.
- **Uncertainty band on the hero chart.** A shaded band around each scenario's projection shows the ±3 pp return spread, making "good year vs bad year" visible without Monte Carlo.
- **Life events.** Add one-off cash flows (inheritances, car purchases, etc.) to any scenario with a year, amount, and label. Events appear as diamond markers on the chart and are stored per-scenario in the DB.
- **Nominal vs real display toggle.** Switch the hero chart between inflation-adjusted (real, default) and nominal values. Uses a 2% ECB-target inflation rate; check-in actuals are also scaled so they stay aligned with the projection.
- **FI target reference line.** When annual spend and a safe withdrawal rate are set, the FI number (annual spend ÷ SWR) appears as a reference line on the hero chart automatically.
- **Custom milestones.** The €100k–€1M ladder is no longer hardcoded. Edit your own list from the Goals tab's Progress view with optional names ("House deposit", "Coast FI") in place of bare amounts, up to 12 entries. Existing setups keep the old ladder until changed. Milestones your check-ins have already passed are marked as reached in the matrix and listed on the Progress view with the date they were first observed. Chart reference lines now scale to the projection, so an aspirational milestone far above the plan no longer flattens the chart.

### Goals tab — Progress view (new)

- **Plan / Progress segmented view.** The Goals tab now has two views. Plan is the existing projection lab; Progress is new.
- **Wealth accounts.** Create named accounts (investment, cash, other asset, debt) in the Progress view to track net-worth components by market value separately from expense categories.
- **Wealth check-ins.** Log a dated snapshot of each account's market value. Check-ins are stored per-account and per-date; the full history is visible as a timeline.
- **On/off-track status.** After setting a plan start date on a scenario, each check-in compares actual invested balance to the scenario projection at that date and shows how many months ahead or behind plan you are.
- **Actuals overlay on the hero chart.** Check-ins appear as scatter points on the Plan-view hero chart so projected vs actual is visible in one place.
- **Dashboard badge.** The GoalsCard on the dashboard shows the on/off-track status from the latest check-in.

### Goals tab — Mobile (new)

- **Sticky "Adjust" button on mobile.** On narrow viewports the GoalControls panel is replaced by a sticky button at the bottom of the Plan view that opens a bottom-sheet overlay, keeping the chart in view while adjusting sliders.

### Transaction form

- **Inactive category warning.** An amber "This category is inactive" label now appears below the Category picker when the selected category is no longer active — easier to spot than the "(archived)" suffix in the dropdown.

## July 2026 (onboarding wizard re-entry fixes)

### Setup wizard

- **Finishing re-entry no longer reopens "add a transaction."** That only happens on a genuine first
  run now; re-opening the wizard from Settings to tweak currency or accounts just closes it.
- **Opting into an extra debit account on re-entry no longer silently changes your default account.**
  `settings.defaultAccountId` is only seeded by the wizard when nothing was configured yet.
- **Categories step no longer blocks re-entry at zero selections.** Presets default unchecked when
  you already have categories, and Continue no longer requires picking one — a plain note explains
  no new categories will be added instead of a "select at least one" warning. First run is unchanged.
- **Screen readers now announce each step change** — focus moves to the new step's heading instead of
  staying wherever it was.
- **A failed "Finish setup" no longer leaves orphaned categories/accounts behind.** If a later step
  fails (e.g. the account create call), whatever categories/accounts this run already created get
  cleaned up automatically instead of sticking around unused.

## July 2026 (onboarding wizard fixes, category/account delete)

### Setup wizard

- **Re-entry no longer silently resets settings.** Re-opening the wizard from Settings used to seed
  the Money step from hardcoded defaults, quietly reverting currency, number format, and budget
  rollover day back to EUR/`de-DE`/day-13 (the wizard's own old hardcoded fallback — unrelated to
  the app's actual built-in default of day 1) even if you'd already changed them. It now seeds from
  your actual saved settings.
- **Adding a new debit account is opt-in on re-entry.** First run still always creates one debit
  account (you need at least one to use the app); re-opening the wizard later shows an "Add another
  debit account" checkbox instead of silently creating a duplicate.
- **Confirmation popup before "Finish setup"** lists what will be created (categories, accounts)
  and shows the currency, number format, and budget rollover day from the Money step — always shown
  even if unchanged, since only the fields that actually differ from your saved settings get
  written — before anything is applied. Includes a plain note that it doesn't check for duplicate
  categories, so re-running the wizard's Categories step will add to what you already have, not
  replace it.
- **Checking "Add a credit card" now requires a name to finish setup**, matching the debit account
  field — previously it silently skipped creating the card if the name was left blank.
- **Keyboard focus stays inside the confirmation popup** while it's open, instead of Tab being able
  to reach Back/Continue/Skip behind it.
- **New categories added on re-entry now sort after your existing ones** instead of restarting at
  the top of the list.

### Categories & accounts

- **Delete a category or account**, from its edit screen. An unused one deletes outright; one still
  referenced by transactions, installment plans, or (for accounts) card statements offers a
  reassign-then-delete flow: move everything to another existing category/account, or create a new
  one inline (e.g. to fix a typo without leaving the delete flow) — the move and the delete happen
  together, so nothing is left half-reassigned. You can't delete your only remaining category or
  account.
- **New/edited transactions can no longer pick an inactive (archived) category or account** — the
  "Active" toggle now actually behaves like an archive for new entries. Editing a transaction still
  always shows its own current category/account even if it's since been archived, so editing any
  other field on that transaction never forces a reassignment. Every other view (filters, analytics,
  budget totals, CSV export) is unaffected and keeps showing archived categories/accounts as before.
- **Reassign targets are active categories/accounts only**, for the same reason — you can still
  create a brand-new one inline instead.
- **Deleting your default account no longer leaves Settings pointing at a deleted one.** It now
  moves to whatever the account's data was reassigned to (or clears to "none" if the account had no
  data and was just deleted outright).
- **Deleting a category/account that turns out to still be in use** (e.g. another tab added a
  transaction to it moments earlier) now offers the reassign flow directly instead of showing an
  error and leaving you to retry the same delete.
- **Archived categories/accounts are labeled "(archived)"** wherever a transaction or installment
  plan's own current value keeps one selectable in a picker.

## July 2026 (installments, currency, onboarding)

### Installments

- **Installment plans**: log a purchase once as a bounded N-payment schedule (e.g. a phone financed over 24 months) instead of re-entering it every month. Create a plan inline from the transaction form, or manage existing plans from the Transactions tab.
- **Manage plans**: progress, edit, complete and delete for every plan, from a button on the Installments card in the Transactions tab.

### Currency and budget months

- **Settings → Money & months**: currency, number-format locale (comma vs dot decimals), and the day of the month the budget period rolls over are now per-tenant configuration instead of hardcoded EUR/`de-DE`/day-13 assumptions.
- The **setup wizard** collects these during first-run and can be re-opened any time from Settings to revisit them (also fixes categories/accounts started outside the wizard).

### Cash reconciliation

- **Reconciled badge** (✓) on a month's row once cash is entered and every card statement for that month is paid.

## July 2026 (reconciliation UX)

### Cash reconciliation

- **Gap split** on desktop and mobile: **Carryover**, **This month**, and **Total gap** columns replace a single opaque gap.
- Analytics copy explains how carryover vs this-month drift maps to reconciliation.

### Transactions

- **Statement payment rows** appear in the list when a deferred card statement is marked paid (derived from statement status + cash recon, not stored as transactions).
- **Header refresh** on every tab; pull-to-refresh on mobile. Toast on success or failure.

### Offline / PWA

- **IndexedDB snapshot** of the last successful load for read-only viewing when offline or when refresh fails.
- **Offline banner** distinguishes true offline vs online with stale cache; editing disabled until reconnect or refresh.

## July 2026

### Transactions

- **Date scope dropdown** replaces the old “filter by calendar date range” checkbox: budget month (default), last 3 months, all dates, or custom range anchored to the viewed month.
- **Per-day +** on date headers opens the add form with that calendar date pre-filled (FAB still adds for today).
- **Duplicate** — swipe left on a row (mobile) for **Copy**, or use **Duplicate** in the edit modal (desktop). Opens a new transaction with copied fields and a “Copied from …” hint. Swipe eases open/closed on release; tap an open row to close it.
- **Delete** (mobile swipe or batch select) uses an in-app confirm sheet with context.
- **Upcoming** recurring suggestions anchor monthly items to the viewed budget month (fixes missed suggestions when the prior charge landed in an earlier BM).
- **Upcoming** groups recurring patterns by category so subscription “Glovo” is not mixed with food orders sharing the same description.

### Dashboard

- **Recent activity** toggle: **Latest** (by transaction date) vs **Recently added** (by entry time).

### Analytics (mobile)

- YTD budget vs actual block and invested KPIs on the Summary segment.

### PWA / access

- Service worker no longer intercepts `/api` (fixes iOS auth failures).
- Access error screen shows copyable diagnostics; optional reload banner when a new build is available.

## June 2026 (Goals milestone)

- Goals tab: multi-scenario projections, FIRE/housing/rent-vs-buy charts, scenario show/hide, glossary.
