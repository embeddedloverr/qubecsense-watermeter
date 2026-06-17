import mongoose, { Schema, model, models } from "mongoose";

export interface IFlat {
  _id: mongoose.Types.ObjectId;
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
    flatNumber: { type: String, required: true, unique: true, index: true },
    floor: { type: Number, default: 0 },
    ownerName: { type: String, default: "" },
    ownerEmail: { type: String, default: "" },
    ownerPhone: { type: String, default: "" },
    vacant: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const Flat = models.Flat || model<IFlat>("Flat", FlatSchema);
