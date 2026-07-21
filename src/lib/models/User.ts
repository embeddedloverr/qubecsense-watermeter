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
  },
  { timestamps: true }
);

export const User = models.User || model<IUser>("User", UserSchema);
