// Seed script: imports flats and creates the initial admin + technician users.
// Run with:  npm run seed
import "dotenv/config";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

const {
  MONGODB_URI,
  SEED_ADMIN_EMAIL = "admin@qubecsense.com",
  SEED_ADMIN_PASSWORD = "admin123",
  SEED_TECH_EMAIL = "tech@qubecsense.com",
  SEED_TECH_PASSWORD = "tech123",
} = process.env;

if (!MONGODB_URI) {
  console.error("✗ MONGODB_URI is not set. Copy .env.example to .env first.");
  process.exit(1);
}

const UserSchema = new mongoose.Schema(
  {
    name: String,
    email: { type: String, unique: true, lowercase: true },
    passwordHash: String,
    role: { type: String, enum: ["admin", "technician"], default: "technician" },
    phone: String,
    active: { type: Boolean, default: true },
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

async function upsertUser(name, email, password, role, phone = "") {
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
  });
  console.log(`✓ Created ${role}: ${email} / ${password}`);
}

async function main() {
  console.log("→ Connecting to MongoDB…");
  await mongoose.connect(MONGODB_URI);

  // --- Flats ---
  const flats = JSON.parse(
    readFileSync(join(__dirname, "..", "src", "data", "flats.json"), "utf8")
  );

  let created = 0;
  const ops = flats.map((f) => {
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
  const res = await Flat.bulkWrite(ops);
  created = res.upsertedCount ?? 0;
  console.log(
    `✓ Flats synced: ${flats.length} total (${created} new, ${
      flats.length - created
    } updated).`
  );

  // --- Users ---
  await upsertUser(
    "QubecSense Admin",
    SEED_ADMIN_EMAIL,
    SEED_ADMIN_PASSWORD,
    "admin"
  );
  await upsertUser(
    "Field Technician",
    SEED_TECH_EMAIL,
    SEED_TECH_PASSWORD,
    "technician"
  );

  console.log("\n✅ Seed complete.\n");
  console.log("   Admin login:      ", SEED_ADMIN_EMAIL, "/", SEED_ADMIN_PASSWORD);
  console.log("   Technician login: ", SEED_TECH_EMAIL, "/", SEED_TECH_PASSWORD);
  console.log("\n   Change these passwords after first login.\n");

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error("✗ Seed failed:", err);
  process.exit(1);
});
