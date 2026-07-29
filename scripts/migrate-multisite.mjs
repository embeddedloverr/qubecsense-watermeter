// Multi-site migration. Assigns all existing data to a default site, then
// manages the index cutover. Idempotent and safe to re-run.
//
//   node scripts/migrate-multisite.mjs --phase=data            # dry run
//   node scripts/migrate-multisite.mjs --phase=data --apply
//   node scripts/migrate-multisite.mjs --phase=indexes --apply
//   node scripts/migrate-multisite.mjs --phase=drop-legacy --apply --confirm=<slug>
//
// ORDER MATTERS, and it is not symmetric:
//   Run --phase=data BEFORE deploying site-scoped code. The backfill is inert
//   against the current code (an extra field nobody reads), but scoped code
//   against un-backfilled data matches zero documents and the app looks wiped.
//
// Index policy is CREATE-THEN-DROP. Phases data/indexes leave the legacy
// global unique indexes in place; with a single site they and the new compound
// indexes are simultaneously satisfiable, so nothing breaks. Only run
// --phase=drop-legacy immediately before creating site #2.
import "dotenv/config";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import mongoose from "mongoose";

const {
  MONGODB_URI,
  DATA_API_URL,
  DATA_API_KEY,
  ADMIN_NOTIFY_EMAIL,
  RESIDENT_USERNAME_PREFIX = "rosalyn",
  SITE_SECRET_KEY,
  AUTH_SECRET,
  SITE_NAME = "Rosalyn-21",
  SITE_SLUG = "rosalyn-21",
  SITE_PROJECT = "Regency Anantam",
} = process.env;

if (!MONGODB_URI) {
  console.error("✗ MONGODB_URI is not set.");
  process.exit(1);
}

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const phase = (args.find((a) => a.startsWith("--phase=")) || "--phase=data").split("=")[1];
const confirm = (args.find((a) => a.startsWith("--confirm=")) || "").split("=")[1];

// Mirror of encryptSecret() in src/lib/crypto.ts — keep the two in step.
function encryptSecret(plain) {
  if (!plain) return "";
  const secret = SITE_SECRET_KEY || AUTH_SECRET;
  if (!secret) throw new Error("Set SITE_SECRET_KEY or AUTH_SECRET to store the data API key.");
  const key = createHash("sha256").update(secret).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), enc.toString("base64url")].join(":");
}

// Collections carrying tenant data, and how each finds its site.
const TENANT_COLLECTIONS = [
  "flats",
  "users",
  "installations",
  "schedules",
  "messages",
  "tariffs",
  "photos",
];

const ALL_CAPABILITIES = [
  "view_data",
  "exports",
  "billing",
  "residents",
  "messaging",
  "records",
  "schedule",
  "technicians",
];

const log = (...a) => console.log(...a);
const dry = () => (apply ? "" : "  [dry run]");

async function ensureSite(db) {
  const sites = db.collection("sites");
  const existing = await sites.findOne({ slug: SITE_SLUG });
  if (existing) {
    log(`• Site already exists: ${existing.name} (${existing.slug})  _id=${existing._id}`);
    return existing;
  }

  const doc = {
    name: SITE_NAME,
    slug: SITE_SLUG,
    project: SITE_PROJECT,
    building: SITE_NAME,
    dataApiUrl: DATA_API_URL || "",
    dataApiKey: DATA_API_KEY ? encryptSecret(DATA_API_KEY) : "",
    residentUsernamePrefix: RESIDENT_USERNAME_PREFIX.toLowerCase(),
    timezone: "Asia/Kolkata",
    currency: "INR",
    adminNotifyEmail: (ADMIN_NOTIFY_EMAIL || "").toLowerCase(),
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  log(`→ Will create site: ${doc.name} (${doc.slug})`);
  log(`    project=${doc.project}  prefix=${doc.residentUsernamePrefix}`);
  log(`    dataApiUrl=${doc.dataApiUrl || "(none)"}  dataApiKey=${doc.dataApiKey ? "(captured from env, encrypted)" : "(none)"}`);
  if (!apply) return { _id: "(pending)", ...doc };

  // $setOnInsert so a re-run never clobbers settings edited later in the UI.
  await sites.updateOne({ slug: SITE_SLUG }, { $setOnInsert: doc }, { upsert: true });
  const created = await sites.findOne({ slug: SITE_SLUG });
  log(`✓ Created site _id=${created._id}`);
  return created;
}

async function phaseData(db) {
  const site = await ensureSite(db);
  const siteId = site._id;

  log("\n--- Backfill siteId ---");
  let pending = 0;

  for (const name of TENANT_COLLECTIONS) {
    if (name === "photos") continue; // handled separately below
    const col = db.collection(name);
    // A superadmin deliberately has no home site, so never backfill one.
    const filter =
      name === "users"
        ? { siteId: { $exists: false }, role: { $ne: "superadmin" } }
        : { siteId: { $exists: false } };

    const total = await col.countDocuments({});
    const missing = await col.countDocuments(filter);
    pending += missing;
    log(`${name.padEnd(14)} total=${String(total).padStart(5)}  missing siteId=${String(missing).padStart(5)}${dry()}`);
    if (apply && missing > 0 && siteId !== "(pending)") {
      const r = await col.updateMany(filter, { $set: { siteId } });
      log(`  → updated ${r.modifiedCount}`);
    }
  }

  // Photos have no flatNumber; resolve them through their installation.
  const photos = db.collection("photos");
  const totalPhotos = await photos.countDocuments({});
  const missingPhotos = await photos.countDocuments({ siteId: { $exists: false } });
  pending += missingPhotos;
  log(`${"photos".padEnd(14)} total=${String(totalPhotos).padStart(5)}  missing siteId=${String(missingPhotos).padStart(5)}${dry()}`);

  if (apply && missingPhotos > 0 && siteId !== "(pending)") {
    // Pass 1 — photos referenced by an installation inherit its site.
    const installs = await db
      .collection("installations")
      .find({}, { projection: { siteId: 1, "kitchen.photoId": 1, "bathroom.photoId": 1, signatureId: 1 } })
      .toArray();
    const bySite = new Map();
    for (const i of installs) {
      const sid = String(i.siteId || siteId);
      if (!bySite.has(sid)) bySite.set(sid, []);
      for (const id of [i.kitchen?.photoId, i.bathroom?.photoId, i.signatureId]) {
        if (id) bySite.get(sid).push(id);
      }
    }
    let linked = 0;
    for (const [sid, ids] of bySite) {
      if (!ids.length) continue;
      const r = await photos.updateMany(
        { _id: { $in: ids }, siteId: { $exists: false } },
        { $set: { siteId: new mongoose.Types.ObjectId(sid) } }
      );
      linked += r.modifiedCount;
    }
    log(`  → linked ${linked} via installations`);

    // Pass 2 — orphans (an installation save that failed after the upload).
    const r2 = await photos.updateMany({ siteId: { $exists: false } }, { $set: { siteId } });
    if (r2.modifiedCount) log(`  → ${r2.modifiedCount} orphan photo(s) assigned to the default site`);
  }

  // Existing admins get full capabilities on the default site so nobody is
  // locked out the moment capability checks go live.
  log("\n--- Admin grants ---");
  const users = db.collection("users");
  const admins = await users.countDocuments({ role: "admin" });
  const ungranted = await users.countDocuments({
    role: "admin",
    siteAccess: { $not: { $elemMatch: { siteId } } },
  });
  log(`admins=${admins}  needing a grant=${ungranted}${dry()}`);
  if (apply && ungranted > 0 && siteId !== "(pending)") {
    const r = await users.updateMany(
      { role: "admin", siteAccess: { $not: { $elemMatch: { siteId } } } },
      { $push: { siteAccess: { siteId, capabilities: ALL_CAPABILITIES } } }
    );
    log(`  → granted ${r.modifiedCount} admin(s) all capabilities`);
  }

  log("");
  if (!apply) {
    log(`Dry run only. ${pending} document(s) would be updated. Re-run with --apply.`);
  } else {
    const stillMissing = {};
    for (const name of TENANT_COLLECTIONS) {
      stillMissing[name] = await db.collection(name).countDocuments(
        name === "users"
          ? { siteId: { $exists: false }, role: { $ne: "superadmin" } }
          : { siteId: { $exists: false } }
      );
    }
    const bad = Object.entries(stillMissing).filter(([, n]) => n > 0);
    if (bad.length) {
      log("✗ Documents still missing siteId: " + bad.map(([k, n]) => `${k}=${n}`).join(", "));
      process.exitCode = 1;
    } else {
      log("✓ Every tenant document now has a siteId.");
      log("  Safe to deploy site-scoped code.");
    }
  }
}

async function phaseIndexes(db) {
  log("--- Duplicate pre-flight (compound uniques must be satisfiable) ---");
  const checks = [
    ["flats", { siteId: "$siteId", flatNumber: "$flatNumber" }],
    ["installations", { siteId: "$siteId", flatNumber: "$flatNumber" }],
    ["tariffs", { siteId: "$siteId", key: "$key" }],
  ];
  let blocked = false;
  for (const [name, id] of checks) {
    const dupes = await db
      .collection(name)
      .aggregate([{ $group: { _id: id, n: { $sum: 1 } } }, { $match: { n: { $gt: 1 } } }])
      .toArray();
    log(`${name.padEnd(14)} duplicates=${dupes.length}`);
    if (dupes.length) {
      blocked = true;
      for (const d of dupes.slice(0, 5)) log(`   ✗ ${JSON.stringify(d._id)} x${d.n}`);
    }
  }
  if (blocked) {
    log("\n✗ Resolve the duplicates above before creating unique indexes. Nothing changed.");
    process.exitCode = 1;
    return;
  }

  log("\n--- Create compound indexes (never drops) ---");
  const toCreate = [
    ["flats", { siteId: 1, flatNumber: 1 }, { unique: true, name: "siteId_1_flatNumber_1" }],
    ["installations", { siteId: 1, flatNumber: 1 }, { unique: true, name: "siteId_1_flatNumber_1" }],
    ["tariffs", { siteId: 1, key: 1 }, { unique: true, name: "siteId_1_key_1" }],
    ["schedules", { siteId: 1, flatNumber: 1 }, { name: "siteId_1_flatNumber_1" }],
    ["messages", { siteId: 1, flatNumber: 1 }, { name: "siteId_1_flatNumber_1" }],
    ["photos", { siteId: 1 }, { name: "siteId_1" }],
    ["users", { siteId: 1 }, { name: "siteId_1" }],
    ["users", { "siteAccess.siteId": 1 }, { name: "siteAccess.siteId_1" }],
    ["sites", { slug: 1 }, { unique: true, name: "slug_1" }],
    ["sites", { residentUsernamePrefix: 1 }, { unique: true, name: "residentUsernamePrefix_1" }],
  ];
  for (const [name, spec, opts] of toCreate) {
    log(`${name}.${opts.name}${opts.unique ? " [UNIQUE]" : ""}${dry()}`);
    if (!apply) continue;
    try {
      await db.collection(name).createIndex(spec, opts);
      log("  ✓ created (or already present)");
    } catch (err) {
      if (err.code === 85 || err.code === 86) log(`  • already exists with different options — left alone`);
      else throw err;
    }
  }
  if (apply) log("\n✓ Compound indexes in place. Legacy global uniques intentionally left.");
}

async function phaseDropLegacy(db) {
  if (confirm !== SITE_SLUG) {
    log(`✗ This drops global unique constraints. Re-run with --confirm=${SITE_SLUG}`);
    process.exitCode = 1;
    return;
  }

  // Never drop the old constraint unless the replacement is actually there.
  const required = [
    ["flats", "siteId_1_flatNumber_1"],
    ["tariffs", "siteId_1_key_1"],
  ];
  for (const [name, idx] of required) {
    const ix = await db.collection(name).indexes();
    if (!ix.some((i) => i.name === idx && i.unique)) {
      log(`✗ ${name}.${idx} (unique) is missing — run --phase=indexes first. Nothing changed.`);
      process.exitCode = 1;
      return;
    }
  }

  // NOTE: the models must no longer declare `unique: true` on these fields, or
  // Mongoose's autoIndex will simply recreate them on the next connect and the
  // second site's flat 101 will fail to insert. (That is exactly what happened
  // the first time this ran.)
  const toDrop = [
    ["flats", "flatNumber_1"],
    ["tariffs", "key_1"],
    // Stale non-unique leftover; the compound above replaces it.
    ["installations", "flatNumber_1"],
  ];
  for (const [name, idx] of toDrop) {
    const ix = await db.collection(name).indexes();
    if (!ix.some((i) => i.name === idx)) {
      log(`• ${name}.${idx} not present — nothing to drop`);
      continue;
    }
    log(`${name}.${idx} → drop${dry()}`);
    if (apply) {
      await db.collection(name).dropIndex(idx);
      log("  ✓ dropped");
    }
  }
  if (apply) log("\n✓ Legacy global constraints removed. Flat numbers may now repeat across sites.");
}

async function main() {
  log(`→ Connecting to MongoDB…  (phase=${phase}${apply ? ", APPLY" : ", dry run"})\n`);
  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;

  if (phase === "data") await phaseData(db);
  else if (phase === "indexes") await phaseIndexes(db);
  else if (phase === "drop-legacy") await phaseDropLegacy(db);
  else {
    log(`✗ Unknown phase "${phase}". Use data | indexes | drop-legacy.`);
    process.exitCode = 1;
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("✗ Migration failed:", err);
  process.exit(1);
});
