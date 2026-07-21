import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRedactedIntentRecord, validateGestureCommandIntent } from '../adapters/desktop-motion/gesture-command-intent.mjs';

const validIntent = {
  schema_version: 'gesture_command_intent/v1',
  intent_id: 'gesture-42',
  occurred_at: '2026-07-22T02:30:00.000Z',
  source: { adapter: 'rwang-motion-lab', adapter_version: '0.1.7', device_scope: 'local' },
  gesture: { type: 'swipe_right', handedness: 'Right', confidence: 0.91 },
  policy: { result: 'armed', reason: 'Experimental command mode is enabled.' },
  command: 'media_next_track',
};

test('accepts the versioned Motion Lab command intent without dispatching it', () => {
  assert.deepEqual(validateGestureCommandIntent(validIntent), { ok: true, dispatchable: true });
  assert.deepEqual(createRedactedIntentRecord(validIntent), {
    ok: true,
    dispatchable: true,
    record: {
      schema_version: 'gesture_command_intent/v1',
      intent_id: 'gesture-42',
      occurred_at: '2026-07-22T02:30:00.000Z',
      adapter: 'rwang-motion-lab',
      adapter_version: '0.1.7',
      command: 'media_next_track',
      policy_result: 'armed',
    },
  });
});

test('rejects prohibited payload fields and treats non-armed intents as non-dispatchable', () => {
  assert.deepEqual(validateGestureCommandIntent({ ...validIntent, raw_frame: 'not-allowed' }), { ok: false, reason: 'invalid envelope fields' });
  assert.deepEqual(validateGestureCommandIntent({ ...validIntent, policy: { ...validIntent.policy, result: 'disabled' } }), { ok: true, dispatchable: false });
});
