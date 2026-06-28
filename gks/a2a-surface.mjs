// gks/a2a-surface.mjs — A2A interop surface contract (protocol--a2a-surface, ADR-O-006).
// G-Orch as A2A server (Agent Card) AND client (a remote agent = a Provider per ADR-O-005).
// Maps the A2A Task lifecycle onto the engine's 8-state machine. The HTTP/JSON-RPC transport
// is the daemon's job; this module is the contract + mappings, unit-testable. Zero-dep Node ESM.

export const A2A_SKILLS = [
  { id: "author-atoms", name: "Author atoms", description: "Create/edit Genesis atoms from intent." },
  { id: "run-pipeline", name: "Run pipeline", description: "Dispatch a wave of the backlog DAG." },
  { id: "verify", name: "Verify", description: "Run the Verify Gate over an artifact." },
  { id: "query-graph", name: "Query graph", description: "Retrieve context from the knowledge graph." },
];

/** Build the Agent Card served at /.well-known/agent-card.json (A2A discovery). */
export function buildAgentCard({ name = "G-Orchestra", url, version = "0.1.0", skills = A2A_SKILLS } = {}) {
  return {
    name,
    description: "Governed autonomous multi-agent orchestrator.",
    url,
    version,
    capabilities: { streaming: true, pushNotifications: false },
    defaultInputModes: ["text"],
    defaultOutputModes: ["text"],
    skills,
  };
}

// engine 8-state -> A2A task state
const TO_A2A = {
  todo: "submitted", ready: "submitted",
  claimed: "working", running: "working", "needs-rework": "working",
  reviewing: "input-required",
  done: "completed", failed: "failed",
};
const FROM_A2A = {
  submitted: "todo", working: "running", "input-required": "reviewing",
  completed: "done", failed: "failed", canceled: "failed",
};
export function toA2AState(engineState) { return TO_A2A[engineState] || "unknown"; }
export function fromA2AState(a2aState) { return FROM_A2A[a2aState] || "todo"; }

/** A remote A2A agent expressed as a Provider for the registry (ADR-O-005, transport a2a). */
export function a2aProvider(agentCard) {
  return {
    transport: "a2a",
    url: agentCard.url,
    capabilities: (agentCard.skills || []).map((s) => s.id),
    enabled: true,
  };
}
