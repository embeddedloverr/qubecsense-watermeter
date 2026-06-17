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

## 🔁 Re-seeding / updating flats

`npm run seed` is **idempotent** — it upserts flats (won't duplicate) and only
creates the admin/technician if they don't already exist. To replace the flat list,
edit `src/data/flats.json` and re-run the seed.

---

## 🛡️ Notes

- Each flat can be installed **once** (enforced by a unique index). Remove the
  unique index in `src/lib/models/Installation.ts` if re-installs should be allowed.
- Change the seeded passwords and `AUTH_SECRET` before any real deployment.
