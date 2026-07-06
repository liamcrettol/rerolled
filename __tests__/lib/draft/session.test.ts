import {
  createDraftState,
  buildTurnSequence,
  getCurrentTurn,
  isDraftComplete,
  applyPick,
  getPicksForUser,
  isUserLoadoutComplete,
} from "@/lib/draft/session";

const A = "userA";
const B = "userB";
const C = "userC";

describe("createDraftState", () => {
  it("rejects fewer than 2 players", () => {
    expect(() => createDraftState([A])).toThrow(/at least 2 players/);
  });

  it("starts with no picks", () => {
    const state = createDraftState([A, B]);
    expect(state.picks).toEqual([]);
  });
});

describe("buildTurnSequence", () => {
  it("is slot-major round robin across all players", () => {
    const state = createDraftState([A, B, C]);
    const turns = buildTurnSequence(state);
    expect(turns.map((t) => `${t.forUserId}:${t.slot}`)).toEqual([
      "userA:kinetic",
      "userB:kinetic",
      "userC:kinetic",
      "userA:energy",
      "userB:energy",
      "userC:energy",
      "userA:power",
      "userB:power",
      "userC:power",
    ]);
    expect(turns).toHaveLength(9);
  });

  it("omits a skipped/disconnected player's turns entirely", () => {
    const state = createDraftState([A, B, C], [B]);
    const turns = buildTurnSequence(state);
    expect(turns.some((t) => t.forUserId === B)).toBe(false);
    expect(turns).toHaveLength(6);
  });
});

describe("getCurrentTurn / isDraftComplete", () => {
  it("returns the next unfilled turn", () => {
    const state = createDraftState([A, B]);
    expect(getCurrentTurn(state)).toEqual({ forUserId: A, slot: "kinetic", pickNumber: 1 });
    expect(isDraftComplete(state)).toBe(false);
  });

  it("is complete once every turn has a pick, including the last pick", () => {
    let state = createDraftState([A, B]);
    const turns = buildTurnSequence(state);
    for (const turn of turns) {
      // Whoever isn't the subject picks for them.
      const picker = turn.forUserId === A ? B : A;
      const result = applyPick(state, picker, 111);
      expect(result.ok).toBe(true);
      if (result.ok) state = result.state;
    }
    expect(isDraftComplete(state)).toBe(true);
    expect(getCurrentTurn(state)).toBeNull();
  });

  it("rejects any further pick once complete", () => {
    let state = createDraftState([A, B]);
    for (const turn of buildTurnSequence(state)) {
      const picker = turn.forUserId === A ? B : A;
      const result = applyPick(state, picker, 111);
      if (result.ok) state = result.state;
    }
    const result = applyPick(state, A, 999);
    expect(result).toEqual({ ok: false, error: "Draft is already complete" });
  });
});

describe("applyPick", () => {
  it("rejects a subject picking their own weapon", () => {
    const state = createDraftState([A, B]);
    const result = applyPick(state, A, 111);
    expect(result).toEqual({
      ok: false,
      error: "You can't pick your own weapon — a teammate has to pick for you",
    });
  });

  it("rejects a picker who isn't part of the draft", () => {
    const state = createDraftState([A, B]);
    const result = applyPick(state, "stranger", 111);
    expect(result).toEqual({ ok: false, error: "Only fireteam members in this draft can pick" });
  });

  it("rejects a disconnected player from making picks", () => {
    const state = createDraftState([A, B, C], [C]);
    const result = applyPick(state, C, 111);
    expect(result).toEqual({ ok: false, error: "Disconnected players can't make picks" });
  });

  it("enforces the shared pool for the current slot when provided", () => {
    const state = createDraftState([A, B]);
    const rejected = applyPick(state, B, 999, { kinetic: [111, 222] });
    expect(rejected).toEqual({
      ok: false,
      error: "That weapon isn't in the shared pool for this slot",
    });

    const accepted = applyPick(state, B, 111, { kinetic: [111, 222] });
    expect(accepted.ok).toBe(true);
  });

  it("leaves a slot unvalidated when the pool omits that slot key", () => {
    const state = createDraftState([A, B]);
    const result = applyPick(state, B, 999, { energy: [1, 2] });
    expect(result.ok).toBe(true);
  });

  it("advances pickNumber and records who picked for whom", () => {
    const state = createDraftState([A, B]);
    const result = applyPick(state, B, 555);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pick).toEqual({
      forUserId: A,
      pickedByUserId: B,
      slot: "kinetic",
      itemHash: 555,
      pickNumber: 1,
    });
    expect(getCurrentTurn(result.state)).toEqual({ forUserId: B, slot: "kinetic", pickNumber: 2 });
  });
});

describe("getPicksForUser / isUserLoadoutComplete", () => {
  it("reports an incomplete loadout for a skipped/disconnected player", () => {
    const state = createDraftState([A, B, C], [C]);
    expect(getPicksForUser(state, C)).toEqual({});
    expect(isUserLoadoutComplete(state, C)).toBe(false);
  });

  it("reports a complete loadout once all three slots are picked", () => {
    let state = createDraftState([A, B]);
    for (const turn of buildTurnSequence(state)) {
      const picker = turn.forUserId === A ? B : A;
      const hash = turn.slot === "kinetic" ? 1 : turn.slot === "energy" ? 2 : 3;
      const result = applyPick(state, picker, hash);
      if (result.ok) state = result.state;
    }
    expect(getPicksForUser(state, A)).toEqual({ kinetic: 1, energy: 2, power: 3 });
    expect(isUserLoadoutComplete(state, A)).toBe(true);
    expect(isUserLoadoutComplete(state, B)).toBe(true);
  });
});
