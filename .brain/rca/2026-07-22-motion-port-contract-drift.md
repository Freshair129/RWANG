---
version: "0.1.0b"
created_at: "2026-07-22T02:20:00+07:00,ATHER,pending"
last_update: "2026-07-22T02:20:00+07:00,ATHER"
status: "beta"
superseded_by: null
attributes:
  domain: "rwang-motion-adapter"
  doc_type: "rca"
  scope: "Motion Lab loopback event port versus approved adapter contract"
---

# RCA - Motion Port Contract Drift

## Symptom

The approved adapter boundary requires a versioned `gesture_command_intent` envelope. Independent review found a local HTTP/WebSocket service already publishes a different, legacy event shape.

## Evidence

- `D:\rwang-motion-lab\app\src-tauri\src\lib.rs` configures `http://127.0.0.1:8766` and accepts `publish_event` payloads.
- `useGestureRuntime.ts` sends the full enriched `GestureEvent` to that command.
- `GestureEvent` includes motion, hand visibility, assistant hints, command state, and dispatch messages and has no contract schema version.
- The current Rust media-command boundary uses a command whitelist, but the experimental opt-in is decided in frontend flow rather than enforced by the command handler.

## Root Cause

The legacy local telemetry bus was built before the harness adapter boundary existed. Its data model was reused as an event stream without a projection, contract validator, or backend policy proof. The later contract documentation incorrectly described the desired boundary as though it were already the active port.

## Why the issue escaped detection

The initial verification covered unit tests, build completion, and static command mapping. It did not inventory the Tauri loopback server or compare its actual payload against the newly defined cross-repository contract.

## Proposed Prevention

Before adapter promotion, add a separate conformance layer that projects only the approved envelope, rejects prohibited fields and unknown versions, and is covered by tests in both repositories. Enforce the explicit opt-in at the backend dispatch boundary. Record a hardware E2E trace that proves the projection and local-only media action.

## Status

No behavior was changed by this RCA. The current loopback service is explicitly non-conforming and must not be connected to the harness adapter port.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---------|------|--------|---------|-------------|-------|
| 0.1.0b | 2026-07-22 | beta | Initial evidence-backed contract-drift RCA. | pending | ATHER |
