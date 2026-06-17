import mongoose, { Schema, model, models } from "mongoose";

export interface IMeter {
  meterSerial: string;
  photoId?: mongoose.Types.ObjectId;
}

export interface IInstallation {
  _id: mongoose.Types.ObjectId;
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
    flatNumber: { type: String, required: true, index: true },
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

// One flat is installed once. Remove this if re-installs are allowed.
InstallationSchema.index({ flatNumber: 1 }, { unique: true });

export const Installation =
  models.Installation ||
  model<IInstallation>("Installation", InstallationSchema);
