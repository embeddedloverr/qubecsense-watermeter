import mongoose, { Schema, model, models } from "mongoose";

// Declared in session.ts (which middleware also uses) so there is one
// definition rather than two that silently diverge.
export type { Role } from "../session";
import type { Role } from "../session";

// Same reason as Role above: capabilities live in session.ts and are
// re-exported, never re-declared. Three copies of this list had already
// appeared before it was consolidated.
export type { Capability } from "../session";
import type { Capability } from "../session";
export {
  ALL_CAPABILITIES,
  GRANTABLE_CAPABILITIES,
  SUPERADMIN_ONLY_CAPABILITIES,
} from "../session";

/** One site an admin can act in, and what they may do there. */
export interface ISiteAccess {
  siteId: mongoose.Types.ObjectId;
  capabilities: Capability[];
}

export interface IUser {
  _id: mongoose.Types.ObjectId;
  /**
   * Home site. Required in practice for residents and technicians; for an
   * admin it is their default site. Null for a superadmin, who has no site.
   */
  siteId?: mongoose.Types.ObjectId | null;
  /** Per-site capability grants for admins. Superadmins ignore this. */
  siteAccess?: ISiteAccess[];
  name: string;
  /** Login handle for residents, e.g. "rosalyn_501". Optional for admin/tech. */
  username?: string;
  /** Login email for admin/technician. Optional for residents. */
  email?: string;
  passwordHash: string;
  role: Role;
  /** For residents: the flat this account belongs to. */
  flatNumber?: string;
  phone?: string;
  active: boolean;
  /** True until the user sets their own password on first login. */
  mustChangePassword: boolean;
  /** Last successful sign-in; unset means the account has never been used. */
  lastLoginAt?: Date;
  /** Email one-time-code login state (HMAC of the code, never plain text). */
  otpHash?: string;
  otpExpiresAt?: Date;
  otpAttempts?: number;
  otpLastSentAt?: Date;
  /** Resident water usage alert (email when a week/month exceeds the limit). */
  budgetEnabled?: boolean;
  budgetLitres?: number;
  budgetPeriod?: "weekly" | "monthly";
  /** Period key already alerted for, so a resident is emailed once per period. */
  budgetLastAlertKey?: string;
  createdAt: Date;
  updatedAt: Date;
}

const SiteAccessSchema = new Schema<ISiteAccess>(
  {
    siteId: { type: Schema.Types.ObjectId, ref: "Site", required: true },
    capabilities: [{ type: String }],
  },
  { _id: false }
);

const UserSchema = new Schema<IUser>(
  {
    siteId: { type: Schema.Types.ObjectId, ref: "Site", index: true },
    siteAccess: { type: [SiteAccessSchema], default: undefined },
    name: { type: String, required: true, trim: true },
    username: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
    },
    email: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      enum: ["superadmin", "admin", "technician", "resident"],
      default: "technician",
    },
    flatNumber: { type: String, trim: true, index: true },
    phone: { type: String, trim: true },
    active: { type: Boolean, default: true },
    mustChangePassword: { type: Boolean, default: false },
    lastLoginAt: { type: Date },
    otpHash: { type: String },
    otpExpiresAt: { type: Date },
    otpAttempts: { type: Number, default: 0 },
    otpLastSentAt: { type: Date },
    budgetEnabled: { type: Boolean, default: false },
    budgetLitres: { type: Number },
    budgetPeriod: { type: String, enum: ["weekly", "monthly"], default: "monthly" },
    budgetLastAlertKey: { type: String },
  },
  { timestamps: true }
);

// Admin lookups by granted site.
UserSchema.index({ "siteAccess.siteId": 1 });

// NOTE: username and email stay GLOBALLY unique. Because each site has a
// unique residentUsernamePrefix, "rosalyn_101" and "greenwood_101" are already
// distinct — so no compound migration is needed on the users collection (the
// one holding live resident logins), and the login page needs no site picker.
export const User = models.User || model<IUser>("User", UserSchema);
