import mongoose, { Schema, model, models } from "mongoose";
import { tenantScope } from "../tenantScope";

export interface IPhoto {
  _id: mongoose.Types.ObjectId;
  /**
   * Owning site. Photos have no flatNumber, so the backfill resolves this by
   * walking Installation.kitchen/bathroom.photoId and signatureId. Needed so
   * /api/photos/[id] can be scoped — it is currently readable by any user.
   */
  siteId?: mongoose.Types.ObjectId;
  kind: "kitchen" | "bathroom" | "signature";
  contentType: string;
  size: number;
  data: Buffer;
  createdAt: Date;
}

const PhotoSchema = new Schema<IPhoto>(
  {
    siteId: { type: Schema.Types.ObjectId, ref: "Site", index: true },
    kind: {
      type: String,
      enum: ["kitchen", "bathroom", "signature"],
      required: true,
    },
    contentType: { type: String, required: true },
    size: { type: Number, required: true },
    data: { type: Buffer, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

PhotoSchema.plugin(tenantScope, { name: "Photo" });

export const Photo = models.Photo || model<IPhoto>("Photo", PhotoSchema);
