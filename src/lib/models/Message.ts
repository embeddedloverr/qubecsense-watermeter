import mongoose, { Schema, model, models } from "mongoose";
import { tenantScope } from "../tenantScope";

// One conversation thread per flat, between that flat's resident and the admin.

export interface IMessage {
  _id: mongoose.Types.ObjectId;
  siteId?: mongoose.Types.ObjectId;
  flatNumber: string;
  sender: "resident" | "admin";
  senderName: string;
  /** May be empty when the message is an image on its own. */
  body: string;
  /** Optional label for "Report a problem" messages (Leak, Meter, Billing…). */
  category?: string;
  /** Attached image, stored in the messageattachments collection. */
  attachmentId?: mongoose.Types.ObjectId;
  attachmentWidth?: number;
  attachmentHeight?: number;
  readByAdmin: boolean;
  readByResident: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const MessageSchema = new Schema<IMessage>(
  {
    siteId: { type: Schema.Types.ObjectId, ref: "Site", index: true },
    flatNumber: { type: String, required: true, index: true },
    sender: { type: String, enum: ["resident", "admin"], required: true },
    senderName: { type: String, default: "" },
    // Not required: a photo with no caption is a valid message. The routes
    // enforce "text or image", which `required` alone cannot express.
    body: { type: String, default: "", trim: true, maxlength: 2000 },
    category: { type: String },
    attachmentId: { type: Schema.Types.ObjectId, ref: "MessageAttachment" },
    attachmentWidth: { type: Number },
    attachmentHeight: { type: Number },
    readByAdmin: { type: Boolean, default: false },
    readByResident: { type: Boolean, default: false },
  },
  { timestamps: true }
);

MessageSchema.plugin(tenantScope, { name: "Message" });

export const Message =
  models.Message || model<IMessage>("Message", MessageSchema);
