# QubecSense · Water Meter Installation PWA

A mobile-first **Progressive Web App** for QubecSense field technicians to record
water meter installations (kitchen + bathroom meters per flat), capture compressed
on-site photos and the owner's signature, and for admins to monitor progress and
plan the installation schedule.

Built with **Next.js 14 (App Router) + TypeScript + Tailwind CSS + MongoDB (Mongoose)**.

---

## ✨ Features

**Technician**
- Secure login
- Home dashboard: personal stats + assigned (scheduled) flats
- Guided installation form:
  - Searchable **flat dropdown** (200 flats preloaded with owner name + contact)
  - Installation date
  - **Kitchen meter**: serial number + camera photo
  - **Bathroom meter**: serial number + camera photo
  - Remarks
  - **Owner confirmation** checkbox + **signature pad**
  - Photos are compressed **on the device and again on the server**

**Admin**
- Overview dashboard with KPIs, progress bar, and charts
  (installations per day, by technician)
- All installation **records** with meter photos + signature, searchable, **CSV export**
- **Schedule planner**: assign pending flats to a technician by date
- **Team management**: create technician accounts

**Platform**
- Installable PWA (offline shell, app icon, standalone display)
- Light / dark mode
- Accessible, 44px touch targets, mobile bottom-nav + desktop top-nav

---

## 🧱 Prerequisites

1. **Node.js 18.18+ or 20+** — <https://nodejs.org> (LTS recommended)
2. **MongoDB** — either:
   - Local: install MongoDB Community Server and run `mongod`, or
   - Cloud: a free **MongoDB Atlas** cluster (get a connection string)

Check Node is installed:

```bash
node -v
npm -v
```

---

## 🚀 Setup

```bash
# 1. Install dependencies
npm install

# 2. Create your environment file
#    (Windows PowerShell)
copy .env.example .env
#    (macOS/Linux)
cp .env.example .env
```

Edit **`.env`** and set at least:

```ini
MONGODB_URI=mongodb://127.0.0.1:27017/qubecsense   # or your Atlas URI
AUTH_SECRET=<paste a long random string>
```

Generate a strong secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

```bash
# 3. Seed the database: imports the 200 flats + creates admin & technician logins
npm run seed

# 4. Start the dev server
npm run dev
```

Open <http://localhost:3000>.

### Default logins (from `.env`, change after first use)

| Role       | Email                   | Password   |
|------------|-------------------------|------------|
| Admin      | `admin@qubecsense.com`  | `admin123` |
| Technician | `tech@qubecsense.com`   | `tech123`  |

> Add more technicians from **Admin → Team**.

---

## 🏗️ Production build

```bash
npm run build
npm start
```

The PWA service worker is **enabled only in production builds** (disabled in dev to
avoid caching headaches). To install the app: open it in Chrome/Edge/Safari and
choose **Install app / Add to Home Screen**.

---

## 📁 Project structure

```
src/
├─ app/
│  ├─ login/                  # Login page (technician + admin)
│  ├─ (app)/
│  │  ├─ technician/          # Technician home + new installation form
│  │  └─ admin/               # Overview, installations, schedule, technicians
│  └─ api/                    # Route handlers (auth, flats, installations, photos…)
├─ components/                # UI primitives, form widgets, charts, app shell
├─ lib/
│  ├─ db.ts                   # Mongoose connection (cached)
│  ├─ auth.ts / session.ts    # JWT session + password hashing
│  ├─ image.ts                # Server-side sharp compression
│  └─ models/                 # User, Flat, Installation, Photo, Schedule
└─ data/flats.json            # 200 flats (number, owner, email, phone)

scripts/seed.mjs              # DB seeding (flats + users)
public/                       # PWA manifest + icons
```

---

## 🔧 How data & photos are stored

- **MongoDB** holds flats, users, installations, schedule entries.
- **Photos & signatures** are compressed (JPEG ~68% / downscaled to ≤1280px) and
  stored as binary in the `photos` collection, served on demand through
  `/api/photos/[id]` (auth-protected). This keeps everything inside MongoDB —
  no external file storage needed.

To switch to filesystem or S3 storage later, change `src/lib/image.ts` +
`src/app/api/installations/route.ts` (where photos are persisted) and the
`/api/photos/[id]` reader.

---

## 👤 Resident logins (one per flat)

`npm run seed` also creates a **resident account per flat**:

- **Username:** `rosalyn_<flatNumber>` (prefix configurable via `RESIDENT_USERNAME_PREFIX`)
- **Password:** random one-time password (`RESIDENT_PASSWORD_LENGTH`, default 10)
- Residents must **change the password on first login** before they can use the app
- They land on `/resident` — their own flat's consumption, bill and meters only

Newly created credentials are written to **`resident-credentials-<timestamp>.csv`
in the project root** (gitignored). The seed prints the absolute path.

> ⚠️ The CSV is only written for residents **created on that run**. Re-running
> the seed after the accounts exist prints `0 created` and writes **no CSV** —
> stored passwords are bcrypt hashes and cannot be recovered.

### Lost the CSV? Re-issue passwords

```bash
npm run reset:residents               # only residents who never set their own
                                      # password (safe default) → new CSV
npm run reset:residents -- --all      # every resident, including those who
                                      # already chose their own password
npm run reset:residents -- --flat=101,102   # specific flats
```

Every reset account is flagged to change its password again on next login.
The default deliberately skips residents who already set their own password,
so re-issuing does not lock out people who are already using the app.

## 📖 Resident guide (PDF)

`QubecSense-Resident-Guide.pdf` in the project root is a ready-to-hand-out
SOP for residents: first sign-in, setting their own password, and every
section of their dashboard explained in plain language with screenshots.

To regenerate it after UI changes — the dev server must be running:

```bash
npm run dev                                   # in one terminal
BASE_URL=http://localhost:3000 npm run guide  # in another
```

It drives a real browser (via `puppeteer-core`, using the Chrome/Edge
already installed — set `CHROME_PATH` if it isn't found), creates a
throwaway resident account, walks the first-login journey, screenshots each
screen, then deletes the account.

Screenshots are anonymised — the sample flat and owner name replace the real
ones, and the script **aborts** if any real detail is still visible, so the
guide is safe to circulate. Set `GUIDE_PREVIEW=1` to also emit a
`guide-preview.png` of the whole document.

## 🧾 Billing

**Admin → Billing** prices consumption from meter **totalizer deltas** —
nudron-dashboard's `/api/v1/flat-consumption/*` endpoints — rather than the
intraday sums the live meter table shows, so a bill is never a rounding
artifact of how packets happened to bucket through the day. This also
removed the old 92-day/3-month lookback limit: a cycle or range can reach as
far back as the meters have data.

Two anomalies are called out explicitly rather than silently folded into the
number: `no_reading_in_period` (nothing to compute from) and
`totalizer_decreased` (almost always a meter reset or replacement, not
negative consumption) — both mark that flat's bill `Incomplete`, and its
consumption shows as "No data" rather than a fabricated `0 L`.

**Period** — two ways to pick what a report covers:
- **Cycle** — the recurring monthly bill. Defaults to the calendar month; set
  **Billing cycle start day** in the tariff card for a different cycle, e.g.
  the 5th of each month through the 4th of the next. Day 1 (the default) is
  unchanged behaviour. Capped at day 28 so the cycle length never shifts
  between months depending on how many days that month has.
- **Range** — a one-off bill for exact dates, independent of the cycle
  setting. Use this for anything the cycle can't express, e.g. billing 25 Jun
  through 25 Jul inclusive (a cycle "start day" always closes the day *before*
  its start day next month, so it can't produce that exact span).

**Export** — three formats, pick whichever shape the task needs:
- **Flat-wise CSV** — one row per **flat**: consumption, slab breakdown,
  fixed charge, total. For spreadsheet work — sorting, filtering, a pivot
  table, importing into accounting software.
- **Meter-wise CSV** — one row per **meter**, with device ID and the
  **totalizer** start/end readings and dates the bill was computed from — an
  audit trail for a specific flat's bill, not just a total.
- **PDF** — summary report, one row per flat, dynamically generated so the
  PDF library never loads unless you export.

A flat with no reading in the period shows "No data" rather than a
fabricated "0 L" in all three — its fixed charge still applies, but the
figure isn't presented as a real measurement it isn't.

**Progress indicators** — a bar showing how far into the current period today
falls (e.g. "Day 5 of 31 · 16%"), so a small total early in a cycle reads as
"not finished yet" rather than a broken report. Each flat also gets a mini
usage bar against the tariff's first (cheapest) slab — like a data plan's
usage meter — turning red past 100% once they've moved into the pricier
slab. Hidden when the first slab has no limit (a flat per-litre tariff has
no "allowance" to show progress against).

**Search and filter** — search by flat number or owner name, plus status
chips: **Incomplete** and **Over allowance** (crossed into the tariff's
second slab; hidden when the first slab has no limit). Both narrow the
table, its own footer total, and all three exports together, and compose —
search "1" with Incomplete active shows only incomplete flats whose number
contains "1". The KPI cards deliberately stay on the whole period
regardless of any filter. A chip with a zero count is disabled rather than
offering an empty result.

**Share one flat's bill** — open a row's **Bill** modal for:
- **Email bill** — sends the bill as a PDF attachment to the flat's saved
  owner email, via the same `SMTP_*` config as OTP/chat email. Rebuilt
  entirely server-side from the flat number and period (never from anything
  the browser sends), so the emailed figure can't be tampered with in
  transit. Disabled with an explanation when the flat has no email on file.
- **Share PDF / Share image** — generates the bill as a file and opens the
  device's native share sheet (Web Share API) so the admin picks WhatsApp,
  Mail, or anything else installed, with the file already attached. Falls
  back to a plain download on browsers/OS without share-sheet support.
  There's no WhatsApp Business API integration here — this is the browser
  handing off to whatever's installed, not an automated send.

## 💬 Resident ↔ admin chat

Each flat has one conversation thread, reachable from the resident dashboard
("Contact the manager") and from **Admin → Messages**. Either side can attach
**one photo per message**, and a photo with no text is a valid message.

- Images are downscaled in the browser, then re-encoded server-side to JPEG at
  ≤1600px. Re-encoding is also the sanitiser — whatever is uploaded, what gets
  stored and served is a plain JPEG.
- Bytes live in the `messageattachments` collection (not `photos`, which is
  staff-only) and are served through `/api/messages/attachment/[id]`.
  **A resident may only read attachments on their own flat's thread**; an
  admin needs the `messaging` capability and the matching site.
- Tapping a photo opens a full-screen viewer with zoom and "Open full size".

Attachments are stored in MongoDB like the meter photos, so they count towards
database size — roughly 150–400 KB each after compression.

## 🔔 Usage alerts (resident water budgets)

Residents can set a **weekly or monthly water limit** on their dashboard and
get an email when their flat goes over it. Delivery uses the same `SMTP_*`
config as the other emails.

The alert emails are sent by a cron endpoint — run it on a schedule (e.g.
once a day) on the server:

```bash
# add to crontab (adjust the URL); needs CRON_SECRET set in .env
0 8 * * *  curl -fsS "https://meters.qubecsense.com/api/cron/budget-alerts?key=YOUR_CRON_SECRET" >/dev/null
```

The endpoint (`GET|POST /api/cron/budget-alerts`) is authorised by the
`x-cron-key` header / `?key=` matching `CRON_SECRET`, or by an admin session.
It checks every resident with an active budget, and emails each one **once
per period** while they remain over the limit (a new week/month re-arms the
alert). Changing or toggling the alert also re-arms it.

## 🏢 Multi-site migration

The app is being moved from a single hardcoded building to multiple **sites**
(Rosalyn-21 becomes site #1). Every tenant document carries a `siteId`.

Run the migration **before** deploying site-scoped code — the backfill is inert
against older code, but scoped code against un-backfilled data matches nothing:

```bash
mongodump --uri="$MONGODB_URI" --out=./backup-$(date +%F)   # always first

npm run migrate:multisite -- --phase=data                   # dry run, prints counts
npm run migrate:multisite -- --phase=data --apply           # backfill siteId
npm run migrate:multisite -- --phase=indexes --apply        # create compound indexes

git pull && npm run build && pm2 restart qubecsense         # then deploy
```

`--phase=data` creates the default site from the current env (`SITE_NAME`,
`SITE_SLUG`, `SITE_PROJECT`, `RESIDENT_USERNAME_PREFIX`), captures
`DATA_API_URL`/`DATA_API_KEY` onto it (the key encrypted at rest), backfills
every collection, and grants existing admins all capabilities. It is
**idempotent** — re-running changes nothing.

Index policy is **create-then-drop**: the legacy global unique indexes stay in
place alongside the new compound ones, which is safe while there is one site.
Only immediately before onboarding site #2:

```bash
npm run migrate:multisite -- --phase=drop-legacy --apply --confirm=rosalyn-21
```

That step refuses to run unless the replacement compound indexes already exist.

### Onboarding a second site

1. **Superadmin → Sites → New site.** Give it a name and a **unique username
   prefix** (this is what keeps `rosalyn_101` and `greenwood_101` distinct, and
   it cannot be changed later). Add its own `dataApiUrl`/`dataApiKey` and use
   **Test connection**.
2. **Site → Flats.** Paste a CSV (`Flat, Owner, Email, Phone`), **Preview**,
   then **Import**. This creates the flats and their resident logins in one
   step — the server-side equivalent of `npm run seed`, scoped to that site.
   Re-importing updates rather than duplicating.
3. **Superadmin → Admins.** Create the site's admin and tick their capabilities.

> Each site needs its **own** meter-data credentials. The shared `DATA_API_*`
> env fallback applies **only while a single site exists**; with two or more,
> a site without its own key reports "unconfigured" rather than silently
> showing another site's meters.

## 👑 Superadmin

The superadmin sits above sites: they create and monitor buildings and control
what each site admin may do.

```bash
npm run create:superadmin -- --email=you@example.com --name="Your Name"
```

With no `--password` a strong one is generated and printed once. A superadmin
has **no home site** — they pick one from the dashboard.

At **/superadmin**:

- **Overview** — every site in one view: flats, residents, meters reporting,
  silent meters, last data received, consumption and billing month-to-date,
  unread messages, and an API-health pill per site. One upstream call per site,
  run with `Promise.allSettled` so a single bad key degrades that row rather
  than blanking the page.
- **Sites** — create a site (name, slug, resident username prefix, its own
  `dataApiUrl` + `dataApiKey`), edit settings, and **Test connection** before
  trusting the credentials. The API key is encrypted at rest and only ever
  shown masked.
- **Per-site view** — **Records** and **Technicians** live here, rendered by
  the very same components the site admin sees.
- **Admins** — a capability grid per admin per site: *Live data, Exports,
  Billing, Residents, Messaging, Records, Schedule, Technicians*. Toggling one
  takes effect immediately (capabilities are re-read from the database on every
  request, not trusted from the session token).

**Open site** re-mints the session with that site's context and drops the
superadmin into the normal admin UI, with an amber banner showing which site
they are in and an **Exit** button.

> A site admin still sees Records and Technicians in their own nav **if granted**
> those capabilities — the superadmin view is an addition, not a move away.

## 🔁 Re-seeding / updating flats

`npm run seed` is **idempotent** — it upserts flats (won't duplicate) and only
creates the admin/technician if they don't already exist. To replace the flat list,
edit `src/data/flats.json` and re-run the seed.

---

## 🛡️ Notes

- Each flat can be installed **once** (enforced by a unique index). Remove the
  unique index in `src/lib/models/Installation.ts` if re-installs should be allowed.
- Change the seeded passwords and `AUTH_SECRET` before any real deployment.
