---
version: "0.1.2b"
created_at: "2026-07-22T02:00:00+07:00,ATHER,pending"
last_update: "2026-07-22T03:10:00+07:00,ATHER"
status: "beta"
superseded_by: null
attributes:
  domain: "rwang-architecture"
  doc_type: "adapter-contract"
  scope: "rwang-motion-lab outbound command-intent port"
  language: "en"
---

# Contract — Desktop Motion Gesture Command Intent

## Purpose

This is the only permitted outbound payload from the experimental `rwang-motion-lab` adapter to the RWANG harness. It represents a local gesture classification and policy decision; it is not a camera, frame, landmark stream, OS-input request, or arbitrary command channel.

## Envelope

```json
{
  "schema_version": "gesture_command_intent/v1",
  "intent_id": "01J...",
  "occurred_at": "2026-07-22T02:00:00.000Z",
  "source": {
    "adapter": "rwang-motion-lab",
    "adapter_version": "0.1.7",
    "device_scope": "local"
  },
  "gesture": {
    "type": "swipe_left",
    "handedness": "Left",
    "confidence": 0.91
  },
  "policy": {
    "result": "armed",
    "reason": "experimental_command_mode_enabled"
  },
  "command": "media_previous_track"
}
```

## Required invariants

1. `schema_version` is exactly `gesture_command_intent/v1`.
2. `intent_id` is non-empty and unique per adapter process; `occurred_at` is ISO-8601 UTC.
3. `source.adapter` is exactly `rwang-motion-lab`; `source.device_scope` is exactly `local`.
4. `gesture.type`, `gesture.handedness`, and `gesture.confidence` describe the classified gesture only. Confidence is a finite number in `[0, 1]`.
5. `policy.result` is one of `disabled`, `blocked`, `armed`, or `observed`. The harness must treat anything except `armed` as non-dispatchable.
6. `command` is one of: `media_play_pause`, `media_next_track`, `media_previous_track`, `media_volume_up`, `media_volume_down`, `media_mute`.
7. An `armed` payload does not itself authorize OS dispatch. The local desktop application keeps its explicit opt-in and whitelist gate; the harness can record, approve, or reject an intent but cannot request raw input injection through this port.

## Current compatibility status

The current Motion Lab implementation projects executable gestures into this envelope before it calls its loopback event service at `127.0.0.1:8766`. Its Rust boundary validates schema version, source, confidence range, policy result, and the command whitelist; non-executable gestures are not published. The Rust media dispatcher also rejects actions while its local command-mode policy state is disabled.

The loopback service has no demonstrated harness consumer and remains experimental local telemetry. It is not an enabled harness adapter port.

## Prohibited fields and future transport

The payload must not include raw image bytes, URLs to frames, video, audio, landmarks, biometric templates, filesystem paths, browser-control instructions, shell text, or free-form execution parameters.

No network transport to the harness is enabled by this contract. If a transport is proposed later, it must be a separately approved C-3 change with authentication, replay handling, consent, retention, and egress tests. A loopback-only service still requires payload conformance and a backend-enforced policy gate before it can become an adapter port.

## Consumer behavior

The harness must reject the entire payload when any invariant fails, record a redacted validation outcome, and never infer a command from omitted or unrecognized values. Unknown schema versions are rejected.

## Verification gate

This document defines the port but does not claim a working adapter integration. Promotion requires a contract conformance test in both repositories plus a local hardware E2E recording that proves only this envelope crosses the boundary.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---------|------|--------|---------|-------------|-------|
| 0.1.2b | 2026-07-22 | beta | Motion Lab now projects and validates the envelope locally; no harness consumer or hardware proof is claimed. | pending | ATHER |
| 0.1.1b | 2026-07-22 | beta | Recorded the non-conforming legacy loopback telemetry port and prohibited its use as an adapter port. | pending | ATHER |
| 0.1.0b | 2026-07-22 | beta | Initial local-only, privacy-preserving command-intent contract. | pending | ATHER |
