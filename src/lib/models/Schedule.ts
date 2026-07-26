import mongoose, { Schema, model, models } from "mongoose";
import { tenantScope } from "../tenantScope";

export interface ISchedule {
  _id: mongoose.Types.ObjectId;
  siteId?: mongoose.Types.ObjectId;
  flatNumber: string;
  floor: number;
  ownerName: string;
  scheduledDate: Date;
  technicianId: mongoose.Types.ObjectId;
  technicianName: string;
  status: "planned" | "completed" | "skipped";
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ScheduleSchema = new Schema<ISchedule>(
  {
    siteId: { type: Schema.Types.ObjectId, ref: "Site", index: true },
    flatNumber: { type: String, required: true, index: true },
    floor: { type: Number, default: 0 },
    ownerName: { type: String, default: "" },
    scheduledDate: { type: Date, required: true },
    technicianId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    technicianName: { type: String, required: true },
    status: {
      type: String,
      enum: ["planned", "completed", "skipped"],
      default: "planned",
    },
    notes: { type: String, trim: true },
  },
  { timestamps: true }
);

ScheduleSchema.plugin(tenantScope, { name: "Schedule" });

export const Schedule =
  models.Schedule || model<ISchedule>("Schedule", ScheduleSchema);
