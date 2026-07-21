// Seed script: imports flats, creates the admin + technician users, and
// creates one resident login per flat (username "rosalyn_<flat>") with a
// random one-time password that must be changed on first login.
// Run with:  npm run seed
import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { randomInt } from "node:crypto";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

const {
  MONGODB_URI,
  SEED_ADMIN_EMAIL = "admin@qubecsense.com",
  SEED_ADMIN_PASSWORD = "admin123",
  SEED_TECH_EMAIL = "tech@qubecsense.com",
  SEED_TECH_PASSWORD = "tech123",
  // Prefix for resident usernames + password length.
  RESIDENT_USERNAME_PREFIX = "rosalyn",
  RESIDENT_PASSWORD_LENGTH = "10",
} = process.env;

if (!MONGODB_URI) {
  console.error("✗ MONGODB_URI is not set. Copy .env.example to .env first.");
  process.exit(1);
}

const UserSchema = new mongoose.Schema(
  {
    name: String,
    username: { type: String, unique: true, sparse: true, lowercase: true },
    email: { type: String, unique: true, sparse: true, lowercase: true },
    passwordHash: String,
    role: {
      type: String,
      enum: ["admin", "technician", "resident"],
      default: "technician",
    },
    flatNumber: { type: String, index: true },
    phone: String,
    active: { type: Boolean, default: true },
    mustChangePassword: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const FlatSchema = new mongoose.Schema(
  {
    flatNumber: { type: String, unique: true },
    floor: Number,
    ownerName: String,
    ownerEmail: String,
    ownerPhone: String,
    vacant: Boolean,
  },
  { timestamps: true }
);

const User = mongoose.models.User || mongoose.model("User", UserSchema);
const Flat = mongoose.models.Flat || mongoose.model("Flat", FlatSchema);

// Unambiguous alphabet (no 0/O/1/l/I) for readable one-time passwords, with a
// guaranteed lower case letter, capital and digit so the generated password
// meets the same policy residents must satisfy when choosing their own.
const PW_LOWER = "abcdefghjkmnpqrstuvwxyz";
const PW_UPPER = "ABCDEFGHJKMNPQRSTUVWXYZ";
const PW_DIGITS = "23456789";
const PW_ALL = PW_LOWER + PW_UPPER + PW_DIGITS;

function randomPassword(len) {
  const pick = (set) => set[randomInt(set.length)];
  const chars = [pick(PW_LOWER), pick(PW_UPPER), pick(PW_DIGITS)];
  while (chars.length < len) chars.push(pick(PW_ALL));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

async function upsertStaff(name, email, password, role, phone = "") {
  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    console.log(`• ${role} already exists: ${email}`);
    return;
  }
  await User.create({
    name,
    email: email.toLowerCase(),
    passwordHash: await bcrypt.hash(password, 10),
    role,
    phone,
    active: true,
    mustChangePassword: false,
  });
  console.log(`✓ Created ${role}: ${email} / ${password}`);
}

async function main() {
  console.log("→ Connecting to MongoDB…");
  await mongoose.connect(MONGODB_URI);

  // Align indexes with the schema (converts the old non-sparse email index
  // to a sparse one so residents without an email don't collide).
  await User.syncIndexes();

  // --- Flats ---
  const flats = JSON.parse(
    readFileSync(join(__dirname, "..", "src", "data", "flats.json"), "utf8")
  );

  const flatOps = flats.map((f) => {
    const floor = Math.floor(parseInt(f.flatNumber, 10) / 100) || 0;
    return {
      updateOne: {
        filter: { flatNumber: String(f.flatNumber) },
        update: {
          $set: {
            flatNumber: String(f.flatNumber),
            floor,
            ownerName: f.ownerName || "",
            ownerEmail: f.ownerEmail || "",
            ownerPhone: f.ownerPhone || "",
            vacant: !!f.vacant,
          },
        },
        upsert: true,
      },
    };
  });
  const flatRes = await Flat.bulkWrite(flatOps);
  const newFlats = flatRes.upsertedCount ?? 0;
  console.log(
    `✓ Flats synced: ${flats.length} total (${newFlats} new, ${
      flats.length - newFlats
    } updated).`
  );

  // --- Staff users ---
  await upsertStaff("QubecSense Admin", SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, "admin");
  await upsertStaff("Field Technician", SEED_TECH_EMAIL, SEED_TECH_PASSWORD, "technician");

  // --- Resident users (one per flat) ---
  const pwLen = Math.max(8, parseInt(RESIDENT_PASSWORD_LENGTH, 10) || 10);
  const created = [];
  let skipped = 0;

  for (const f of flats) {
    const flatNumber = String(f.flatNumber);
    const username = `${RESIDENT_USERNAME_PREFIX}_${flatNumber}`.toLowerCase();

    const existing = await User.findOne({ username });
    if (existing) {
      skipped++;
      continue;
    }

    const password = randomPassword(pwLen);
    await User.create({
      name: f.ownerName || `Flat ${flatNumber}`,
      username,
      passwordHash: await bcrypt.hash(password, 10),
      role: "resident",
      flatNumber,
      phone: f.ownerPhone || "",
      active: true,
      mustChangePassword: true,
    });
    created.push({
      flat: flatNumber,
      username,
      password,
      name: f.ownerName || "",
    });
  }

  console.log(
    `✓ Resident logins: ${created.length} created, ${skipped} already existed.`
  );

  // --- Write the new credentials to a CSV so the admin can hand them out ---
  if (created.length) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const csvPath = join(__dirname, "..", `resident-credentials-${stamp}.csv`);
    const header = "Flat,Username,Password,Owner\n";
    const body = created
      .map(
        (c) =>
          `"${c.flat}","${c.username}","${c.password}","${(c.name || "").replace(/"/g, '""')}"`
      )
      .join("\n");
    writeFileSync(csvPath, header + body + "\n", "utf8");
    console.log(`✓ Wrote credentials to: ${csvPath}`);
    console.log("  Distribute these to residents; each must change it on first login.");
  }

  console.log("\n✅ Seed complete.\n");
  console.log("   Admin login:      ", SEED_ADMIN_EMAIL, "/", SEED_ADMIN_PASSWORD);
  console.log("   Technician login: ", SEED_TECH_EMAIL, "/", SEED_TECH_PASSWORD);
  console.log(`   Resident logins:   ${RESIDENT_USERNAME_PREFIX}_<flat>  (see the CSV)`);
  console.log("\n   Change the seeded staff passwords after first login.\n");

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error("✗ Seed failed:", err);
  process.exit(1);
});
