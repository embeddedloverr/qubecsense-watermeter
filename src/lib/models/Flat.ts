import mongoose, { Schema, model, models } from "mongoose";

export interface IFlat {
  _id: mongoose.Types.ObjectId;
  /** Owning site. Optional until the multi-site backfill completes. */
  siteId?: mongoose.Types.ObjectId;
  flatNumber: string;
  floor: number;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  vacant: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const FlatSchema = new Schema<IFlat>(
  {
    siteId: { type: Schema.Types.ObjectId, ref: "Site", index: true },
    // `unique` here is the LEGACY global constraint. It coexists with the
    // compound index below while there is only one site, and is dropped by
    // `migrate-multisite.mjs --phase=drop-legacy` before site #2 is created.
    flatNumber: { type: String, required: true, unique: true },
    floor: { type: Number, default: 0 },
    ownerName: { type: String, default: "" },
    ownerEmail: { type: String, default: "" },
    ownerPhone: { type: String, default: "" },
    vacant: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// A flat number is unique within its site.
FlatSchema.index({ siteId: 1, flatNumber: 1 }, { unique: true });

export const Flat = models.Flat || model<IFlat>("Flat", FlatSchema);
