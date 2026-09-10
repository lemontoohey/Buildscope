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
