import mongoose, { Schema, model, models } from "mongoose";
import { tenantScope } from "../tenantScope";

// A device an admin has chosen to hide from the Live Data page's
// "Unassigned meters" list and "stopped reporting" alert — e.g. a
// decommissioned or replaced physical meter that keeps showing up because
// it once reported to the upstream API but was never mapped to a flat here.
// Doesn't touch the device itself or the upstream nudron-dashboard registry;
// purely a per-site suppression list this app applies when reading that API.

export interface IDismissedMeter {
  _id: mongoose.Types.ObjectId;
  siteId: mongoose.Types.ObjectId;
  deviceId: string;
  dismissedByName: string;
  createdAt: Date;
  updatedAt: Date;
}

const DismissedMeterSchema = new Schema<IDismissedMeter>(
  {
    siteId: { type: Schema.Types.ObjectId, ref: "Site", required: true, index: true },
    deviceId: { type: String, required: true, trim: true },
    dismissedByName: { type: String, default: "" },
  },
  { timestamps: true }
);

DismissedMeterSchema.index({ siteId: 1, deviceId: 1 }, { unique: true });

DismissedMeterSchema.plugin(tenantScope, { name: "DismissedMeter" });

export const DismissedMeter =
  models.DismissedMeter || model<IDismissedMeter>("DismissedMeter", DismissedMeterSchema);

/** Device IDs this site has dismissed, as a Set for O(1) filtering. */
export async function dismissedDeviceIdSet(
  siteId: mongoose.Types.ObjectId
): Promise<Set<string>> {
  const rows = await DismissedMeter.find({ siteId }, { deviceId: 1 }).lean();
  return new Set((rows as any[]).map((r) => r.deviceId));
}
