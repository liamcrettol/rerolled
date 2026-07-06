// AES-256-GCM encryption for storing OAuth tokens in Supabase.
// TOKEN_ENCRYPTION_KEY accepts either:
//   - 64-char hex (current preferred format)
//   - 32-byte base64 (legacy/local-dev format still present in older env files)

function getKey(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new Error("TOKEN_ENCRYPTION_KEY must be set");
  }

  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }

  const base64 = Buffer.from(raw, "base64");
  if (base64.length === 32 && base64.toString("base64").replace(/=+$/, "") === raw.replace(/=+$/, "")) {
    return base64;
  }

  throw new Error("TOKEN_ENCRYPTION_KEY must be a 64-character hex string or base64-encoded 32-byte key");
}

export async function encryptToken(plaintext: string): Promise<string> {
  const { createCipheriv, randomBytes } = await import("crypto");
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  // Format: iv(12):tag(16):ciphertext - all base64
  return [iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(":");
}

export async function decryptToken(ciphertext: string): Promise<string> {
  const { createDecipheriv } = await import("crypto");
  const key = getKey();
  const [ivB64, tagB64, dataB64] = ciphertext.split(":");
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(data) + decipher.final("utf8");
}
