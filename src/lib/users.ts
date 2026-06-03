import crypto from "crypto";
import bcrypt from "bcryptjs";
import { connectDB } from "./db";
import { User, type UserDoc } from "@/models/User";
import { sendInviteEmail, isEmailConfigured } from "./email";

const INVITE_DAYS = 7;

export type PublicUser = {
  id: string;
  email: string;
  name: string;
  role: "admin" | "user";
  status: "active" | "pending" | "disabled";
  createdAt: string;
  lastLoginAt: string | null;
  invitedByName: string | null;
};

function toPublic(u: UserDoc & { invitedBy?: { name?: string } | null }): PublicUser {
  return {
    id: String(u._id),
    email: u.email,
    name: u.name,
    role: u.role as "admin" | "user",
    status: u.status as "active" | "pending" | "disabled",
    createdAt: (u as any).createdAt?.toISOString?.() ?? new Date().toISOString(),
    lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
    invitedByName: (u as any).invitedBy?.name ?? null,
  };
}

/** Create first admin from env when DB has no users (migration from single-user). */
export async function ensureBootstrapAdmin(): Promise<void> {
  await connectDB();
  const count = await User.countDocuments();
  if (count > 0) return;

  const email = (
    process.env.ADMIN_EMAIL ||
    process.env.EMAIL_FROM?.replace(/^"|"$/g, "") ||
    ""
  )
    .trim()
    .toLowerCase();
  const fallbackUser = (process.env.ADMIN_USERNAME || "admin").trim();
  const resolvedEmail = email.includes("@") ? email : `${fallbackUser}@nexustrade.local`;

  const name = process.env.ADMIN_NAME || fallbackUser || "Admin";
  let passwordHash = process.env.ADMIN_PASSWORD_HASH?.trim();
  if (!passwordHash) {
    const plain = process.env.ADMIN_PASSWORD || "admin";
    passwordHash = await bcrypt.hash(plain, 12);
  }

  await User.create({
    email: resolvedEmail,
    name,
    passwordHash,
    role: "admin",
    status: "active",
  });
  console.log(`[users] bootstrap admin created: ${resolvedEmail}`);
}

export async function findUserByEmail(email: string) {
  await connectDB();
  await ensureBootstrapAdmin();
  return User.findOne({ email: email.trim().toLowerCase() });
}

export async function authenticateUser(email: string, password: string) {
  const user = await findUserByEmail(email);
  if (!user || user.status !== "active" || !user.passwordHash) return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return null;
  user.lastLoginAt = new Date();
  await user.save();
  return user;
}

export async function listUsers(): Promise<PublicUser[]> {
  await connectDB();
  const rows = await User.find()
    .sort({ createdAt: -1 })
    .populate("invitedBy", "name")
    .lean();
  return rows.map((u) => toPublic(u as any));
}

export async function inviteUser(opts: {
  email: string;
  name: string;
  invitedById: string;
  invitedByName: string;
}): Promise<{ user: PublicUser; emailSent: boolean }> {
  await connectDB();
  if (!isEmailConfigured()) {
    throw new Error("Email nu este configurat (EMAIL_USER / EMAIL_PASS în .env.local)");
  }

  const email = opts.email.trim().toLowerCase();
  const existing = await User.findOne({ email });
  if (existing) {
    if (existing.status === "active") throw new Error("Există deja un cont activ cu acest email");
    if (existing.status === "disabled") throw new Error("Contul este dezactivat — reactivează-l din admin");
  }

  const token = crypto.randomBytes(32).toString("hex");
  const inviteExpiresAt = new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000);
  const baseUrl = (process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/$/, "");
  const inviteUrl = `${baseUrl}/invite?token=${token}`;

  let doc: UserDoc;
  if (existing) {
    existing.name = opts.name.trim();
    existing.status = "pending";
    existing.inviteToken = token;
    existing.inviteExpiresAt = inviteExpiresAt;
    existing.invitedBy = opts.invitedById as any;
    existing.passwordHash = "";
    await existing.save();
    doc = existing;
  } else {
    doc = await User.create({
      email,
      name: opts.name.trim(),
      role: "user",
      status: "pending",
      inviteToken: token,
      inviteExpiresAt,
      invitedBy: opts.invitedById,
      passwordHash: "",
    });
  }

  await sendInviteEmail({
    to: email,
    name: doc.name,
    inviteUrl,
    invitedByName: opts.invitedByName,
  });

  return { user: toPublic(doc), emailSent: true };
}

export async function validateInviteToken(token: string) {
  await connectDB();
  const user = await User.findOne({ inviteToken: token, status: "pending" });
  if (!user) return { ok: false as const, error: "Invitație invalidă sau deja folosită" };
  if (user.inviteExpiresAt && user.inviteExpiresAt < new Date()) {
    return { ok: false as const, error: "Invitația a expirat — cere adminului o invitație nouă" };
  }
  return { ok: true as const, email: user.email, name: user.name };
}

export async function acceptInvite(token: string, password: string) {
  await connectDB();
  const user = await User.findOne({ inviteToken: token, status: "pending" });
  if (!user) throw new Error("Invitație invalidă sau deja folosită");
  if (user.inviteExpiresAt && user.inviteExpiresAt < new Date()) {
    throw new Error("Invitația a expirat");
  }
  if (password.length < 8) throw new Error("Parola trebuie să aibă minim 8 caractere");

  user.passwordHash = await bcrypt.hash(password, 12);
  user.status = "active";
  user.inviteToken = null;
  user.inviteExpiresAt = null;
  await user.save();
  return { email: user.email, name: user.name };
}

export async function setUserStatus(userId: string, status: "active" | "disabled") {
  await connectDB();
  const user = await User.findById(userId);
  if (!user) throw new Error("Utilizator negăsit");
  if (user.role === "admin" && status === "disabled") {
    const admins = await User.countDocuments({ role: "admin", status: "active", _id: { $ne: user._id } });
    if (admins === 0) throw new Error("Nu poți dezactiva ultimul administrator");
  }
  user.status = status;
  if (status === "active" && !user.passwordHash) {
    throw new Error("Contul nu are parolă — retrimite invitația");
  }
  await user.save();
  return toPublic(user);
}

export async function deleteUser(userId: string, actorId: string) {
  await connectDB();
  if (userId === actorId) throw new Error("Nu îți poți șterge propriul cont");
  const user = await User.findById(userId);
  if (!user) throw new Error("Utilizator negăsit");
  if (user.role === "admin") {
    const admins = await User.countDocuments({ role: "admin" });
    if (admins <= 1) throw new Error("Nu poți șterge ultimul administrator");
  }
  await User.deleteOne({ _id: user._id });
  return { ok: true };
}

export async function resendInvite(userId: string, invitedByName: string) {
  await connectDB();
  if (!isEmailConfigured()) throw new Error("Email nu este configurat");
  const user = await User.findById(userId);
  if (!user || user.status !== "pending") throw new Error("Doar conturile în așteptare pot primi invitație nouă");

  const token = crypto.randomBytes(32).toString("hex");
  user.inviteToken = token;
  user.inviteExpiresAt = new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000);
  await user.save();

  const baseUrl = (process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/$/, "");
  await sendInviteEmail({
    to: user.email,
    name: user.name,
    inviteUrl: `${baseUrl}/invite?token=${token}`,
    invitedByName,
  });
  return toPublic(user);
}
