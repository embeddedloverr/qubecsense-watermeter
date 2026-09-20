import mongoose, { Schema, model, models } from "mongoose";
import { tenantScope } from "../tenantScope";

// A closed billing month, frozen. Bills are computed from meter data, so
// without this every view of a past month re-hit the upstream API and could
// quietly re-price if anything about the calculation changed later. Once a
// month has settled (see SNAPSHOT_SETTLE_DAYS in lib/billing.ts) its whole
// report is stored here and served as-is; only the current month is live.
//
// `report` is the exact payload /api/billing/report returns (rows, meters,
// slab breakdowns, totals) — one document per (site, month), a few hundred KB
// for a 195-flat building, well inside Mongo's 16 MB document limit.

export interface IBillingSnapshot {
  _id: mongoose.Types.ObjectId;
  siteId: mongoose.Types.ObjectId;
  /** Billing month label, "YYYY-MM". */
  month: string;
  /** The exact dates this snapshot covers. If the site's billing cycle start
   *  day changes later, "August" means different dates — a snapshot whose
   *  dates no longer match is stale and gets rebuilt rather than served. */
  from: string;
  to: string;
  report: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const BillingSnapshotSchema = new Schema<IBillingSnapshot>(
  {
    siteId: { type: Schema.Types.ObjectId, ref: "Site", required: true },
    month: { type: String, required: true },
    from: { type: String, required: true },
    to: { type: String, required: true },
    report: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true }
);

BillingSnapshotSchema.index({ siteId: 1, month: 1 }, { unique: true });

BillingSnapshotSchema.plugin(tenantScope, { name: "BillingSnapshot" });

export const BillingSnapshot =
  models.BillingSnapshot ||
  model<IBillingSnapshot>("BillingSnapshot", BillingSnapshotSchema);
