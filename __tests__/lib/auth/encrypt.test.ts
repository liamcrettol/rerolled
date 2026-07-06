/** @jest-environment node */
import { decryptToken, encryptToken } from "@/lib/auth/encrypt";

describe("TOKEN_ENCRYPTION_KEY formats", () => {
  const originalKey = process.env.TOKEN_ENCRYPTION_KEY;

  afterEach(() => {
    if (originalKey === undefined) delete process.env.TOKEN_ENCRYPTION_KEY;
    else process.env.TOKEN_ENCRYPTION_KEY = originalKey;
  });

  it("round-trips tokens with a 64-character hex key", async () => {
    process.env.TOKEN_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    const ciphertext = await encryptToken("secret-token");
    await expect(decryptToken(ciphertext)).resolves.toBe("secret-token");
  });

  it("round-trips tokens with a legacy base64 key", async () => {
    process.env.TOKEN_ENCRYPTION_KEY = "hd0iIze2jlBdMFFNPkxpZkfGaTAtZt6+kL9XDE3TDw8=";

    const ciphertext = await encryptToken("secret-token");
    await expect(decryptToken(ciphertext)).resolves.toBe("secret-token");
  });

  it("rejects malformed keys", async () => {
    process.env.TOKEN_ENCRYPTION_KEY = "not-a-real-key";

    await expect(encryptToken("secret-token")).rejects.toThrow(
      "TOKEN_ENCRYPTION_KEY must be a 64-character hex string or base64-encoded 32-byte key"
    );
  });
});
