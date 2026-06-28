---
id: feature--diagram-ingest
block_id: Genesis::G-Orchestra-v2
context_scaling_tier: H3
role: coder
status: todo
---

# FEATURE: Diagram Ingest (diagram -> atoms+edges) [L2-Feature] feature--diagram-ingest

**Phase:** P2 · **Tier:** H3 · **Type:** feature · **Est:** 3 · **MoSCoW:** should

### Description
The reverse path of the pipeline canvas (harvested from GoVibe SYSTEM-04 Diagram-to-Doc, reference-only). Drop a diagram (C4 / ERD / sequence / flow / sitemap / dependency-graph / agent-workflow) onto the canvas -> semantic-extract nodes/edges/boundaries/actors -> materialize as DRAFT atoms + depends_on edges -> human-review gate before they enter the backlog (diagram -> draft -> review -> approved). Each generated atom keeps a link back to its source diagram asset for traceability.

### Acceptance (DoD)
Dropping a supported diagram produces editable draft atoms + dependency edges; nothing reaches the backlog until a human approves; every generated atom traces back to a diagram region.

### Depends on
[[feature--pipeline-canvas]], [[algo--knowledge-adapter]]
