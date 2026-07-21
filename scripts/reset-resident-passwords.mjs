// Regenerate one-time passwords for resident logins and write a fresh CSV.
// Use this when the seed's credentials CSV was lost — stored passwords are
// bcrypt hashes and cannot be read back, so they must be re-issued.
//
//   npm run reset:residents              # only residents who never set their
//                                        # own password (safe default)
//   npm run reset:residents -- --all     # every resident, including those who
//                                        # already chose their own password
//   npm run reset:residents -- --flat=101,102
//
// Every reset account is flagged to change its password on next login.
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { randomInt } from "node:crypto";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

const { MONGODB_URI, RESIDENT_PASSWORD_LENGTH = "10" } = process.env;

if (!MONGODB_URI) {
  console.error("✗ MONGODB_URI is not set. Copy .env.example to .env first.");
  process.exit(1);
}

const args = process.argv.slice(2);
const all = args.includes("--all");
const flatArg = args.find((a) => a.startsWith("--flat="));
const onlyFlats = flatArg
  ? flatArg.slice("--flat=".length).split(",").map((s) => s.trim()).filter(Boolean)
  : null;

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

const User = mongoose.models.User || mongoose.model("User", UserSchema);

const PW_ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
function randomPassword(len) {
  let out = "";
  for (let i = 0; i < len; i++) out += PW_ALPHABET[randomInt(PW_ALPHABET.length)];
  return out;
}

async function main() {
  console.log("→ Connecting to MongoDB…");
  await mongoose.connect(MONGODB_URI);

  const filter = { role: "resident" };
  if (onlyFlats) filter.flatNumber = { $in: onlyFlats };
  // By default leave alone anyone who already chose their own password.
  if (!all && !onlyFlats) filter.mustChangePassword = true;

  const residents = await User.find(filter).sort({ flatNumber: 1 });
  if (!residents.length) {
    console.log(
      "• No matching resident accounts. Use --all to reset residents who already set their own password."
    );
    await mongoose.disconnect();
    process.exit(0);
  }

  const pwLen = Math.max(6, parseInt(RESIDENT_PASSWORD_LENGTH, 10) || 10);
  const rows = [];

  for (const user of residents) {
    const password = randomPassword(pwLen);
    user.passwordHash = await bcrypt.hash(password, 10);
    user.mustChangePassword = true;
    await user.save();
    rows.push({
      flat: user.flatNumber || "",
      username: user.username || "",
      password,
      name: user.name || "",
    });
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const csvPath = join(__dirname, "..", `resident-credentials-${stamp}.csv`);
  const header = "Flat,Username,Password,Owner\n";
  const body = rows
    .map(
      (c) =>
        `"${c.flat}","${c.username}","${c.password}","${(c.name || "").replace(/"/g, '""')}"`
    )
    .join("\n");
  writeFileSync(csvPath, header + body + "\n", "utf8");

  console.log(`✓ Reset ${rows.length} resident password(s).`);
  console.log(`✓ Wrote credentials to: ${csvPath}`);
  console.log("  Each resident must change this password on next login.\n");

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error("✗ Reset failed:", err);
  process.exit(1);
});
