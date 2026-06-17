import mongoose, { Schema, model, models } from "mongoose";

export interface IPhoto {
  _id: mongoose.Types.ObjectId;
  kind: "kitchen" | "bathroom" | "signature";
  contentType: string;
  size: number;
  data: Buffer;
  createdAt: Date;
}

const PhotoSchema = new Schema<IPhoto>(
  {
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

export const Photo = models.Photo || model<IPhoto>("Photo", PhotoSchema);
