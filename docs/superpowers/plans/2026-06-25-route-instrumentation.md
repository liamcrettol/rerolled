# Route Instrumentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add full lifecycle logging to `/api/roulette/roll`, `/api/apply`, and `/api/stats/detect` using `createLogger` so every request — success and failure — appears in Axiom with duration and named business events.

**Architecture:** Each route creates a logger via `createLogger(req, session.userId)` after `requireSession()`, records a start timestamp, emits `*.start` / `*.done` / `*.error` events, and calls `await log.flush()` before every `return`. No new files — only the three existing route files are modified.

**Tech Stack:** `next-axiom` (via `lib/logger.ts` `createLogger`), Next.js 15 App Router, TypeScript strict, Jest 29.

---

## Pre-flight: Create worktree rebased off origin/main

- [ ] **Create worktree on a new branch rebased from origin/main**

```bash
git fetch origin
git worktree add .worktrees/route-instrumentation -b feature/route-instrumentation origin/main
cd .worktrees/route-instrumentation
npm install
```

- [ ] **Run baseline tests to confirm clean start**

```bash
npm test
```

Expected: all tests pass (currently 26 passing on main — the axiom PR tests are on a separate branch).

---

## Files Modified

- `app/api/roulette/roll/route.ts` — add lifecycle logging
- `app/api/apply/route.ts` — add lifecycle logging  
- `app/api/stats/detect/route.ts` — add lifecycle logging
- `__tests__/api/roll.test.ts` — new: logger integration tests for roll route
- `__tests__/api/apply.test.ts` — new: logger integration tests for apply route
- `__tests__/api/detect.test.ts` — new: logger integration tests for detect route

---

## Task 1: Instrument `/api/roulette/roll`

**Files:**
- Modify: `app/api/roulette/roll/route.ts`
- Create: `__tests__/api/roll.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/api/roll.test.ts`:

```typescript
import { POST } from "@/app/api/roulette/roll/route";
import { NextRequest } from "next/server";

const mockFlush = jest.fn();
const mockInfo = jest.fn();
const mockError = jest.fn();
const mockLogger = { info: mockInfo, warn: jest.fn(), error: mockError, debug: jest.fn(), flush: mockFlush };

jest.mock("@/lib/logger", () => ({
  createLogger: jest.fn(() => mockLogger),
}));

jest.mock("@/lib/auth/helpers", () => ({
  requireSession: jest.fn().mockResolvedValue({
    userId: "user-1",
    displayName: "TestUser",
    bungieMembershipType: 3,
    bungieMembershipId: "123",
  }),
}));

jest.mock("@/lib/supabase/admin", () => ({
  adminSupabase: {
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      neq: jest.fn().mockReturnThis(),
      upsert: jest.fn().mockResolvedValue({ error: null }),
      update: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { captain_user_id: "user-1" }, error: null }),
    }),
  },
}));

jest.mock("@/lib/roulette/intersection", () => ({
  rollLoadout: jest.fn().mockReturnValue({ kinetic: 1111, energy: 2222, power: 3333 }),
}));

function makeRollRequest() {
  return new NextRequest("https://example.com/api/roulette/roll", {
    method: "POST",
    headers: { "x-trace-id": "test-trace-123", "content-type": "application/json" },
    body: JSON.stringify({
      lobbyId: "00000000-0000-0000-0000-000000000001",
      roundId: "00000000-0000-0000-0000-000000000002",
      intersection: { kinetic: [1111], energy: [2222], power: [3333] },
      weaponDetails: {
        "1111": { name: "Weapon A", icon: "/icon/a", weaponType: "Auto Rifle", damageType: "Kinetic" },
        "2222": { name: "Weapon B", icon: "/icon/b", weaponType: "Pulse Rifle", damageType: "Solar" },
        "3333": { name: "Weapon C", icon: "/icon/c", weaponType: "Rocket Launcher", damageType: "Arc" },
      },
    }),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("POST /api/roulette/roll logging", () => {
  it("logs roll.start and roll.done on success", async () => {
    const res = await POST(makeRollRequest());
    expect(res.status).toBe(200);
    expect(mockInfo).toHaveBeenCalledWith("roll.start", expect.objectContaining({
      lobbyId: "00000000-0000-0000-0000-000000000001",
      roundId: "00000000-0000-0000-0000-000000000002",
    }));
    expect(mockInfo).toHaveBeenCalledWith("roll.done", expect.objectContaining({
      lobbyId: "00000000-0000-0000-0000-000000000001",
      durationMs: expect.any(Number),
    }));
    expect(mockFlush).toHaveBeenCalled();
  });

  it("logs roll.error and flushes on failure", async () => {
    const { requireSession } = require("@/lib/auth/helpers");
    requireSession.mockRejectedValueOnce(new Error("Unauthorized"));

    const res = await POST(makeRollRequest());
    expect(res.status).toBe(500);
    expect(mockError).toHaveBeenCalledWith("roll.error", expect.objectContaining({
      error: "Unauthorized",
      durationMs: expect.any(Number),
    }));
    expect(mockFlush).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd /path/to/.worktrees/route-instrumentation && npx jest __tests__/api/roll.test.ts --no-coverage
```

Expected: FAIL — `mockInfo` was not called with `"roll.start"` (logger not yet added to route).

- [ ] **Step 3: Instrument `app/api/roulette/roll/route.ts`**

Replace the entire `POST` function with:

```typescript
export async function POST(req: NextRequest) {
  const t = Date.now();
  let log: Awaited<ReturnType<typeof createLogger>> | null = null;
  try {
    const session = await requireSession();
    log = createLogger(req, session.userId);
    const body = schema.parse(await req.json());

    log.info("roll.start", {
      lobbyId: body.lobbyId,
      roundId: body.roundId,
      mode: body.mode ?? "normal",
      rerollSlot: body.rerollSlot ?? null,
      wildcardSlots: body.wildcardSlots ?? [],
    });

    // Verify caller is captain
    const { data: lobby } = await adminSupabase
      .from("lobbies")
      .select("captain_user_id")
      .eq("id", body.lobbyId)
      .single();

    if (lobby?.captain_user_id !== session.userId) {
      await log.flush();
      return NextResponse.json({ error: "Only the captain can roll" }, { status: 403 });
    }

    // No-duplicates mode
    let filteredByHistory = { ...body.intersection };
    if (body.nodup) {
      const { data: prevSlots } = await adminSupabase
        .from("lobby_loadout_slots")
        .select("slot, item_hash, lobby_rounds!inner(lobby_id)")
        .eq("lobby_rounds.lobby_id", body.lobbyId)
        .neq("round_id", body.roundId)
        .neq("item_hash", 0);

      const used: Record<string, Set<number>> = { kinetic: new Set(), energy: new Set(), power: new Set() };
      for (const row of prevSlots ?? []) {
        used[row.slot]?.add(row.item_hash);
      }

      for (const slot of ["kinetic", "energy", "power"] as const) {
        const original = body.intersection[slot];
        const filtered = original.filter((h) => !used[slot].has(h));
        filteredByHistory[slot] = filtered.length > 0 ? filtered : original;
      }
    }

    const wildcards = new Set(body.wildcardSlots ?? []);

    for (const slot of wildcards) {
      await adminSupabase.from("lobby_loadout_slots").upsert(
        {
          round_id: body.roundId,
          slot,
          item_hash: 0,
          weapon_name: "?",
          weapon_icon: "",
          weapon_type: "Any",
          damage_type: "Any",
          locked_by_user_id: session.userId,
        },
        { onConflict: "round_id,slot" }
      );
    }

    const filteredIntersection = {
      kinetic: wildcards.has("kinetic") ? [] : filteredByHistory.kinetic,
      energy: wildcards.has("energy") ? [] : filteredByHistory.energy,
      power: wildcards.has("power") ? [] : filteredByHistory.power,
    };

    const exclude = body.rerollSlot
      ? { [body.rerollSlot]: undefined, ...Object.fromEntries(
          Object.entries(body.keepSlots ?? {}).filter(([, v]) => v !== undefined)
        ) }
      : body.keepSlots;

    const roll = rollLoadout(
      filteredIntersection,
      body.weaponDetails,
      exclude as Partial<Record<WeaponSlot, number>>,
      body.avoid as Partial<Record<WeaponSlot, number[]>> | undefined,
      body.mode
    );

    const slots: WeaponSlot[] = ["kinetic", "energy", "power"];
    for (const slot of slots) {
      if (wildcards.has(slot)) continue;
      const hash = roll[slot];
      if (!hash) continue;
      const detail = body.weaponDetails[hash.toString()];
      if (!detail) continue;

      await adminSupabase.from("lobby_loadout_slots").upsert(
        {
          round_id: body.roundId,
          slot,
          item_hash: hash,
          weapon_name: detail.name,
          weapon_icon: detail.icon,
          weapon_type: detail.weaponType,
          damage_type: detail.damageType,
          locked_by_user_id: session.userId,
        },
        { onConflict: "round_id,slot" }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await adminSupabase.from("lobbies").update({ status: "rolling", last_active_at: new Date().toISOString() } as any).eq("id", body.lobbyId);

    log.info("roll.done", { lobbyId: body.lobbyId, roundId: body.roundId, roll, durationMs: Date.now() - t });
    await log.flush();
    return NextResponse.json({ roll });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (log) {
      log.error("roll.error", { error: msg, durationMs: Date.now() - t });
      await log.flush();
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
```

Also add the import at the top of the file (after existing imports):

```typescript
import { createLogger } from "@/lib/logger";
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
npx jest __tests__/api/roll.test.ts --no-coverage
```

Expected: 2 tests passing.

- [ ] **Step 5: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add app/api/roulette/roll/route.ts __tests__/api/roll.test.ts
git commit -m "feat: instrument roll route with lifecycle logging"
```

---

## Task 2: Instrument `/api/apply`

**Files:**
- Modify: `app/api/apply/route.ts`
- Create: `__tests__/api/apply.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/api/apply.test.ts`:

```typescript
import { POST } from "@/app/api/apply/route";
import { NextRequest } from "next/server";

const mockFlush = jest.fn();
const mockInfo = jest.fn();
const mockError = jest.fn();
const mockLogger = { info: mockInfo, warn: jest.fn(), error: mockError, debug: jest.fn(), flush: mockFlush };

jest.mock("@/lib/logger", () => ({
  createLogger: jest.fn(() => mockLogger),
}));

jest.mock("@/lib/auth/helpers", () => ({
  requireSession: jest.fn().mockResolvedValue({
    userId: "user-1",
    displayName: "TestUser",
    bungieMembershipType: 3,
    bungieMembershipId: "123",
  }),
  getBungieToken: jest.fn().mockResolvedValue("fake-token"),
}));

jest.mock("@/lib/supabase/admin", () => ({
  adminSupabase: {
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      insert: jest.fn().mockResolvedValue({ error: null }),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
      single: jest.fn().mockResolvedValue({ data: { captain_locked: false }, error: null }),
    }),
    rpc: jest.fn().mockResolvedValue({ data: false, error: null }),
  },
}));

jest.mock("@/lib/bungie/rawInventory", () => ({
  getRawWeapons: jest.fn().mockResolvedValue([]),
}));

jest.mock("@/lib/bungie/equip", () => ({
  applyWeapons: jest.fn().mockResolvedValue([
    { user_id: "user-1", display_name: "TestUser", slot: "kinetic", item_hash: 1111, success: true, weapon_name: "Weapon A", weapon_icon: "/icon/a" },
  ]),
  ensureInventorySpace: jest.fn().mockResolvedValue([]),
}));

jest.mock("@/lib/bungie/definitions", () => ({
  getWeaponDefinition: jest.fn().mockResolvedValue({ name: "Weapon A", icon: "/icon/a" }),
}));

jest.mock("@/lib/lobby", () => ({
  rotateCaptain: jest.fn().mockResolvedValue(undefined),
}));

function makeApplyRequest() {
  return new NextRequest("https://example.com/api/apply", {
    method: "POST",
    headers: { "x-trace-id": "test-trace-456", "content-type": "application/json" },
    body: JSON.stringify({
      lobbyId: "00000000-0000-0000-0000-000000000001",
      roundId: "00000000-0000-0000-0000-000000000002",
      characterId: "char-1",
    }),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  const { adminSupabase } = require("@/lib/supabase/admin");
  adminSupabase.from.mockReturnValue({
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    insert: jest.fn().mockResolvedValue({ error: null }),
    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    single: jest.fn().mockResolvedValue({ data: { captain_locked: false, round_number: 1 }, error: null }),
    not: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
  });
  // slots returns empty array (wildcard-only, no weapons to apply)
  adminSupabase.from.mockReturnValueOnce({
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockResolvedValue({ data: [], error: null }),
  });
});

describe("POST /api/apply logging", () => {
  it("logs apply.start and apply.done on success", async () => {
    const res = await POST(makeApplyRequest());
    expect(mockInfo).toHaveBeenCalledWith("apply.start", expect.objectContaining({
      lobbyId: "00000000-0000-0000-0000-000000000001",
      roundId: "00000000-0000-0000-0000-000000000002",
      characterId: "char-1",
    }));
    expect(mockInfo).toHaveBeenCalledWith("apply.done", expect.objectContaining({
      lobbyId: "00000000-0000-0000-0000-000000000001",
      durationMs: expect.any(Number),
    }));
    expect(mockFlush).toHaveBeenCalled();
  });

  it("logs apply.error and flushes on failure", async () => {
    const { requireSession } = require("@/lib/auth/helpers");
    requireSession.mockRejectedValueOnce(new Error("Unauthorized"));

    const res = await POST(makeApplyRequest());
    expect(res.status).toBe(401);
    expect(mockError).toHaveBeenCalledWith("apply.error", expect.objectContaining({
      error: "Unauthorized",
      durationMs: expect.any(Number),
    }));
    expect(mockFlush).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx jest __tests__/api/apply.test.ts --no-coverage
```

Expected: FAIL — `mockInfo` not called with `"apply.start"`.

- [ ] **Step 3: Instrument `app/api/apply/route.ts`**

Add this import after the existing imports:

```typescript
import { createLogger } from "@/lib/logger";
```

Replace the entire `POST` function with:

```typescript
export async function POST(req: NextRequest) {
  const t = Date.now();
  let log: Awaited<ReturnType<typeof createLogger>> | null = null;
  try {
    const session = await requireSession();
    log = createLogger(req, session.userId);
    const body = schema.parse(await req.json());
    const preferredInstances = body.preferredInstances ?? {};

    log.info("apply.start", {
      lobbyId: body.lobbyId,
      roundId: body.roundId,
      characterId: body.characterId,
    });

    const { data: slots } = await adminSupabase
      .from("lobby_loadout_slots")
      .select("*")
      .eq("round_id", body.roundId);

    if (!slots?.length) {
      await log.flush();
      return NextResponse.json({ error: "No loadout rolled yet" }, { status: 400 });
    }

    const token = await getBungieToken(session.userId);
    const myWeapons = await getRawWeapons(
      session.bungieMembershipType,
      session.bungieMembershipId,
      token
    );

    const weaponsToApply: WeaponToApply[] = [];
    const missing: ApplyResult[] = [];
    for (const slot of slots) {
      if (slot.item_hash === 0) continue;
      const best = findBestInstance(slot.item_hash, myWeapons, body.characterId, preferredInstances[slot.slot]);
      if (!best) {
        missing.push({
          user_id: session.userId,
          display_name: session.displayName,
          slot: slot.slot as WeaponSlot,
          item_hash: slot.item_hash,
          success: false,
          error: `Not in inventory - pull ${slot.weapon_name} from Collections in-game, then Apply again`,
          weapon_name: slot.weapon_name,
          weapon_icon: slot.weapon_icon,
        });
        continue;
      }
      weaponsToApply.push({
        itemHash: best.itemHash,
        itemInstanceId: best.itemInstanceId,
        slot: slot.slot as "kinetic" | "energy" | "power",
        location: best.location,
        characterId: best.characterId,
      });
    }

    const loadoutInstanceIds = new Set(weaponsToApply.map((w) => w.itemInstanceId));

    const clearResults = await ensureInventorySpace(
      body.characterId,
      token,
      session.bungieMembershipType,
      myWeapons,
      weaponsToApply.length,
      loadoutInstanceIds
    );

    if (clearResults.length > 0) {
      log.info("apply.inventory_cleared", {
        lobbyId: body.lobbyId,
        count: clearResults.length,
        durationMs: Date.now() - t,
      });
    }

    const rosterAfterClearing = myWeapons.filter(
      (w) => !clearResults.find((r) => r.itemInstanceId === w.itemInstanceId)
    );

    const equipResults = await applyWeapons(
      weaponsToApply,
      body.characterId,
      session.bungieMembershipType,
      token,
      session.userId,
      session.displayName,
      rosterAfterClearing
    );

    const clearResultsEnriched = await Promise.all(
      clearResults.map(async (r) => {
        const def = await getWeaponDefinition(r.itemHash);
        return {
          user_id: session.userId,
          display_name: session.displayName,
          slot: "kinetic" as WeaponSlot,
          item_hash: r.itemHash,
          success: r.success,
          error: r.error ? `Vaulted to make room: ${r.error}` : undefined,
          error_detail: r.error,
          weapon_name: def?.name,
          weapon_icon: def?.icon,
          kind: "vault" as const,
        };
      })
    );

    const results = [...clearResultsEnriched, ...equipResults, ...missing];

    const appliedAt = new Date().toISOString();
    const [{ data: existingHistory }, { data: roundRow }] = await Promise.all([
      adminSupabase.from("roll_history").select("id").eq("round_id", body.roundId).maybeSingle(),
      adminSupabase.from("lobby_rounds").select("round_number").eq("id", body.roundId).maybeSingle(),
    ]);
    const roundNumber = roundRow?.round_number ?? 0;

    if (existingHistory) {
      await adminSupabase
        .from("roll_history")
        .update({ applied_at: appliedAt, apply_results: results })
        .eq("id", existingHistory.id);
    } else {
      await adminSupabase.from("roll_history").insert({
        lobby_id: body.lobbyId,
        round_id: body.roundId,
        round_number: roundNumber,
        applied_at: appliedAt,
        apply_results: results,
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await adminSupabase.from("lobbies").update({ status: "in_game", last_active_at: appliedAt } as any).eq("id", body.lobbyId);

    const { data: shouldRotate } = await adminSupabase.rpc("mark_player_applied", {
      p_round_id: body.roundId,
      p_user_id: session.userId,
      p_lobby_id: body.lobbyId,
    });

    if (shouldRotate) {
      const { data: lobbyRow } = await adminSupabase
        .from("lobbies")
        .select("captain_locked")
        .eq("id", body.lobbyId)
        .single();

      if (!lobbyRow?.captain_locked) {
        await rotateCaptain(body.lobbyId);
      }
    }

    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;
    log.info("apply.done", {
      lobbyId: body.lobbyId,
      roundId: body.roundId,
      total: results.length,
      succeeded,
      failed,
      durationMs: Date.now() - t,
    });
    await log.flush();
    return NextResponse.json({ results });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (log) {
      log.error("apply.error", { error: msg, durationMs: Date.now() - t });
      await log.flush();
    }
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
npx jest __tests__/api/apply.test.ts --no-coverage
```

Expected: 2 tests passing.

- [ ] **Step 5: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add app/api/apply/route.ts __tests__/api/apply.test.ts
git commit -m "feat: instrument apply route with lifecycle logging"
```

---

## Task 3: Instrument `/api/stats/detect`

**Files:**
- Modify: `app/api/stats/detect/route.ts`
- Create: `__tests__/api/detect.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/api/detect.test.ts`:

```typescript
import { POST } from "@/app/api/stats/detect/route";
import { NextRequest } from "next/server";

const mockFlush = jest.fn();
const mockInfo = jest.fn();
const mockError = jest.fn();
const mockLogger = { info: mockInfo, warn: jest.fn(), error: mockError, debug: jest.fn(), flush: mockFlush };

jest.mock("@/lib/logger", () => ({
  createLogger: jest.fn(() => mockLogger),
}));

jest.mock("@/lib/auth/helpers", () => ({
  requireSession: jest.fn().mockResolvedValue({
    userId: "user-1",
    displayName: "TestUser",
    bungieMembershipType: 3,
    bungieMembershipId: "123",
  }),
  getBungieToken: jest.fn().mockResolvedValue("fake-token"),
}));

const mockFrom = jest.fn();
jest.mock("@/lib/supabase/admin", () => ({
  adminSupabase: { from: mockFrom, rpc: jest.fn() },
}));

jest.mock("@/lib/stats/record", () => ({
  detectAndRecordGame: jest.fn().mockResolvedValue({ status: "no_game" }),
}));

function makeDetectRequest() {
  return new NextRequest("https://example.com/api/stats/detect", {
    method: "POST",
    headers: { "x-trace-id": "test-trace-789", "content-type": "application/json" },
    body: JSON.stringify({ lobbyId: "00000000-0000-0000-0000-000000000001" }),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("POST /api/stats/detect logging", () => {
  it("logs detect.start and detect.skipped when lobby is done", async () => {
    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { status: "done" }, error: null }),
    });

    const res = await POST(makeDetectRequest());
    expect(res.status).toBe(200);
    expect(mockInfo).toHaveBeenCalledWith("detect.start", expect.objectContaining({
      lobbyId: "00000000-0000-0000-0000-000000000001",
    }));
    expect(mockInfo).toHaveBeenCalledWith("detect.skipped", expect.objectContaining({
      lobbyId: "00000000-0000-0000-0000-000000000001",
      reason: "lobby_done",
    }));
    expect(mockFlush).toHaveBeenCalled();
  });

  it("logs detect.error and flushes on failure", async () => {
    const { requireSession } = require("@/lib/auth/helpers");
    requireSession.mockRejectedValueOnce(new Error("Unauthorized"));

    const res = await POST(makeDetectRequest());
    expect(res.status).toBe(401);
    expect(mockError).toHaveBeenCalledWith("detect.error", expect.objectContaining({
      error: "Unauthorized",
      durationMs: expect.any(Number),
    }));
    expect(mockFlush).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx jest __tests__/api/detect.test.ts --no-coverage
```

Expected: FAIL — `mockInfo` not called with `"detect.start"`.

- [ ] **Step 3: Instrument `app/api/stats/detect/route.ts`**

Add this import after the existing imports:

```typescript
import { createLogger } from "@/lib/logger";
```

Replace the entire `POST` function with:

```typescript
export async function POST(req: NextRequest) {
  const t = Date.now();
  let log: Awaited<ReturnType<typeof createLogger>> | null = null;
  try {
    const session = await requireSession();
    log = createLogger(req, session.userId);

    const { lobbyId } = schema.parse(await req.json());

    log.info("detect.start", { lobbyId });

    // ── Step 0: Bail out if this lobby's session has already ended ──────────
    const { data: lobbyStatus } = await adminSupabase
      .from("lobbies")
      .select("status")
      .eq("id", lobbyId)
      .single();

    if (!lobbyStatus || lobbyStatus.status === "done") {
      log.info("detect.skipped", { lobbyId, reason: "lobby_done" });
      await log.flush();
      return NextResponse.json({ done: false, pending: false });
    }

    // ── Step 1: Find the most recent apply time for this lobby ──────────────
    const { data: recentHistory } = await adminSupabase
      .from("roll_history")
      .select("applied_at, round_id")
      .eq("lobby_id", lobbyId)
      .not("applied_at", "is", null)
      .order("applied_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!recentHistory?.applied_at) {
      log.info("detect.skipped", { lobbyId, reason: "no_apply" });
      await log.flush();
      return NextResponse.json({ done: false, pending: false });
    }

    const appliedAt = recentHistory.applied_at as string;

    // ── Step 2: Check if a session already exists for THIS round ───────────
    const { data: existingSession } = await adminSupabase
      .from("game_sessions")
      .select("id, player_game_stats(*)")
      .eq("lobby_id", lobbyId)
      .gte("played_at", appliedAt)
      .order("played_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingSession) {
      log.info("detect.skipped", { lobbyId, reason: "already_detected" });
      await log.flush();
      const stats = (existingSession.player_game_stats ?? []).map((s) => ({
        userId: s.user_id,
        displayName: s.display_name,
        kills: s.kills,
        deaths: s.deaths,
        assists: s.assists,
        kd: Number(s.kd),
        rouletteWeaponKills: s.roulette_weapon_kills,
      }));
      return NextResponse.json({ done: true, stats });
    }

    // ── Step 3: Load members ─────────────────────────────────────────────────
    const { data: members } = await adminSupabase
      .from("lobby_members")
      .select("user_id, display_name, bungie_membership_type, bungie_membership_id, selected_character_id")
      .eq("lobby_id", lobbyId);

    if (!members?.length) {
      log.info("detect.skipped", { lobbyId, reason: "no_apply" });
      await log.flush();
      return NextResponse.json({ done: false });
    }

    const memberInputs = members
      .filter((m) => m.selected_character_id)
      .map((m) => ({
        userId: m.user_id,
        displayName: m.display_name,
        membershipType: m.bungie_membership_type,
        membershipId: m.bungie_membership_id,
        characterId: m.selected_character_id!,
      }));

    if (memberInputs.length < 2) {
      log.info("detect.skipped", { lobbyId, reason: "no_apply" });
      await log.flush();
      return NextResponse.json({ done: false, pending: true });
    }

    // ── Step 4: Get CURRENT round's loadout slots only ────────────────────
    const { data: slots } = await adminSupabase
      .from("lobby_loadout_slots")
      .select("item_hash")
      .eq("round_id", recentHistory.round_id);

    const rouletteHashes = [...new Set(
      (slots ?? []).map((s) => s.item_hash).filter((h) => h !== 0)
    )];

    if (!rouletteHashes.length) {
      log.info("detect.skipped", { lobbyId, reason: "no_apply" });
      await log.flush();
      return NextResponse.json({ done: false, pending: true });
    }

    const callerMember = members.find((m) => m.user_id === session.userId);
    if (!callerMember?.selected_character_id) {
      log.info("detect.skipped", { lobbyId, reason: "no_apply" });
      await log.flush();
      return NextResponse.json({ done: false, pending: true });
    }

    // ── Step 5: Get the caller's token ───────────────────────────────────────
    const token = await getBungieToken(session.userId);

    // ── Step 6: Claim the detection slot ─────────────────────────────────────
    const { data: claimed } = await adminSupabase.rpc("claim_detection", {
      p_round_id: recentHistory.round_id,
      p_ttl_seconds: DETECT_LEASE_SECONDS,
    });
    if (!claimed) {
      log.info("detect.skipped", { lobbyId, reason: "lease_taken" });
      await log.flush();
      return NextResponse.json({ done: false, pending: true });
    }

    log.info("detect.claimed", { lobbyId, roundId: recentHistory.round_id });

    // ── Step 7: Scan + record ────────────────────────────────────────────────
    const outcome = await detectAndRecordGame({
      lobbyId,
      roundId: recentHistory.round_id,
      appliedAt,
      members: memberInputs,
      rouletteHashes,
      token,
      tokenOwnerUserId: session.userId,
    });

    const found = outcome.status !== "no_game";
    log.info("detect.done", { lobbyId, roundId: recentHistory.round_id, found, durationMs: Date.now() - t });
    await log.flush();

    if (!found) return NextResponse.json({ done: false, pending: true });
    return NextResponse.json({ done: true, stats: outcome.stats });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (log) {
      log.error("detect.error", { error: msg, durationMs: Date.now() - t });
      await log.flush();
    }
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
npx jest __tests__/api/detect.test.ts --no-coverage
```

Expected: 2 tests passing.

- [ ] **Step 5: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add app/api/stats/detect/route.ts __tests__/api/detect.test.ts
git commit -m "feat: instrument detect route with lifecycle logging"
```

---

## Task 4: Full test suite verification

- [ ] **Step 1: Run all tests**

```bash
npm test
```

Expected: all existing tests pass plus the 6 new tests (2 per route).

---

## Task 5: Open PR

- [ ] **Step 1: Push branch**

```bash
git push -u origin feature/route-instrumentation
```

- [ ] **Step 2: Open PR**

```bash
gh pr create \
  --title "feat: instrument key routes with Axiom lifecycle logging" \
  --body "Adds full lifecycle logging to /api/roulette/roll, /api/apply, and /api/stats/detect. Every request logs a start event, outcome event (done/skipped), and error event with duration. Requires the Axiom observability PR (#115) to be merged first."
```
