# Owner-Build Tracker

*(Working name — not final.)*

A zero-dependency owner-build tracker: budget ledger, receipts, documents, materials/BOQ, schedule, trades directory, compliance checklists, plan takeoff and site diary, with optional AI-assisted receipt parsing and plan measuring. Built for someone project-managing their own build (or a small owner-builder/small-builder outfit) who wants one place for the budget, the paperwork, and the schedule instead of juggling spreadsheets, a shared drive, and text threads with trades.

## Why this has zero npm dependencies

Everything here runs on what's built into Node.js 22+: the `node:sqlite` database, the global `fetch` for calling an AI provider's API, and a hand-rolled HTTP router instead of a framework. That means:

- `npm install` — **not needed**. There's nothing to install.
- No version drift, no `node_modules`, no supply-chain surface to worry about.
- Styling comes from the Tailwind CDN script tag loaded in the browser, not a build step.

This was a deliberate choice — it makes the tool trivial to run and hand off. If it ever needs a real framework (React, Postgres/Supabase, etc.), that's a rewrite of specific files, not a rethink of the whole approach.

## Running it

Requires Node.js 22.5 or newer (check with `node -v`).

```bash
cd owner-build-tracker
node server.js
```

Then open http://localhost:3000

For auto-restart on file changes during development:

```bash
node --watch server.js
```

## Signing in

Buildscope requires signing in before it shows anything — with an email and password (works immediately, no setup), or with Google or Apple if you set those up too. Each signed-in person gets their own separate account with its own budget, diary, materials, schedule, everything: nobody else who signs in can see it. Under the hood this is one shared app (still just SQLite, still zero extra infrastructure) with every table scoped to whoever's logged in — see `lib/store.js` and `lib/tenant-tables.js` if you want the details.

**The very first person to sign in claims whatever build data already exists** in `data/app.db` (if you were using this single-user, before accounts existed, that data didn't just vanish — it's parked under an unclaimed account until someone signs in). So sign in yourself first, before sharing the login link with anyone else — the second and third person to sign in each get a brand-new, empty build, seeded the same way a fresh install always has been (default categories, stages, compliance checklist).

Email + password works with no setup at all — see below. Google and Apple are optional extras on top of it.

### Email + password sign-in

Always on, no configuration needed — this is what makes it possible for someone to use Buildscope without you (the person running the deployment) having anything set up for them, e.g. if you haven't got Google/Apple sign-in configured or can't afford to keep an Apple Developer Program subscription running. Anyone can create an account from the **Create an account** link on the sign-in page with just an email and password (minimum 8 characters).

Two things this doesn't have, worth knowing about given it's just three people using this: there's no "forgot password" flow (if someone forgets theirs, you'd need to reset it by hand in `data/app.db`), and there's no rate-limiting on login attempts. Both are fine at this scale, but wouldn't be if this app ever had a public sign-up page and a larger, unfamiliar user base.

### Setting up Google sign-in

If you've already set up "Connect Google Drive" (below), this is one extra step, not a whole new project:

1. In the same Google Cloud Console OAuth client you created for Drive, add one more entry under **Authorized redirect URIs**: `http://localhost:3000/auth/google/callback` (and your live URL's equivalent once you have one, e.g. `https://buildscope-zyeh.onrender.com/auth/google/callback`).
2. `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` in `.env` are reused as-is — no new keys needed.
3. Only set `GOOGLE_LOGIN_REDIRECT_URI` in `.env` if you're not running on `localhost:3000` — it must exactly match the redirect URI you just added in step 1.

If you haven't set up Google Drive at all yet, follow "Turning on the Google Drive option" below first — it creates the same `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` this needs too.

### Turning on Apple Sign-In

This one needs its own one-time setup in Apple's developer portal, and an Apple Developer Program membership (US$99/year) if you don't already have one:

1. Go to https://developer.account.apple.com and enrol in the Apple Developer Program if you haven't already.
2. **Certificates, Identifiers & Profiles → Identifiers → +** → register an **App ID** for this app if you don't have one (any bundle-style identifier, e.g. `com.buildscope.app`), with "Sign In with Apple" checked under Capabilities.
3. **Identifiers → +** again → this time choose **Services IDs** → register one (e.g. `com.buildscope.login`) → this is your `APPLE_SERVICES_ID`. Configure it for "Sign In with Apple," and under its domains/return URLs add your domain and `https://<your-live-url>/auth/apple/callback` (Apple requires a real HTTPS domain here — `localhost` won't validate, so local testing of the Apple button specifically has to wait until you have a live URL).
4. **Keys → +** → check "Sign In with Apple" → create it. Download the `.p8` file it gives you **immediately — Apple only lets you download it once.** Note the Key ID shown next to it — that's your `APPLE_KEY_ID`.
5. Your Team ID (`APPLE_TEAM_ID`) is shown at the top right of the developer portal on every page.
6. Set all four in `.env` (or your host's environment variables): `APPLE_TEAM_ID`, `APPLE_SERVICES_ID`, `APPLE_KEY_ID`, and `APPLE_PRIVATE_KEY` (the full contents of the `.p8` file — if your host's env var UI collapses newlines, single-line it with literal `\n` sequences; the code un-escapes those automatically).
7. Set `APPLE_LOGIN_REDIRECT_URI` to your live URL's callback, matching step 3 exactly.

Until all four `APPLE_*` variables are set, the Apple button simply doesn't appear on the sign-in page — nothing breaks, sign-in just falls back to Google (if that's configured) and email + password (which always works).

## Turning on AI receipt parsing (and plan takeoff, diary assistant, estimate review)

Easiest way: open the app, go to **Settings**, pick a provider (Anthropic or OpenAI), and paste in your own API key. It works immediately — no restart, no file editing.

(You can also set `ANTHROPIC_API_KEY`/`OPENAI_API_KEY` in `.env` instead if you prefer — see `.env.example` — but the Settings page is simpler for most people.)

Without a key, the "Add receipt" screen still files the upload into the documents vault — you just fill in the transaction details yourself instead of having them read automatically. The same goes for every other AI-assisted feature: it's an optional convenience, never a dependency.

**Every AI-extracted result is shown to you before anything is saved.** Nothing is written to the budget, BOQ, or diary automatically — check the "estimate — confirm before saving" banner and the confidence rating on the confirm screen before hitting save.

## Where your data lives

Go to **Settings** in the app to choose. There are two options shown by default, and you can switch between them at any point without losing anything:

- **This computer only** — the default. No setup. Everything lives in a file on this computer (`data/app.db`). Nothing to connect, nothing that can leak, but it doesn't back up anywhere by itself.
- **Google Drive** — click "Connect Google Drive," sign in with your own Google account, done. Your data is saved as one file in your own Drive. This app can only ever see that one file — nothing else in your Drive. The trade-off: if you open the app on two computers at the same time, the second one to save wins (there's no merge) — fine for one person editing from one place at a time, not built for simultaneous multi-device editing.

(A Supabase/Postgres backend is also built in — `supabase/schema.sql` and the `store` code both still work — but it isn't shown as an option on the Settings page, to keep the choice simple day to day. If you ever want it back, it's a couple of lines in `routes/settings.js`.)

**Now that several accounts share this one app, treat the backend-switch buttons on Settings with care.** They still work exactly as before, but they change the *whole app's* backend for *every* signed-in account at once, not just the account clicking the button — the per-account isolation described in "Signing in" above applies to the tenant-data tables inside whichever backend is active, not to which backend is active. In practice: leave it on "This computer only" (the shared SQLite file, which is what per-account scoping was actually built and tested against) unless you've thought through what switching means for everyone else's data too.

Uploaded files (receipts, approvals, contracts, etc.) follow the same choice: on "This computer only" they're saved in `data/documents/`; on Google Drive they're uploaded there too, so they survive a server restart.

`data/` is gitignored regardless of backend. If you're using "This computer only," **back it up yourself** — copy `data/` somewhere safe periodically (Time Machine, a synced folder, whatever you already use).

### Turning on the Google Drive option

The "Connect Google Drive" button only appears once whoever's running this app has done this once, in a free Google Cloud account:

1. Go to https://console.cloud.google.com, create a project (any name).
2. **APIs & Services → Enabled APIs** → enable the "Google Drive API".
3. **APIs & Services → OAuth consent screen** → choose "External," fill in an app name and your email, and add yourself as a test user (this keeps it out of Google's review process — fine for a personal tool).
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID** → application type "Web application" → under "Authorized redirect URIs" add `http://localhost:3000/oauth/google/callback`.
5. Copy the Client ID and Client Secret it gives you into `.env` as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, then restart the server once.

After that one-time setup, anyone using the app just clicks "Connect Google Drive" and signs in — no keys, no console, no technical steps on their end.

### Turning on the Xero accounting sync option

Separate from where this app's own data lives — this is about pushing transactions out to Xero as bills, for whoever's actually doing the bookkeeping. Once set up, a "→ Xero" button appears next to recent transactions on the Dashboard.

1. Go to https://developer.xero.com/app/manage and create a new app (type "Web app").
2. Set the redirect URI to `http://localhost:3000/oauth/xero/callback` (or your live URL's equivalent, once you have one).
3. Copy the Client ID and Client Secret into `.env` as `XERO_CLIENT_ID` and `XERO_CLIENT_SECRET`, then restart the server once.
4. On the Settings page, click "Connect Xero" and authorise the organisation you want to sync to.
5. Optional: set `XERO_DEFAULT_ACCOUNT_CODE` in `.env` to an account code that already exists in that organisation's chart of accounts — otherwise bills land coded to Xero's own default "429 — General Expenses".

This is scaffolding, not a finished two-way sync: it pushes one direction only (a transaction becomes a Xero bill, "ACCPAY"), and it doesn't try to guess GST treatment (bills land with `LineAmountTypes: NoTax` so your accountant codes tax properly in Xero itself).

## What's here

- **Budget ledger** — categories seeded as a generic starting point for an Australian owner-build, budgeted vs. spent per category, editable (add, rename, delete freely).
- **Receipt upload with AI parsing** that pre-fills a transaction for you to confirm.
- **Documents vault** with category tags (DA/council, BASIX, bushfire, contract, insurance, certificates, warranties, etc.).
- **Site diary** — dated entries with trades, work done, and an issues/delays field. Installable, offline-capable (PWA): keeps working with no signal on site and syncs once you're back online.
- **Materials & quantities (BOQ)** — line items by category, order status (not ordered → ordered → delivered → installed), and per-item supplier quote comparison so you can see who's cheapest at a glance.
- **Materials calculators** — plasterboard/cladding sheets, roof sheeting, tiles, paint, concrete volume, and timber studs/fence post counts, from plain measurements (no AI needed). Each gives a one-click "add to materials list."
- **Schedule** — the standard 14-stage build sequence (site establishment through final inspections), with planned vs. actual dates per stage. Anything past its planned end date and not marked done shows as "Overdue"; anything finished after its planned end shows as "Done (late)". Also drawn as a waterfall chart of planned vs. actual.
- **Trades & suppliers directory** — contact details, licence numbers, and insurance expiry, auto-flagged amber inside 30 days and red once lapsed, with a warning banner on the dashboard for anything lapsed.
- **Compliance checklist** — seeded as a generic starting point covering DA/council sign-offs, BASIX commitments, bushfire (BAL) requirements, pool safety, and on-site wastewater/septic commissioning. Click to check off; add your own items under any regime, or delete what doesn't apply to your build.
- **Plan Measure** — upload a plan PDF, scale it against a known dimension, and click/trace off lengths/areas straight from the drawing; send a measurement to Materials or into a Formulate recipe.
- **Formulate** — link a BOQ quantity to a recipe (e.g. beam length × depth × footing count = concrete volume) instead of typing it in by hand.
- **Price Book** — a per-supplier pricing database to check BOQ items against.
- **Job Estimator** — for pricing custom/non-standard jobs, where a catalogue of "standard" assemblies doesn't hold: a library of your own past jobs (floor area, construction type, quality level, site conditions, and what they actually cost, broken down by category), and a matching engine that prices a new draft job by weighing it against the past jobs most like it — no AI call, no training step, every figure traceable back to a named past job. Mark a job "Completed" once it's built and its real costs are in, and it joins the library the very next estimate can learn from. Seeded with six invented demo jobs to show how it works — replace them with real ones as you go (see `lib/estimator-seed.js`).
- **AI plan takeoff** — feed it plan pages and it drafts a starting BOQ (floor/roof area, a glazing list, big-ticket volumes); every line is tagged "estimate — confirm before ordering."
- **AI diary assistant** — talk or type a rough note and it structures it into a proper entry, auto-fills the weather, and flags anything that reads like a delay.
- **Photo & Media Log** — timestamped photos linked to diary/schedule/BOQ items, with a defect flag for the handover punch-list.
- **Purchase orders** — turn ticked Materials lines into a formal, printable PO per supplier, with its own status (draft → sent → confirmed), and an attachable digital signature.
- **AI estimate reviewer** on the Dashboard — run-on-demand check that cross-references your budget, BOQ, and compliance data for gaps, surfaced by severity.
- **Client selections** — track choices that aren't locked in yet (tiles, tapware, colours) with a few candidate options each, optionally linked to a BOQ line.
- **Digital signatures** — a simple draw-and-save signature pad, attachable to a purchase order.
- **Xero accounting sync (scaffolding)** — push a transaction to Xero as a bill once connected; see "Turning on the Xero accounting sync option" above. Needs its own Xero Developer app credentials to actually use.
- **Quick answers** on the dashboard — total spent, categories over budget, biggest spend category, build progress, compliance remaining, materials not yet ordered, next unstarted schedule stage — computed directly from your data, no AI needed.
- **Settings page** — pick your AI provider and paste in your own API key (not tied to any one account); choose where your data lives (this computer or your own Google Drive) and switch between them without losing anything, all without editing a single file.

Not built yet:
- Two-way Xero sync (pulling paid/reconciled status back from Xero) — currently one direction only (push).
- Progress payment / drawdown tracking against a construction loan.

## Troubleshooting: "disk I/O error" from SQLite

If `node server.js` fails on startup with `Error: disk I/O error` / `ERR_SQLITE_ERROR`, it's almost always because the project folder sits somewhere that doesn't give SQLite proper file locking — a cloud-synced folder (iCloud Drive's "Desktop & Documents" sync is the common culprit on a Mac), a network share, or a bridged/virtual mount. SQLite needs a real local disk under it.

Fix: move the whole `owner-build-tracker` folder somewhere plain and local — e.g. `~/Dev/owner-build-tracker` — and run it from there instead of Desktop. This has nothing to do with the code; it's purely about where the `data/app.db` file physically lives.
