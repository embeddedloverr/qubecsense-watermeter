import mongoose, { Schema, model, models } from "mongoose";

export type Role = "admin" | "technician" | "resident";

export interface IUser {
  _id: mongoose.Types.ObjectId;
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

const UserSchema = new Schema<IUser>(
  {
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
      enum: ["admin", "technician", "resident"],
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

export const User = models.User || model<IUser>("User", UserSchema);
