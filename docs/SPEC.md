# Product spec — KZT ↔ KRW Exchange Board

Detailed behavior. CLAUDE.md holds the always-on rules; the schema lives in `backend/app/migrations/`.

## Screens (Mini App)
- Every screen speaks from the viewer's side: a request shows **You pay** / **You get** (for its
  author, or for whoever takes it). A request's amount is what its author **buys** (`requests.amount`, in
  KRW for `KZT_KRW`, in KZT for `KRW_KZT`): fixed, so it's what the author gets and what whoever
  takes it pays. The other side is converted at the request's rate and marked "≈", moving with
  the market until a deal is accepted: accepting locks the rate (`deals.rate`), and from then
  on both of the deal's amounts are exact. New request shows this under the amounts. Requests
  posted before migration 016 had their amount in what the author gave; it was converted at
  that day's rate (and accepted deals locked at it).
- Screens keep explanations out of the way: short labels and status lines, a hint only where
  something is missing or blocked. How things work is on **How it works** (see below).
- Every request and deal shows the other side's **profile tag**: "Adil Sultanov, UNIST, 2022"
  (see Profiles), next to their completed-deal count. Not on the viewer's own requests.
- Someone else's request also shows its author's current Telegram username as a tappable
  **@username** tag (Board cards, request detail, matches), opening their Telegram profile via
  `openTelegramLink`, so people can check who they'd trade with. Tapping it doesn't open the
  card. Hidden when the author has no username.
- **Board** — open requests in two tabs by what the viewer would buy by taking one ("Buy KRW
  🇰🇷", the default, lists `KRW_KZT` requests; "Buy KZT 🇰🇿" lists `KZT_KRW`). **Filters**
  (highlighted while not the default) sorts by date or amount they'd get (no rate sort: every
  request is at the market rate); an arrow toggle flips the order. Picking a sort starts it in
  its default order: oldest first for date (the Board's default, so older requests are taken
  first), largest first for amount.
  Cards show the author's profile tag and @username, pay / get, the rate compared to the market, the
  author's completed deals and time left, and under the rate their preferred KZT bank, if any
  ("Preferred KZT bank: Kaspi"; on every request card, in My deals and matches too). Shows the reference rate both ways at the top (1 ₸ = X ₩ and 1 ₩ = Y ₸).
  **Alerts** (next to Filters) opens a panel to turn alerts for the current tab on or off (see
  Alerts); it's highlighted, with a filled bell, while that tab's alerts are on, and carries a
  red "new" dot until the user first opens it.
  Large **My deals** and **Profile** buttons with icons, and a **Refresh** button next to
  Filters and Alerts. A **How it works** link at the bottom, above the footer. Hides the viewer's
  own requests and requests from banned users.
  Under each card the viewer hasn't responded to: **Counter offer** (only if its author takes
  them, see Counter offers) and **Take request** (the same confirm popup as on the request,
  then the new deal opens; an error shows in a popup). Without a username or a full profile,
  both open the request, which says what's missing.
- **Request detail** — what the viewer pays and gets, rate, preferred KZT bank (if any),
  author's profile tag, @username and completed-deals count, counter offers ("From 20,000 ₸", or "Whole amount only"), time
  left. Buttons: **Take request** (creates a pending deal, see Deal flow), **Counter offer**
  (if the author takes them), **Report this request** (not on your own);
  on the author's own open request, **Edit**, **Extend** and **Cancel request** (and how many
  people are waiting for an answer, and the requests going the other way they could take,
  closest in size first); on their own expired request, **Post again**.
  Without a full profile, taking is
  replaced by a notice linking to Profile (as posting is on New request). A request an admin
  removed reads "An admin took this request off the board" (status "Removed by an admin").
- **New request** — form: what the author buys ("Buy KRW" posts `KZT_KRW`, "Buy KZT" posts
  `KRW_KZT`; from the Board it starts on the open tab's currency), the amount they get or the amount they pay (either can be typed, what they get
  first; the other is converted at the market rate, and the request stores what they get,
  rounded; the paid side reads "You pay ≈"), with the market rate under them. There's no rate to choose:
  every request is at the reference (market) rate (`rate_value` 0), and the app never compares
  a request's rate with the market. Requests posted before that may carry a ±% offset, which
  still applies to their rate (`effective_rate`) until they're gone, but isn't sent to the app.
  **Counter offers** (optional): the smallest part
  of the amount they get that they'd accept from a counter offer, a positive whole number up to
  that amount; left empty, counter offers are off.
  **Preferred KZT bank** (optional free text, max 40 chars: letters, digits, spaces and
  `-'’.&()/,+`, e.g. "Kaspi, Halyk"; shown on the request) with a **Remember for my next
  requests** checkbox: New request (not Post again or Edit) starts with the remembered bank
  (`users.saved_kzt_bank`), ticked if there is one. Posting with it ticked remembers this
  request's bank (empty forgets it); unticked forgets it.
  Duration (1 / 3 days). No free-text note, no payment methods
  (where to pay comes from the receiving details once a deal is accepted).
  Show matching opposite requests right after creation.
- **My requests** (no separate screen: they're on My deals and the request screen):
  - **Edit** changes the amount, rate, smallest counter offer or preferred KZT bank (the
    direction and expiry stay; the minimum can't end up above the amount: `counter_minimum_too_large`). It's refused
    (`request_has_responders`) while anyone's deal on it is pending, since they took the old
    terms; they're answered in My deals.
  - **Extend** keeps it on the board 1 or 3 days from now (a Telegram popup), only if that's
    later than its current expiry. Pending responders stay.
  - **Cancel request** (see Deal flow).
  - Requests that expired in the last 24 h are listed with **Post again**: New request
    prefilled with the same terms, subject to the usual limits.
- **Counter offer** — from the Board card or the request: the request's card, then **Your
  offer**: what the viewer pays and gets for part of it (either can be typed; the other is
  converted at the request's rate), "From <minimum> up to <amount>." Anything outside that
  range is refused before sending (and by the backend: `counter_below_minimum`,
  `counter_above_amount`, or `counter_offers_off`). MainButton **Send counter offer** creates a
  pending deal and opens it.
- **My deals** — sections *Active*, *Completed*, *Declined & cancelled*, then *Expired in the
  last day* (with **Post again**). The viewer's own offers waiting for an answer (taking a
  request, or a counter offer) have **Cancel offer** under their card (see Deal flow). *Active* holds the user's `pending` / `accepted` deals and their
  requests on the board (open, not expired), each request once, with **Extend** and **Cancel
  request**: a pending deal on it isn't listed apart. When someone took it, the card reads
  "Waiting for your answer" and opens that deal (the first taker's; after answering, the next
  one's), with green **Accept** and red **Decline** buttons for it floating below the card and its
  Extend / Cancel request (the same confirm
  popups as on the deal screen; accepting opens the deal); otherwise it's marked when it leaves
  the board within 6 h. If that first one is a
  counter offer, the card shows what it asks for, with the whole request dimmed below it
  ("Whole request: … → …") and "Counter offer · Waiting for your answer". Accepted counter
  offers on it are listed as deals of their own. Every counter offer's deal card (and deal
  screen) likewise shows the deal's amounts over the dimmed whole request, and active ones
  read "Counter offer · <status>". Order: deals in progress
  (outlined), then what's waiting on the viewer, then the rest, their idle requests last.
  Cards under *Completed* and *Declined & cancelled* carry no status tag (the section says it),
  except cancelled offers ("Offer cancelled"). *Completed* and *Declined & cancelled* each fold and unfold by tapping their title (which shows the
  count); each choice is remembered on the device. My deals and the deal screen have a **Refresh** button.
- **Profile** — name, username and completed deals count; *About you*: first and last name,
  university and year of enrollment (see Profiles), with a preview of the tag; receiving
  details per currency (KZT, KRW): bank and account holder, and account / card / phone number
  (max 100 chars each). One MainButton **Save** for all of it. Then links to **How it works**,
  **About & support** and (admins only) **Admin: reports**, **Admin: users**, **Admin: board
  requests** and **Admin: all deals**. The owner also gets an *Owner* section with **Admins**.
- **How it works** — a few very short points per topic (people skip long instructions): the
  basics (free, never handles money, what you need to take part), posting (fixed amount, ≈
  side and the rate lock, counter offers, duration), taking (offers and their limits), deals
  (contacts, Received payment, no cancelling, Report), alerts & privacy. Static text in
  `i18n.ts`; from Profile and from New request (a small rounded button with an info icon).
- **About & support** — what the app is and the disclaimer, "Made by Adil Sultanov (@moonpie24)",
  a link to the GitHub repo, Terms and Privacy. **Support the project**: the owner's note and up
  to 6 donate options (label + value; a `http(s)://` value opens as a link, anything else gets a
  Copy button), with a line saying donations are voluntary and unlock nothing. Hidden while
  empty, except for the owner, who gets **Edit** (note, add / remove options, MainButton Save).
- **Deal** — the status (on an accepted deal, with a check for each side that confirmed
  receiving the money), what the viewer pays and gets, and who it's with (profile tag and
  completed-deal count; once accepted, a **Message** button and where to send them the money,
  with Copy). Rate, preferred KZT bank, the whole request (counter offers), when it started and
  was accepted, and the no-cancel rule fold away under **Deal details**. An accepted deal has
  no MainButton: a bar pinned to the bottom holds **Report** (red; "Reported" once sent) and
  **Received payment** (green, with a confirm popup; "You confirmed" afterwards). The author
  answers a pending deal with MainButton **Accept** (or **Decline** below); a responder can
  **Cancel offer** while it's pending.
- **Report** — from **Report this request** on someone else's request, or **Report** on an
  accepted deal: pick a reason (request: scam / spam or fake / other; deal: didn't pay /
  stopped replying / scam / other), add an optional note (max 500 chars), MainButton **Send
  report**. Once sent, the deal screen says so instead of offering it again.
- **Admin: reports** (admins only) — Open / Resolved tabs of reports, newest first: reason,
  note, the request (and deal, with who confirmed payment), the reporter and the reported user
  (chat link, completed deals, open-report count, banned / admin tags, Telegram ID). Buttons:
  **Resolve**, and **Ban** / **Unban** for the reported user (with a confirm popup). On a deal
  report the owner also gets **Delete deal**.
- **Admin: board requests** (admins only) — every request on the board now (open, not
  expired; both directions, anyone's), newest first: what the author pays and gets, the rate,
  when it was posted and leaves, its open-report count, the author and the people waiting for
  their answer (as on reports, with profiles). **Remove from board** (with a confirm popup)
  closes it as the author's **Cancel request** would, declining whoever was waiting. Nobody is
  messaged; both sides see "Removed by an admin" on the request and deal. Requests in progress
  aren't listed (their deal can only be deleted by the owner, in All deals). Removed requests
  are listed under All deals → Cancelled.
- **Admins** (owner only) — everyone with admin rights: the owner, `ADMIN_IDS`, and those added
  in the app (only these have **Remove admin**). Add one by Telegram username (with or without
  the @; MainButton **Add admin**): it must belong to someone who has used the app or the bot.
- **Admin: all deals** (admins only) — tabs with counts, all loaded at once: **Active**
  (groups *In progress*, then *Waiting for the author's answer*; least recently changed first,
  so stale ones lead), **Completed** (groups *Last 7 days* and *Earlier*, newest first) and
  **Cancelled** (groups *Requests taken off the board* and *Declined or withdrawn offers*,
  newest first), up to 100 deals each. Every group folds under its row, like My deals'
  History (open at first; each choice remembered on the device). No
  `#id` numbers anywhere on admin screens. A deal card, styled like My deals: a status pill
  (red dot on a deal accepted over a day ago and not finished; counter offers say so) and how
  long ago it was accepted or last changed; both sides as rows (initial, name, @username, role
  *Author* / *Taker*, university and year, completed deals, Banned / open-report / Admin tags),
  each with what they pay (the taker the fixed amount, the author the other side at the rate,
  "≈" until accepted) and, on an accepted deal, whether they confirmed receiving the money;
  then the rate (locked, or now) and when it started. Tapping a person opens their page in
  Admin: users. The owner gets **Delete deal** (with a confirm popup) under active and
  completed deals. A request taken off the board early (status `closed`) shows who did it and
  how (cancelled by its author; removed by an admin; closed by a ban; closed when the owner
  deleted its accepted deal; or "not recorded" for ones closed before migration 010), when,
  what the author wanted, open reports, the author, the admin who closed it, and the people
  who had taken it (their deals were declined; a deleted deal's taker isn't listed).
- **Admin: users** (admins only) — everyone who has used the app or the bot, most recently
  seen first (up to 200; search to find others): counts on top (users, seen this week,
  reported), a search box (part of a name, @username or university, any case, or a whole
  Telegram ID) and All / Reported (open reports about them) / Banned tabs. Each row, like the
  Profile's menu: initial, name, @username, university and year, completed deals, tags, and
  when last seen (`users.last_seen_at`, refreshed at most every 5 minutes on any API request or
  bot update). Tapping one opens their page, laid out like Profile: name, @username, Profile
  complete / Banned / Admin pills, a notice if banned or without a username; counts (on the
  board, active deals, completed); *Account* (Telegram ID with Copy, Telegram name, username,
  joined, last seen, alerts, whether they added KZT / KRW receiving details — never the
  details — reports about them and reports they sent); *Profile* (the four fields); their 20
  latest deals (as in All deals) and 10 latest requests, each folding under its row as in All
  deals; **Message @username** and **Ban** /
  **Unban** (with a confirm popup; not for admins). Reports and Board requests link each
  person to their page (**User info**).
- The Board's **My deals** link shows a red badge with the number of things waiting on the
  viewer: a pending responder to answer, a payment to confirm (once the other side has
  confirmed theirs, or 3 h after the deal was accepted), or one of their requests leaving the
  board within 6 h (the in-app expiry notice). Payments to confirm also show a notice under the
  Board's top buttons ("Did you get the money?", with the same red count) that opens the deal,
  or My deals when there are several.
- A small gray "Made by @moonpie24" footer under every screen.

**Auto-refresh**: the screen on top re-fetches its data while the app is in view (paused while
it's hidden or minimized, and refreshed right away when it's back): the deal screen and My
deals every 5 s, the Board (with the My deals badge) and request details every 10 s. The deal
screen stops once the deal is completed or declined. A failed background refresh keeps what's
shown. Auth skips its write when nothing about the user changed, so polling is read-only.

Use Telegram theme params (`themeParams`, CSS vars) so the UI matches the user's
light/dark theme. Use `MainButton` for primary form actions and `BackButton`
for navigation where natural. Deep links into a screen use the Mini App `startapp`
parameter (e.g. `req_123`, `deal_45`).

## Bot messages
The bot answers `/start` (in private chats only) with a button that opens the Mini App (the
reply says whether their alerts are on and that **Alerts** on the Board changes them, and ends
with the author and a **Terms** link, no link preview), or
without one for non-members of the group (see Group members only), sets the chat menu button, and
sends alerts to those who have them on (see Alerts), and exactly three notifications, each
with an **Open deal** button (a `web_app` button whose URL carries `?startapp=deal_<id>`):
- to the author, when someone takes their request or sends a counter offer on it (the
  responder's profile tag, amount, and for a counter offer the part of it they asked for,
  direction, the responder's completed-deal count);
- to the responder, when the author accepts their deal (with the deal's amount);
- once to each side of an accepted deal that hasn't tapped **Received payment** 3 h after
  it was accepted (`deals.accepted_at`): what they pay and get, and whether the other side has
  already confirmed (then: "If it hasn't arrived, report a problem there"). A job checks every
  5 minutes; `deals.{author,responder}_reminded` records it was sent, so it's never repeated,
  even if the send failed. None while the deal has an unresolved report (it comes once that's
  resolved, if still due), and none to banned users. Deals accepted before migration 015 count
  from their last change.

They're sent in the background after the deal's transaction commits. A failed send (the user
never started or blocked the bot) is logged with the deal id and error type only, and never
fails or rolls back the action. Everything else (declines, confirmations) is shown only in the
app, on the deal screen and in My deals, with the badge on the Board. Expiry notices and
matches are in-app too.

## Alerts
- Per Board tab (`users.alerts_buy_krw` covers `KRW_KZT` requests, `alerts_buy_kzt` covers
  `KZT_KRW`). Off by default, except for someone whose first contact is the bot (their user row
  is created by a bot update, not the app): both start on. Migration 018 turned both on for
  existing users with no sign of using the app (no profile, Alerts panel never opened, no
  requests or deals). Turned on and off in the Alerts panel, any time.
  `users.alerts_seen` records that the panel was opened (the "new" dot).
- Posting a request alerts everyone with that tab's alerts on, except its author and banned
  users, and only members of the group (checked as for the API). The message reads from the
  taker's side, with an **Open request** button (`?startapp=req_<id>`):
  "Pay 500,000 ₸ → Get ≈ 1,850,000 ₩".
  Never the author's name or username.
- Once the request leaves the board (accepted for all of what's left, cancelled, removed by an
  admin, closed by a ban, or expired), every alert about it is edited: the text struck through,
  "No longer available" below it, and the button removed. Amount changes while it stays on the
  board (edits, accepted counter offers) leave alerts as they are; the button opens the current
  request. `alert_messages` keeps each sent alert (message ID and text) until then.
- One background task sends them in order, about 20 a second (under Telegram's limit of
  about 30), waiting when Telegram asks it to. It stops alerting about a request as soon as it
  leaves the board. If the bot can't message someone (blocked, never started), their alerts are
  turned off. Failures are logged with the request id and error type only. The expiry job also
  crosses out, every run, anything missed (e.g. across a restart).

## Deal flow
1. B (with a username and a full profile) opens A's request and taps **I'll take it**. The backend creates a `pending` deal
   with B's `telegram_id` taken from B's verified initData (never from the request body).
2. A sees B in My deals with Accept / Decline (under A's request card, or on the deal screen). A can have several pending responders on one request.
   Or B sends a **counter offer** instead: a pending deal for part of the request (see
   Counter offers).
3. **Accept**: deal → `accepted`, request → `in_progress` (hidden from the Board);
   other pending deals on that request → `declined`. Accepting a counter offer instead keeps
   the request on the board (see Counter offers). The deal's rate is locked at the request's
   rate at that moment (`deals.rate`), so neither side's amount moves any more.
   Both A and B get a **Message** button: `https://t.me/<current username>`, opened in the
   Mini App via `Telegram.WebApp.openTelegramLink`. They arrange the exchange privately.
   Each side also sees where to pay: the other side's receiving details for the currency
   they give (the responder gives the request's currency, its amount; the author gives the
   other one, at the rate locked on acceptance),
   with a copy button for the account number.
4. **Decline**: deal → `declined`. Or, before the author answers, B taps **Cancel offer**
   (on the deal screen or under its card in My deals, with a confirm popup): deal →
   `cancelled`, nobody is messaged, and the request stays as it is (the author's deal screen
   reads "Offer withdrawn"). B may then send a new one (rule 7), from the request or **Send a
   new offer** on the cancelled deal; the request shows how many offers they have left. Refused
   (`deal_not_pending`) once the author answered or the request left the board; only the
   responder may cancel (`not_deal_responder`).
5. Each side taps **Received payment** once the other's payment is in their account
   (sets `author_confirmed` / `responder_confirmed`; repeating it is a no-op). Once both have
   confirmed, the deal and request become `completed` (a counter offer completes alone; its
   request goes on), and both users' `completed_deals` += 1, in the same transaction.
   Whoever hasn't confirmed 3 h after acceptance gets one bot reminder (see Bot messages).
   **Report** (either side) leaves the deal `accepted` and creates a report on the
   deal for admin review; this is what's meant by a "dispute".
6. An accepted deal **can't be cancelled**: once contacts are exchanged, money may already
   have moved, and a cancel would let someone back out after being paid. It ends only when
   both sides confirm; if the other side disappears, **Report** brings in an admin. Deals
   cancelled before this rule were deleted (migration 005); the status now only means a
   responder cancelled their pending offer (step 4).
7. A user cannot take their own request, and has at most one response to it at a time
   (checked in `take_request`). They may send at most **3 offers** on a request (takes and
   counter offers, cancelled ones included; `too_many_offers`), each only once the previous
   one was cancelled, so taking and cancelling over and over can't flood the author with bot
   messages. After a decline they can't respond to the same request again: that was the
   author's answer. Accepted counter offers don't count toward any of this: that part is
   their deal, and the rest of the request is open to them like to anyone else (see Counter
   offers).
8. Closing (the author's **Cancel request**, only while `open`) or expiring a request declines
   all its pending deals. A background job marks past-due open requests `expired` every
   5 minutes; until it runs, a past-due request already shows as expired and a pending deal on
   it as declined. Requests that are `in_progress` can't be closed, edited or extended, and
   don't expire. Accepted counter offers carry on whatever happens to the rest of the request.
9. A daily job deletes `completed`, `declined` and `cancelled` deals whose last change is over
   30 days old, except deals with a report and deals on a request still `open` (a declined one
   keeps its responder from taking that request again). Users' `completed_deals` counts stay.

## Counter offers
- A request takes counter offers when its author set a minimum (`requests.min_counter_amount`,
  in the request's currency, what the author buys, at most its amount) and that minimum is
  below what's left of it.
  Every request posted before counter offers existed has none.
- A counter offer is a pending deal whose `deals.amount` is part of the request, what the
  responder pays (and the author gets): at least the minimum, at most the request's amount (asking for all of it is
  the same as taking it). A deal from **Take request** is for the request's whole amount.
  Either way it counts as the person's response to the request (Deal flow, rule 7).
- Nothing changes on the board until the author answers, in My deals as for any taker; the
  deal screen reads "Someone sent a counter offer: they offer X of the Y you're buying".
- **Accepting** a counter offer (one transaction): the deal → `accepted` (contacts and
  receiving details as usual), and the request stays `open` with its `amount` reduced by the
  deal's. Pending deals for more than what's left are declined; the others stay pending (one
  for exactly what's left is no longer partial). Accepting a deal for all of what's left
  puts the request `in_progress` as in the Deal flow. `deals.partial` records which kind an
  accepted deal is: only a deal that wasn't partial completes its request.
- Afterwards the request reads as what's left of it everywhere (Board, request, My deals); each
  deal shows its own amount, and a counter offer's deal screen is titled "Counter offer".
  `deals.request_amount` keeps the whole request a counter offer was part of (what's on the
  board while it's pending, frozen when it's accepted) for the dimmed "Whole request" line.
- The responder of an accepted counter offer sees the rest of the request as anyone does: no
  status of theirs on it, with **Counter offer** / **Take request**. Their counter offer stays
  in My deals (Active while in progress, then *Completed*).

All state transitions happen in a single DB transaction with a status check in the
`WHERE` clause (e.g. `UPDATE deals SET status='accepted' WHERE id=? AND status='pending'`),
so double taps and races between two open copies of the app are harmless.

## Identity and usernames
- Users are identified **only** by `telegram_id` (permanent). All foreign keys use it.
- `username` is a nullable, non-unique cache: refresh it from initData on every API
  request and from every bot update. If another row holds the same username,
  set that row's `username` to NULL.
- Always read the current username at render/send time; never store usernames in
  deals, requests, or messages.
- A username is required to create or take a request (the Contact link needs it).
  Explain this in the UI to users without one. Do not rely on `tg://user?id=` links.

## Profiles
- Each user fills in a first name, last name, university and year of enrollment in Profile.
  All four are needed to post or take a request (`profile_required`); browsing needs none.
  They can be edited or cleared at any time (clearing doesn't touch existing requests or deals).
- Shown to others as a tag, "First Last, University, Year" (whatever parts are filled in): to
  every member on the author's requests, and to the other side on each deal. Admins see it
  next to the Telegram details on reports, board requests, All deals and Admin: users.
- Names: letters, spaces and `-'’.`, max 40 chars; the first letter of each word (and after a
  hyphen) is capitalized on save. University: letters, digits, spaces and `-'’.&()`, max 60.
  No commas (they separate the tag's parts), links or emoji. Year: 2000 to next year.
- Unlike the Telegram `first_name` (a cache), the profile is typed by the user; it isn't
  verified.

## Group members only
- With `GROUP_ID` set, only members of that Telegram group chat can use the board: every API
  request checks membership (`getChatMember`) before anything else, and non-members get
  `not_group_member` (403) and no user row. `ADMIN_IDS` / `OWNER_ID` are always allowed.
- A confirmed member is cached for 10 minutes, but any change to someone's membership in the
  group (a `chat_member` update: joining, leaving, removal, restriction) drops them from the
  cache, so leaving ends access at once. Non-members aren't cached, so joining works on the next try. If Telegram can't be reached,
  a previously confirmed member keeps access and anyone else gets `membership_check_failed`.
- The bot is in the group as an admin with no permissions (non-admin bots may not see every
  member). It never posts there and ignores the group's messages; it only logs the group's
  ID when it's added and uses membership changes to update the cache. `/start` from a non-member gets a short "members only" reply, no button.
- Unset (`GROUP_ID=`): open to everyone, as in development.

## Trust and moderation
- Completed-deal count shown on requests and on the author's view of each responder
  (counts only when both sides confirm)
- Admins are the users in `ADMIN_IDS`, the owner (`OWNER_ID`, the author), and those the owner
  adds in the app by username (`users.admin_granted`; not banned users). Only the owner can edit
  the About page, add and remove admins (only the ones added in the app), and delete deals.
  Admins can't be banned.
- **Deleting a deal** (owner, any status; e.g. one stuck because a side disappeared), in one
  transaction: the deal is gone for both sides, with no message. An accepted deal's request is
  closed (no one else can take it; recorded as closed by the owner), unless the deal was a
  counter offer: then its request stays as it is. Reports on it stay, as reports on the request. Completed-deal
  counts don't change.
- Reports are about someone else's request (reported user: its author) or the other side of
  the reporter's accepted deal. They're stored for admin review; the reported user isn't told.
  One unresolved report per reporter per request / deal (`already_reported`), and at most 5
  reports per user per 24 h (`too_many_reports`). No bot message: admins check the app.
- A **ban** (one transaction): the user can't post or take requests, their open requests are
  closed (shown as removed by an admin), and pending deals on either side are declined. Accepted deals carry on (they end
  when both confirm). **Unban** lifts it; closed requests stay closed.
- Limits: at most 5 open requests per user and a small rate limit on creating requests, to
  keep the board clean

## API
All routes require valid initData.
- `GET  /api/me` (also `saved_kzt_bank`, the remembered preferred KZT bank) · `PATCH /api/me` (profile: `profile_first_name`, `profile_last_name`,
  `university`, `enrollment_year`; receiving details: `receive_kzt_bank`, `receive_kzt_account`,
  `receive_krw_bank`, `receive_krw_account`)
- `PATCH /api/me/alerts` (`buy_krw` / `buy_kzt`: turn a tab's alerts on or off; any call,
  even an empty one, marks the Alerts panel seen)
- `GET  /api/rate`
- `GET  /api/requests` (filters as query params)
- `POST /api/requests` (`min_counter_amount` optional: null turns counter offers off;
  `kzt_bank` optional; `remember_kzt_bank`: true remembers `kzt_bank` for the next request,
  false forgets the remembered one, left out leaves it)
- `GET  /api/requests/{id}` (with the viewer's latest response, `my_deal_id` /
  `my_deal_status`, and `offers_left`: how many more they may send; null on their own)
- `PATCH /api/requests/{id}` (author only, `open` only: `amount` /
  `min_counter_amount` (null turns them off) / `kzt_bank` (null or empty removes it) to edit, `extend_days` (1 or 3) to extend)
- `POST /api/requests/{id}/close` ("Cancel request"; author only, `open` requests only)
- `GET  /api/my/requests` (the caller's requests on the board, then those expired in the last
  24 h; each with `pending_count`, which only the author sees)
- `POST /api/requests/{id}/take` (creates a pending deal for the caller)
- `POST /api/requests/{id}/counter` (`{amount}`: a pending deal for part of the request)
- `POST /api/requests/{id}/report` (`{category, note}`; not the author)
- `GET  /api/my/deals`
- `GET  /api/deals/{id}` (participants only; used by the `deal_45` deep link)
- `POST /api/deals/{id}/accept` | `/decline` (request author only)
- `POST /api/deals/{id}/cancel` ("Cancel offer"; the responder only, `pending` deals only)
- `POST /api/deals/{id}/confirm` ("Received payment"; deal participants only)
- `POST /api/deals/{id}/report` ("Report" on a deal; participants, `accepted` deals only)
- `GET  /api/deals/{id}/contact` (returns the other side's current `t.me` link and their
  receiving details (`pay_bank`, `pay_account`) for the currency the caller pays; only when the deal is `accepted` or
  `completed` and the caller is a participant)
- `GET  /api/requests/{id}/matches` (author only; empty once the request is off the board)
- `GET  /api/about` (the donate section)
- Admin only: `GET /api/admin/reports?resolved=false|true`, `POST /api/admin/reports/{id}/resolve`,
  `POST /api/admin/users/{id}/ban` | `/unban`, `GET /api/admin/requests` (board requests),
  `POST /api/admin/requests/{id}/remove`, `GET /api/admin/requests/cancelled`,
  `GET /api/admin/deals?state=active|completed|cancelled`, `GET /api/admin/users?q=&show=all|reported|banned`
  (`{users, total, seen_this_week, reported, banned}`), `GET /api/admin/users/{id}`
- Owner only: `PUT /api/admin/about` (`{donate_note, donate_options: [{label, value}]}`),
  `GET /api/admin/admins`, `POST /api/admin/admins` (`{username}`), `DELETE /api/admin/admins/{id}`,
  `DELETE /api/admin/deals/{id}`

Errors return `{"detail": "<machine_code>"}` with a proper HTTP status; the frontend maps
codes to strings in `i18n.ts`.
