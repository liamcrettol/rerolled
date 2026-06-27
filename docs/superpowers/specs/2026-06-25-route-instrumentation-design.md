# Route Instrumentation — Design Spec

**Date:** 2026-06-25  
**Status:** Approved

## Goal

Instrument the three most critical API routes with full lifecycle logging via `createLogger` so every request — success and failure — is visible in Axiom with duration, context, and named business events.

## Routes in Scope

- `app/api/roulette/roll/route.ts`
- `app/api/apply/route.ts`
- `app/api/stats/detect/route.ts`

## Pattern

Every route follows the same shape:

1. Call `createLogger(req, session.userId)` once per request — pre-binds `traceId`, `path`, `method`, `userId` to every log line
2. Record `Date.now()` at the top for duration tracking
3. Log a `*.start` event with key input context
4. Log a `*.done` event on success with outcome fields and `durationMs`
5. In the existing `catch` block, log a `*.error` event before returning
6. Call `await log.flush()` before every return — required in serverless to ensure buffered logs are sent before the function exits

Note: `createLogger` cannot be called before `requireSession()` since `userId` comes from the session. For the start event, userId will already be bound since the logger is created after `requireSession()`.

## Log Events Per Route

### `/api/roulette/roll`

| Event | Level | Fields |
|-------|-------|--------|
| `roll.start` | info | `lobbyId`, `roundId`, `mode`, `rerollSlot`, `wildcardSlots` |
| `roll.done` | info | `lobbyId`, `roundId`, `roll` (weapon hashes object), `durationMs` |
| `roll.error` | error | `lobbyId`, `error`, `durationMs` |

### `/api/apply`

| Event | Level | Fields |
|-------|-------|--------|
| `apply.start` | info | `lobbyId`, `roundId`, `characterId` |
| `apply.inventory_cleared` | info | `lobbyId`, `count` (weapons vaulted), `durationMs` |
| `apply.done` | info | `lobbyId`, `roundId`, `total`, `succeeded`, `failed`, `durationMs` |
| `apply.error` | error | `lobbyId`, `error`, `durationMs` |

### `/api/stats/detect`

| Event | Level | Fields |
|-------|-------|--------|
| `detect.start` | info | `lobbyId` |
| `detect.skipped` | info | `lobbyId`, `reason` (one of: `"lobby_done"`, `"no_apply"`, `"already_detected"`, `"lease_taken"`) |
| `detect.claimed` | info | `lobbyId`, `roundId` |
| `detect.done` | info | `lobbyId`, `roundId`, `found` (boolean), `durationMs` |
| `detect.error` | error | `lobbyId`, `error`, `durationMs` |

## flush() Placement

`await log.flush()` must be called before every `return` statement in the route, including early returns (e.g. `detect.skipped`). This is the most error-prone part of instrumentation — missing a flush on an early return means those log lines are silently dropped.

## What Is Not In Scope

- Instrumenting any other routes beyond the three listed
- Logging individual Bungie API calls as spans
- Logging Supabase query durations
- Any UI changes
