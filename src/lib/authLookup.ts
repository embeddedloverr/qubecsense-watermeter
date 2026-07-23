import { User, type IUser } from "./models/User";
import { Flat } from "./models/Flat";
import type { HydratedDocument } from "mongoose";

/**
 * Resolve a login identifier (username, account email, or a flat's owner
 * email) to a user document.
 */
export async function findUserByIdentifier(
  identifier: string
): Promise<HydratedDocument<IUser> | null> {
  const id = identifier.toLowerCase().trim();
  if (!id) return null;

  let user = await User.findOne({ $or: [{ username: id }, { email: id }] });
  if (!user && id.includes("@")) {
    const flat = await Flat.findOne({ ownerEmail: id });
    if (flat) {
      user = await User.findOne({
        role: "resident",
        flatNumber: flat.flatNumber,
      });
    }
  }
  return user;
}

/** Where an OTP should be delivered for this user. */
export async function deliveryEmailFor(
  user: Pick<IUser, "role" | "flatNumber" | "email">
): Promise<string> {
  if (user.role === "resident" && user.flatNumber) {
    const flat = await Flat.findOne(
      { flatNumber: user.flatNumber },
      { ownerEmail: 1 }
    ).lean();
    return ((flat as any)?.ownerEmail || user.email || "").trim();
  }
  return (user.email || "").trim();
}
