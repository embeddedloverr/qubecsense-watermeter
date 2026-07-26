// Create (or reset) the superadmin account.
//
//   npm run create:superadmin -- --email=you@example.com --name="Your Name"
//   npm run create:superadmin -- --email=you@example.com --password='Secret123'
//
// With no --password a strong one is generated and printed once. A superadmin
// has no home site: they pick one from the superadmin dashboard.
import "dotenv/config";
import { randomInt } from "node:crypto";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const { MONGODB_URI } = process.env;
if (!MONGODB_URI) {
  console.error("✗ MONGODB_URI is not set.");
  process.exit(1);
}

const args = process.argv.slice(2);
const arg = (k) => {
  const hit = args.find((a) => a.startsWith(`--${k}=`));
  return hit ? hit.slice(k.length + 3) : undefined;
};

const email = (arg("email") || "").toLowerCase().trim();
const name = arg("name") || "Super Admin";
let password = arg("password");

if (!email) {
  console.error("✗ Pass --email=you@example.com");
  process.exit(1);
}

const ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
function strongPassword(len = 14) {
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const upper = "ABCDEFGHJKMNPQRSTUVWXYZ";
  const digits = "23456789";
  const pick = (s) => s[randomInt(s.length)];
  const chars = [pick(lower), pick(upper), pick(digits)];
  while (chars.length < len) chars.push(pick(ALPHABET));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

const UserSchema = new mongoose.Schema(
  {
    name: String,
    username: { type: String, unique: true, sparse: true, lowercase: true },
    email: { type: String, unique: true, sparse: true, lowercase: true },
    passwordHash: String,
    role: String,
    siteId: mongoose.Schema.Types.ObjectId,
    siteAccess: Array,
    active: Boolean,
    mustChangePassword: Boolean,
    lastLoginAt: Date,
  },
  { timestamps: true }
);
const User = mongoose.models.User || mongoose.model("User", UserSchema);

async function main() {
  await mongoose.connect(MONGODB_URI);

  const existing = await User.findOne({ email });
  const generated = !password;
  if (!password) password = strongPassword();
  const passwordHash = await bcrypt.hash(password, 10);

  if (existing) {
    if (existing.role !== "superadmin") {
      console.error(
        `✗ ${email} already exists with role "${existing.role}". ` +
          `Use a different address rather than changing an existing account's role.`
      );
      process.exit(1);
    }
    existing.passwordHash = passwordHash;
    existing.name = name;
    existing.active = true;
    existing.mustChangePassword = false;
    // A superadmin must never carry a home site.
    existing.siteId = undefined;
    await existing.save();
    console.log(`✓ Reset superadmin password for ${email}`);
  } else {
    await User.create({
      name,
      email,
      passwordHash,
      role: "superadmin",
      active: true,
      mustChangePassword: false,
    });
    console.log(`✓ Created superadmin ${email}`);
  }

  console.log("");
  console.log(`   Sign in at /login`);
  console.log(`   Email    : ${email}`);
  if (generated) {
    console.log(`   Password : ${password}`);
    console.log("");
    console.log("   Shown once — store it in a password manager now.");
  } else {
    console.log(`   Password : (the one you supplied)`);
  }
  console.log("");

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error("✗ Failed:", err);
  process.exit(1);
});
