# Back office mockups

Jack's back office: three tabs (Requests, Revenue, Messages), four different ideas for each, on one page. Everything runs on mocked data in the browser; nothing is saved and nothing is sent.

## Run and build

```bash
cd prototypes/back-office-mockups
npm install
npm run dev                      # http://localhost:5174
npm run build && npm run preview # static site in dist/
```

`dist/` is self-contained with relative paths, so it works at a domain root or in a subfolder. `vite` is the only dependency.

## Switching

- **Jack's navigation** is the rail on the left (a bottom bar on phones). Each tab carries a glance: how many requests wait, how much cash is due, how many messages are unread. The dashed slot under the tabs is where further tabs go.
- **The review switcher** is the faint pill at the bottom left (bottom right on phones): tab, then option A to D. Hovering it shows the idea behind the current option. The phone icon opens the same page in a phone-sized frame.
- Links are shareable: `#/requests/a` to `#/messages/d`.

Actions are live across tabs: confirm a request, mark something Paid or reply, and the revenue figures, nav glances and other views update.

## The ideas

| | A | B | C | D |
| --- | --- | --- | --- | --- |
| Requests | Queue and week: requests stacked beside a week time grid | Timing screen: nine weeks on one strip, a lane per service, side sheet for decisions | Shift-light month: each day is twelve LEDs, 10:00 to 22:00, lit by state | Gearbox stream: day-by-day list, every booking has an Off / Held / Locked / Paid gate |
| Revenue | Ledger dashboard: four totals, paid by month, by service, season heatmap | Money flow: requested splits into confirmed, tentative and lost, then paid and unpaid; cash to collect | Season clock: the year as a dial, a ring per service, push-next and this year vs last | Report sheets: monthly, quarterly and half-yearly reports as documents, with ledger and CSV export |
| Messages | Three panes: threads, conversation, the booking beside it | Booking board: conversations in lanes by what they need; acting moves them along | Pit stop: one waiting conversation at a time, one tap replies and acts | Client book: people first, one timeline of requests, payments and messages per client |

## Statuses

Colour and shape both carry the state, all inside Jack's palette, with no red:

| State | Look | Meaning |
| --- | --- | --- |
| Tentative | Silver, dashed outline, hatched | Requested; the slot is held but not promised |
| Confirmed | Solid Jack's blue | Jack said yes; the slot is locked |
| Cash due | Blue with a dashed gold edge | The session happened and the cash hasn't arrived |
| Paid | Gold chrome | Cash in hand; the only state that counts as revenue |
| Unlocked / Declined | Slate, struck through | The slot is free again |

Gold only ever means cash. Services are told apart by tones of the same palette: Jack's blue (sim), silver chrome (track day), pale blue (commentating), gold chrome (racing).

## Data

`src/data.js` generates bookings from September 2025 to January 2027 from a fixed seed, with today fixed at Saturday 14 November 2026. It follows the UAE year: track days in the cool months and none in the summer heat, sim coaching peaking in summer, and commentating around the event calendar. It includes cancellations, declines, confirmed sessions still unpaid, quotes pending for inquiries, and one three-day set (two days kept, one unlocked) tagged "1 of 3" as a placeholder for multi-session bookings, whose rules aren't designed yet.

Prices: sim coaching AED 500 an hour, a track day AED 2,500 flat, Commentating and Racing by quote.

## Type and palette

Archivo Expanded SemiBold, self-hosted (`src/fonts/`, SIL Open Font License), with tabular figures. The typeface is named once, in `--font` in `src/style.css`; swapping it is that line plus the `@font-face`. Palette tokens are at the top of the same file.

## Files

```
src/data.js        seeded mock data and message threads
src/store.js       state, actions (confirm, decline, unlock, paid, reply), money totals
src/ui.js          formatting, status chips, icons, action buttons
src/main.js        router, Jack's navigation, review switcher, phone preview
src/style.css      tokens and shared components
src/views/         one file per option (req-a … msg-d), plus shared cards, charts and message parts
```
