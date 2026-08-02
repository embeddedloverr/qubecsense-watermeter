import mongoose, { Schema, model, models } from "mongoose";
import { tenantScope } from "../tenantScope";

export interface ISlab {
  /** Upper bound of cumulative consumption in litres; null = no limit (top slab). */
  limitLitres: number | null;
  /** Rate in rupees per kilolitre (1000 L) for consumption falling in this slab. */
  ratePerKl: number;
}

export interface ITariff {
  _id: mongoose.Types.ObjectId;
  siteId?: mongoose.Types.ObjectId;
  key: string;
  slabs: ISlab[];
  /** Fixed monthly charge per flat (meter/service charge), in rupees. */
  fixedCharge: number;
  /** Day of the month a billing cycle opens. 1 = ordinary calendar month. */
  billingCycleStartDay: number;
  createdAt: Date;
  updatedAt: Date;
}

const SlabSchema = new Schema<ISlab>(
  {
    limitLitres: { type: Number, default: null },
    ratePerKl: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const TariffSchema = new Schema<ITariff>(
  {
    siteId: { type: Schema.Types.ObjectId, ref: "Site", index: true },
    // NOT globally unique — each site has its own "default" tariff.
    // Uniqueness is per site, via the compound index below.
    key: { type: String, required: true, default: "default" },
    slabs: { type: [SlabSchema], default: [] },
    fixedCharge: { type: Number, default: 0, min: 0 },
    // Capped at 28 so every month has that day — no Feb-29 edge case shifting
    // a cycle's length depending on which month it falls in.
    billingCycleStartDay: { type: Number, default: 1, min: 1, max: 28 },
  },
  { timestamps: true }
);

// One tariff per key per site (leaves room for named tariffs later).
TariffSchema.index({ siteId: 1, key: 1 }, { unique: true });

TariffSchema.plugin(tenantScope, { name: "Tariff" });

export const Tariff = models.Tariff || model<ITariff>("Tariff", TariffSchema);
