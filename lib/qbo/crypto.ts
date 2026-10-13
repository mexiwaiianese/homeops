import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function key() {
  // AES-256 key material lives only in INTEGRATION_ENCRYPTION_KEY, outside source control.
  const configured = process.env.INTEGRATION_ENCRYPTION_KEY?.trim();
  if (!configured || configured.length < 32) {
    throw new Error("Set INTEGRATION_ENCRYPTION_KEY to a secret of at least 32 characters before QuickBooks can connect.");
  }
  return createHash("sha256").update(configured).digest();
}

export function encryptSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptSecret(value: string) {
  const [iv, tag, encrypted] = value.split(".");
  if (!iv || !tag || !encrypted) throw new Error("QuickBooks needs to be connected again.");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}
