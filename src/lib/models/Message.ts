import mongoose, { Schema, model, models } from "mongoose";

// One conversation thread per flat, between that flat's resident and the admin.

export interface IMessage {
  _id: mongoose.Types.ObjectId;
  flatNumber: string;
  sender: "resident" | "admin";
  senderName: string;
  body: string;
  /** Optional label for "Report a problem" messages (Leak, Meter, Billing…). */
  category?: string;
  readByAdmin: boolean;
  readByResident: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const MessageSchema = new Schema<IMessage>(
  {
    flatNumber: { type: String, required: true, index: true },
    sender: { type: String, enum: ["resident", "admin"], required: true },
    senderName: { type: String, default: "" },
    body: { type: String, required: true, trim: true, maxlength: 2000 },
    category: { type: String },
    readByAdmin: { type: Boolean, default: false },
    readByResident: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const Message =
  models.Message || model<IMessage>("Message", MessageSchema);
