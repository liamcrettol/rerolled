/** @jest-environment node */
import { checkRoundAccess } from "@/lib/lobby/roundAccess";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeDb(config: Record<string, any>) {
  return {
    from(table: string) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () => config[table] ?? { data: null, error: null },
      };
      return builder;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

const input = { lobbyId: "lobby-a", roundId: "round-1" };

describe("checkRoundAccess", () => {
  it("allows a round of the lobby", async () => {
    const db = makeDb({ lobby_rounds: { data: { lobby_id: "lobby-a" }, error: null } });
    await expect(checkRoundAccess(input, db)).resolves.toBe("ok");
  });

  it("refuses a round of another lobby, and a round that does not exist", async () => {
    await expect(checkRoundAccess(input, makeDb({ lobby_rounds: { data: { lobby_id: "lobby-b" }, error: null } })))
      .resolves.toBe("round_mismatch");
    await expect(checkRoundAccess(input, makeDb({}))).resolves.toBe("round_mismatch");
  });

  it("refuses a signed-in user who is not a member of the lobby", async () => {
    const db = makeDb({ lobby_rounds: { data: { lobby_id: "lobby-a" }, error: null } });
    await expect(checkRoundAccess({ ...input, memberUserId: "outsider" }, db)).resolves.toBe("not_member");
  });

  it("allows a member", async () => {
    const db = makeDb({
      lobby_rounds: { data: { lobby_id: "lobby-a" }, error: null },
      lobby_members: { data: { user_id: "u1" }, error: null },
    });
    await expect(checkRoundAccess({ ...input, memberUserId: "u1" }, db)).resolves.toBe("ok");
  });

  it("throws on a database error instead of answering either way", async () => {
    await expect(checkRoundAccess(input, makeDb({ lobby_rounds: { data: null, error: { message: "timeout" } } })))
      .rejects.toThrow("Round lookup failed: timeout");
    const db = makeDb({
      lobby_rounds: { data: { lobby_id: "lobby-a" }, error: null },
      lobby_members: { data: null, error: { message: "timeout" } },
    });
    await expect(checkRoundAccess({ ...input, memberUserId: "u1" }, db)).rejects.toThrow("Lobby membership lookup failed: timeout");
  });
});
