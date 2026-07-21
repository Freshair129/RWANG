const schemaVersion = 'gesture_command_intent/v1';
const commands = new Set([
  'media_play_pause',
  'media_next_track',
  'media_previous_track',
  'media_volume_up',
  'media_volume_down',
  'media_mute',
]);
const policyResults = new Set(['disabled', 'blocked', 'armed', 'observed']);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasOnlyKeys(value, keys) {
  return isPlainObject(value) && Object.keys(value).every((key) => keys.includes(key)) && keys.every((key) => key in value);
}

function isUtcTimestamp(value) {
  return typeof value === 'string' && value.endsWith('Z') && !Number.isNaN(Date.parse(value));
}

export function validateGestureCommandIntent(intent) {
  if (!hasOnlyKeys(intent, ['schema_version', 'intent_id', 'occurred_at', 'source', 'gesture', 'policy', 'command'])) {
    return { ok: false, reason: 'invalid envelope fields' };
  }
  if (intent.schema_version !== schemaVersion || typeof intent.intent_id !== 'string' || intent.intent_id.trim() === '' || !isUtcTimestamp(intent.occurred_at)) {
    return { ok: false, reason: 'invalid identity' };
  }
  if (!hasOnlyKeys(intent.source, ['adapter', 'adapter_version', 'device_scope']) || intent.source.adapter !== 'rwang-motion-lab' || typeof intent.source.adapter_version !== 'string' || intent.source.adapter_version.trim() === '' || intent.source.device_scope !== 'local') {
    return { ok: false, reason: 'invalid source' };
  }
  if (!hasOnlyKeys(intent.gesture, ['type', 'handedness', 'confidence']) || typeof intent.gesture.type !== 'string' || typeof intent.gesture.handedness !== 'string' || !Number.isFinite(intent.gesture.confidence) || intent.gesture.confidence < 0 || intent.gesture.confidence > 1) {
    return { ok: false, reason: 'invalid gesture' };
  }
  if (!hasOnlyKeys(intent.policy, ['result', 'reason']) || !policyResults.has(intent.policy.result) || typeof intent.policy.reason !== 'string') {
    return { ok: false, reason: 'invalid policy' };
  }
  if (!commands.has(intent.command)) {
    return { ok: false, reason: 'invalid command' };
  }
  return { ok: true, dispatchable: intent.policy.result === 'armed' };
}

export function createRedactedIntentRecord(intent) {
  const verdict = validateGestureCommandIntent(intent);
  if (!verdict.ok) return { ok: false, reason: verdict.reason };

  return {
    ok: true,
    dispatchable: verdict.dispatchable,
    record: {
      schema_version: intent.schema_version,
      intent_id: intent.intent_id,
      occurred_at: intent.occurred_at,
      adapter: intent.source.adapter,
      adapter_version: intent.source.adapter_version,
      command: intent.command,
      policy_result: intent.policy.result,
    },
  };
}
