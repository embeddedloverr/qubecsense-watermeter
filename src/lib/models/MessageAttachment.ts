import mongoose, { Schema, model, models } from "mongoose";
import { tenantScope } from "../tenantScope";

// Images attached to chat messages.
//
// Deliberately NOT the `photos` collection. Meter photos and signatures are
// staff-only (see /api/photos/[id], which refuses residents outright), whereas
// a chat attachment must be readable by the one resident who sent it. Keeping
// them apart means neither route can be loosened into the other's data by
// accident — and flatNumber is denormalised here so the ownership check is a
// direct comparison rather than a walk back through the message.
//
// Bytes live in their own collection rather than on the message so that
// listing a thread does not drag every image through the query.

export interface IMessageAttachment {
  _id: mongoose.Types.ObjectId;
  siteId?: mongoose.Types.ObjectId;
  /** The flat whose thread this belongs to — the resident ownership check. */
  flatNumber: string;
  messageId?: mongoose.Types.ObjectId;
  contentType: string;
  size: number;
  width: number;
  height: number;
  data: Buffer;
  createdAt: Date;
}

const MessageAttachmentSchema = new Schema<IMessageAttachment>(
  {
    siteId: { type: Schema.Types.ObjectId, ref: "Site", index: true },
    flatNumber: { type: String, required: true, index: true },
    messageId: { type: Schema.Types.ObjectId, ref: "Message" },
    contentType: { type: String, required: true },
    size: { type: Number, required: true },
    width: { type: Number, default: 0 },
    height: { type: Number, default: 0 },
    data: { type: Buffer, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

MessageAttachmentSchema.plugin(tenantScope, { name: "MessageAttachment" });

export const MessageAttachment =
  models.MessageAttachment ||
  model<IMessageAttachment>("MessageAttachment", MessageAttachmentSchema);
