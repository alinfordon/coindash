import crypto from "crypto";

const RAW_KEY = (process.env.ENCRYPTION_KEY || "nexus_default_dev_key_change_please").padEnd(32, "0").slice(0, 32);
const KEY = Buffer.from(RAW_KEY, "utf8");

export function encrypt(plain: string): string {
  if (!plain) return "";
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

export function decrypt(payload: string): string {
  if (!payload) return "";
  if (!payload.startsWith("v1:")) return payload; // legacy / plain
  try {
    const [, ivHex, tagHex, dataHex] = payload.split(":");
    const iv = Buffer.from(ivHex, "hex");
    const tag = Buffer.from(tagHex, "hex");
    const data = Buffer.from(dataHex, "hex");
    const decipher = crypto.createDecipheriv("aes-256-gcm", KEY, iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(data), decipher.final()]);
    return dec.toString("utf8");
  } catch {
    return "";
  }
}

export function mask(s?: string | null) {
  if (!s) return "";
  if (s.length <= 6) return "••••";
  return `${s.slice(0, 3)}••••${s.slice(-3)}`;
}
