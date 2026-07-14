/** @jest-environment node */
import { verifyMigratedRow } from "../../scripts/lib/verifyMigratedRow.mjs";

describe("verifyMigratedRow", () => {
  it("verifies a cleared row without invoking the raw-payload guard", async () => {
    const verifyRawPgcr = jest.fn().mockResolvedValue({ ok: true, bytes: 123 });
    const markArchivedIfCurrent = jest.fn();
    const row = { instance_id: "123", appwrite_sha256: "abc", payload: null };

    await expect(verifyMigratedRow({}, row, { verifyRawPgcr, markArchivedIfCurrent })).resolves.toEqual({
      ok: true,
      bytes: 123,
    });
    expect(markArchivedIfCurrent).not.toHaveBeenCalled();
  });

  it("guards a still-present Supabase payload with the three-argument RPC adapter", async () => {
    const verifyRawPgcr = jest.fn().mockResolvedValue({ ok: true, bytes: 123 });
    const markArchivedIfCurrent = jest.fn().mockResolvedValue(true);
    const client = {};
    const row = { instance_id: "123", appwrite_sha256: "abc", payload: "{}" };

    await expect(verifyMigratedRow(client, row, { verifyRawPgcr, markArchivedIfCurrent })).resolves.toEqual({
      ok: true,
      bytes: 123,
    });
    expect(markArchivedIfCurrent).toHaveBeenCalledWith(client, "123", "abc", false);
  });

  it("reports a checksum mismatch without stamping anything", async () => {
    const verifyRawPgcr = jest.fn().mockResolvedValue({ ok: false, bytes: 123 });
    const markArchivedIfCurrent = jest.fn();

    await expect(
      verifyMigratedRow({}, { instance_id: "123", appwrite_sha256: "abc", payload: null }, {
        verifyRawPgcr,
        markArchivedIfCurrent,
      }),
    ).resolves.toEqual({ ok: false, errorClass: "verify_mismatch" });
    expect(markArchivedIfCurrent).not.toHaveBeenCalled();
  });
});
