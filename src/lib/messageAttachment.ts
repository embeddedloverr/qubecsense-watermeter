import { Types } from "mongoose";
import { MessageAttachment } from "./models/MessageAttachment";
import { compressImage } from "./image";

// Shared by the resident and the admin message routes so the two cannot drift
// on limits or on what counts as an acceptable image.

/** Largest data URL we will even attempt to decode, before compression. */
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

/** Chat photos are evidence — a leaking joint, a meter face, a bill. Kept
 *  larger than the 1280px used for installation records so serial numbers and
 *  digits stay readable when the admin opens the full view. */
const MAX_DIMENSION = 1600;
const QUALITY = 74;

export class AttachmentError extends Error {}

/**
 * Validate, compress and store one image. Returns what the Message document
 * needs, or null when no image was supplied.
 */
export async function storeAttachment(opts: {
  dataUrl: unknown;
  siteId: unknown;
  flatNumber: string;
}): Promise<{
  attachmentId: Types.ObjectId;
  attachmentWidth: number;
  attachmentHeight: number;
} | null> {
  const { dataUrl, siteId, flatNumber } = opts;
  if (dataUrl === undefined || dataUrl === null || dataUrl === "") return null;

  if (typeof dataUrl !== "string") {
    throw new AttachmentError("That attachment could not be read.");
  }
  if (!/^data:image\/(jpeg|jpg|png|webp|gif|heic|heif);base64,/i.test(dataUrl)) {
    throw new AttachmentError("Attach a photo (JPG, PNG or WebP).");
  }
  if (dataUrl.length > MAX_UPLOAD_BYTES) {
    throw new AttachmentError("That photo is too large. Try a smaller one.");
  }

  let compressed;
  try {
    compressed = await compressImage(dataUrl, {
      maxSize: MAX_DIMENSION,
      quality: QUALITY,
    });
  } catch {
    // A corrupt or non-image payload that slipped past the prefix check.
    throw new AttachmentError("That file is not a readable image.");
  }

  const att = await MessageAttachment.create({
    siteId,
    flatNumber,
    contentType: compressed.contentType,
    size: compressed.size,
    width: compressed.width,
    height: compressed.height,
    data: compressed.data,
  });

  return {
    attachmentId: att._id,
    attachmentWidth: compressed.width,
    attachmentHeight: compressed.height,
  };
}

/** Link the stored image back to its message, for cleanup and auditing. */
export async function linkAttachment(
  attachmentId: Types.ObjectId,
  messageId: Types.ObjectId
) {
  await MessageAttachment.updateOne(
    { _id: attachmentId },
    { $set: { messageId } }
  );
}

/** The shape both routes hand to the client for one message's image. */
export function attachmentPayload(m: {
  attachmentId?: unknown;
  attachmentWidth?: number;
  attachmentHeight?: number;
}) {
  if (!m.attachmentId) return null;
  return {
    url: `/api/messages/attachment/${String(m.attachmentId)}`,
    width: m.attachmentWidth || 0,
    height: m.attachmentHeight || 0,
  };
}
