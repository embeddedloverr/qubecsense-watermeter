import mongoose, { Schema, model, models } from "mongoose";

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
    // LEGACY global unique — coexists with the compound index below while
    // there is one site; dropped by `--phase=drop-legacy` before site #2.
    key: { type: String, required: true, unique: true, default: "default" },
    slabs: { type: [SlabSchema], default: [] },
    fixedCharge: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

// One tariff per key per site (leaves room for named tariffs later).
TariffSchema.index({ siteId: 1, key: 1 }, { unique: true });

export const Tariff = models.Tariff || model<ITariff>("Tariff", TariffSchema);
