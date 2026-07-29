import mongoose, { Schema, model, models } from "mongoose";
import { tenantScope } from "../tenantScope";

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
    // NOT globally unique — flat "101" exists in every building. Uniqueness is
    // per site, via the compound index below. (Leaving `unique: true` here
    // would let autoIndex silently recreate the legacy global index that
    // --phase=drop-legacy just removed.)
    flatNumber: { type: String, required: true },
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

FlatSchema.plugin(tenantScope, { name: "Flat" });

export const Flat = models.Flat || model<IFlat>("Flat", FlatSchema);
