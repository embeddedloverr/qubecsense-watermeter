import mongoose, { Schema, model, models } from "mongoose";
import { tenantScope } from "../tenantScope";

export interface IMeter {
  meterSerial: string;
  photoId?: mongoose.Types.ObjectId;
}

export interface IInstallation {
  _id: mongoose.Types.ObjectId;
  siteId?: mongoose.Types.ObjectId;
  flatNumber: string;
  floor: number;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  installationDate: Date;
  kitchen: IMeter;
  bathroom: IMeter;
  signatureId?: mongoose.Types.ObjectId;
  ownerConfirmed: boolean;
  remarks?: string;
  technicianId: mongoose.Types.ObjectId;
  technicianName: string;
  status: "completed";
  createdAt: Date;
  updatedAt: Date;
}

const MeterSchema = new Schema<IMeter>(
  {
    meterSerial: { type: String, required: true, trim: true },
    photoId: { type: Schema.Types.ObjectId, ref: "Photo" },
  },
  { _id: false }
);

const InstallationSchema = new Schema<IInstallation>(
  {
    siteId: { type: Schema.Types.ObjectId, ref: "Site", index: true },
    // No `index: true` here — it would generate the same index name
    // ("flatNumber_1") as the explicit index declared below, and MongoDB
    // rejects the second declaration with IndexOptionsConflict. That is why
    // the intended unique constraint was never actually created.
    flatNumber: { type: String, required: true },
    floor: { type: Number, default: 0 },
    ownerName: { type: String, default: "" },
    ownerEmail: { type: String, default: "" },
    ownerPhone: { type: String, default: "" },
    installationDate: { type: Date, required: true },
    kitchen: { type: MeterSchema, required: true },
    bathroom: { type: MeterSchema, required: true },
    signatureId: { type: Schema.Types.ObjectId, ref: "Photo" },
    ownerConfirmed: { type: Boolean, default: false },
    remarks: { type: String, trim: true },
    technicianId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    technicianName: { type: String, required: true },
    status: { type: String, enum: ["completed"], default: "completed" },
  },
  { timestamps: true }
);

// One flat is installed once, within its site. Remove if re-installs are
// allowed. (The old global {flatNumber} unique index never existed — see the
// note above — so this compound index is what finally enforces the rule.)
InstallationSchema.index({ siteId: 1, flatNumber: 1 }, { unique: true });

InstallationSchema.plugin(tenantScope, { name: "Installation" });

export const Installation =
  models.Installation ||
  model<IInstallation>("Installation", InstallationSchema);
