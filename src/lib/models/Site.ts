import mongoose, { Schema, model, models } from "mongoose";

// A site is one building/tower the portal serves. Rosalyn-21 is site #1;
// everything else in the app (flats, users, meters, tariffs, messages) hangs
// off one of these.

export interface ISite {
  _id: mongoose.Types.ObjectId;
  name: string;
  slug: string;
  project: string;
  building: string;
  addressLine?: string;
  city?: string;
  state?: string;
  pincode?: string;
  /** Upstream meter-data API for this site. Key is encrypted at rest. */
  dataApiUrl?: string;
  dataApiKey?: string;
  /** Resident usernames are "<prefix>_<flatNumber>". Unique across sites. */
  residentUsernamePrefix: string;
  timezone: string;
  currency: string;
  /** Where this site's resident messages / problem reports are emailed. */
  adminNotifyEmail?: string;
  supportPhone?: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const SiteSchema = new Schema<ISite>(
  {
    name: { type: String, required: true, trim: true },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    project: { type: String, default: "", trim: true },
    building: { type: String, default: "", trim: true },
    addressLine: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    pincode: { type: String, trim: true },

    dataApiUrl: { type: String, trim: true },
    // select:false so the ciphertext never rides along on an incidental read
    // (a server component passing a site to a client component would ship it
    // to the browser). Only resolveSiteCreds() asks for it explicitly.
    dataApiKey: { type: String, select: false },

    residentUsernamePrefix: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    timezone: { type: String, default: "Asia/Kolkata" },
    currency: { type: String, default: "INR" },
    adminNotifyEmail: { type: String, lowercase: true, trim: true },
    supportPhone: { type: String, trim: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

SiteSchema.index({ active: 1 });

export const Site = models.Site || model<ISite>("Site", SiteSchema);
