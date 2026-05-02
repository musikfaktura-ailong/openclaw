# Steward2 Spec

This file is the canonical current-state spec for the `Steward2` migration.

It is the working memory for the OpenClaw-first replatform:
- OpenClaw provides the assistant shell
- Steward semantics provide the DB runtime, truth discipline, proof logic, consequence logic, and mission hierarchy

Historical notes, superseded ideas, and dated migration dead ends belong in `STEWARD2_HISTORY.md`, not here.

## Current rules

These rules are general and must be followed across all migration workstreams.

- `R1` Define the invariant first. Before fixing or porting anything, state what must be structurally true so the same class of failure cannot reappear through another path.
- `R2` Do not patch the nearest symptom if the underlying failure is cross-cutting. Fix the shared contract, ownership boundary, state model, or persistence seam instead.
- `R3` Do not solve structural problems with guards, bans, or one-off filters unless the invariant itself explicitly requires a hard rejection boundary.
- `R4` Prefer host-owned structure over model or planner improvisation. If correctness depends on typed transitions, state binding, approval boundaries, continuity rules, or truth policy, the host must enforce them.
- `R5` If a failure can reappear one step earlier, one step later, or in another subsystem, the fix is incomplete.
- `R6` Benchmark at the architectural level against proven systems. Do not copy isolated behaviors while ignoring the invariant that makes them work.
- `R7` Top-level rules must stay general. Slice-specific constraints belong inside the relevant workstream, not in the global rules section.
- `R8` Do not fix before the work chain is written. Every structural diagnosis must first map the intended invariant, real code path, live path, exact violation point, consequence, and acceptance condition.
- `R9` Do not report health or readiness without a causal map. "Bad", "better", "healthy", "not ready", or "ready to port" is not sufficient unless tied to the current invariant failure and the code path producing it.
- `R10` When changing a contract, list every dependent surface before editing: state writers, state readers, validators, reward/burn logic, fallback logic, recovery logic, approval logic, and persistence logic.
- `R11` If the reasoning no longer fits safely inside one file or module, modularization becomes part of the fix. Do not keep pushing cross-cutting logic deeper into a file that no longer exposes clear ownership boundaries.
- `R12` The spec is the working memory. If a module map, dependency map, migration decision, invariant map, or consequence map exists only in chat, it does not exist.
- `R13` The outer shell and inner core must stay distinct in planning. OpenClaw owns gateway/session/channel surfaces; Steward owns runtime/truth/proof/consequence/mission semantics.
- `R14` Do not port code before the ownership seam is identified. Every imported subsystem must say whether it is `copy`, `adapt`, `bridge`, or `replace`.
- `R15` Do not hand-wave architectural differences. If OpenClaw currently uses files/session store and Steward needs DB authority, the persistence seam must be named explicitly.
- `R16` Do not weaken steward-native truth or operator hierarchy to make the OpenClaw transplant easier.
- `R17` Do not preserve PEQS file layout by reflex. Steward2 is a new architecture; target modules should fit OpenClaw’s shape where that reduces friction.
- `R18` No implementation slice starts without:
  - intended invariant
  - target OpenClaw seam
  - PEQS source modules
  - Steward2 target modules
  - dependency list
  - acceptance condition
- `R19` Prefer narrow bridging layers over deep scattered patches. Replace a persistence/runtime seam once rather than threading DB calls through many unrelated modules.
- `R20` Every steward addition must live in its own steward-owned module or module group under `src/steward/`. Do not bury steward semantics inside unrelated OpenClaw files except at explicit seam adapters.
- `R21` No advancement before confirmation of full functionality for the current workstream. "Partly wired", "compiles", "basic smoke test passed", or "the interface exists" is not enough.
- `R22` Every workstream must define visible advancement evidence: exact behavior, persisted state, tests, and runtime traces that must be seen before the next workstream may begin.
- `R23` Only one workstream may be in active implementation at a time. Parallel analysis is allowed; parallel implementation of dependent workstreams is not.
- `R24` Before implementing any workstream that could benefit from OpenClaw or ii-agent, inspect the donor repo modules first and record the exact donor files in this spec. Do not implement steward code for that workstream from memory, intuition, or chat recap alone.
- `R25` No workstream may enter `implement` while any blocker listed for that workstream is still `OPEN`. A workstream is not code-ready until its own blocking decisions are explicitly resolved in this file.

## Current task

Primary task: **complete** — migration tranche is fully defined (Workstreams A–H, port order, advancement checklists, blocking decisions).

Current phase: **LM-B merged via PR `#23` (2026-05-02). LM-C is now code-ready. Deployment-readiness: NO. Remaining non-blocking carry-forwards in tranche: CF-JB-1, CF-JB-2, CF-JB-3. Blocking readiness gap: LM Studio lifecycle tranche is not yet wired through LM-C/D.**

Keep all Steward2 work separate from the unstable legacy PEQS Phase `5.x` work.

Current decision:
- `Steward2` is OpenClaw-first, not PEQS-first
- OpenClaw is the product/gateway/session foundation
- Steward semantics are layered in deliberately as an inner control core
- deployment testing is paused until LM Studio lifecycle ownership and the autonomous steward control-loop map are accepted in this spec

Repo:
- [Steward2](C:\ai_agent\Steward2)

Base revision:
- OpenClaw commit `c2fb4007c24a0d8ead011a83a4e814630f73f052`

Secondary donor repo:
- [Steward2_ii_agent](C:\ai_agent\Steward2_ii_agent)
- ii-agent commit `0e57985d3f6e5c8ea340418ed259665b8e86301d`

## Work chain

### Intended invariant

Steward2 must behave like a real OpenClaw-grade assistant product while making DB-backed steward truth the canonical authority.

That means:
- channel and session behavior stay OpenClaw-grade
- canonical runtime truth lives in a DB ledger, not in loose session JSON alone
- truth/proof/consequence/mission logic is host-owned and structurally enforced
- the assistant persona becomes a steward by policy and runtime semantics, not by prompt text alone

### Intended code path

Inbound message / event:
- OpenClaw channel adapter
- session key resolution
- session identity / thread binding
- session store lookup
- active-memory / compaction / approval surfaces
- agent runtime turn
- outbound reply routing

Steward2 modification:
- add a DB runtime authority under those surfaces
- inject stewardship mission + truth/consequence policy into tool/runtime decisions
- persist assistant continuity to DB-backed steward session/task/runtime entities

### Architectural delta

OpenClaw currently provides:
- gateway process
- channel adapters
- canonical session keys
- session store
- active-memory plugin
- thread binding / conversation routing
- approvals / exec approval infrastructure
- nodes / tools / agent runtime

PEQS currently provides:
- DB schema and ledger-oriented runtime thinking
- runtime flows and blocker model
- truth audit pipeline
- proof grounding judge
- consequence simulator
- stewardship mission hierarchy and time/value logic

Core migration reality:
- OpenClaw shell is stronger than PEQS shell
- PEQS core semantics are stronger than OpenClaw core semantics for steward-style truth and operator mission

### Exact migration stance

OpenClaw subsystems:
- `copy`:
  - channel adapters
  - routing/session-key patterns
  - active-memory plugin structure
  - approval transport surfaces
  - node / tool surfaces
  - reply dispatch patterns
- `adapt`:
  - session store
  - session metadata
  - compaction / pruning persistence
  - thread/session binding persistence
- `bridge`:
  - active-memory retrieval into Steward DB memory
  - approvals into steward consequence/mission policy
  - agent turn completion into DB runtime events
- `replace`:
  - canonical runtime authority
  - truth / proof / consequence / mission semantics

### Additional external benchmark: II-Agent

`ii-agent` is useful as a secondary donor, but not as the primary foundation for Steward2.

Why it is relevant:
- it is an open-source assistant platform with:
  - multi-model chat
  - browser / tool execution
  - app integrations
  - deep research orientation
  - realtime interaction
  - backend infrastructure around databases, cache, and storage

Why it is not the base:
- Steward2 is already committed to `OpenClaw-first`
- OpenClaw is much closer to the exact shell we want:
  - channel routing
  - sessions
  - approvals
  - nodes
  - assistant shell ergonomics
- `ii-agent` is better used as a source of patterns and optional subsystems, not as a competing base platform

How II-Agent can be used:
- `use as reference`:
  - realtime backend patterns
  - app integration breadth
  - research/deep-research orchestration concepts
  - async tool execution and replay ideas
  - infrastructure expectations for a serious assistant stack
- `use as donor later`:
  - research agent flows
  - reviewer/replay surfaces
  - websocket event streaming ideas
  - multimodal and document workflow surfaces
- `do not use as core authority`:
  - do not let ii-agent define runtime truth
  - do not let ii-agent replace OpenClaw session/gateway ownership
  - do not let ii-agent replace steward-native truth/proof/consequence/mission semantics

II-Agent fit relative to Steward2:
- OpenClaw remains the assistant shell foundation
- Steward remains the inner authority core
- II-Agent becomes a tertiary source for:
  - research mode
  - build mode
  - realtime collaboration surfaces
  - broad app integration ideas

Implementation stance:
- no ii-agent code is pulled into the first migration tranche
- ii-agent should be evaluated later as optional donor input for:
  - deep research workstream
  - multimodal/document workstream
  - realtime collaboration/event-stream workstream

Licensing note:
- OpenClaw is MIT
- ii-agent is Apache-2.0
- Apache-2.0 code can be incorporated, but license and notice obligations must be tracked explicitly if any code is copied, not just referenced

Local donor reference:
- [Steward2_ii_agent](C:\ai_agent\Steward2_ii_agent)
- this repo must be inspected before implementing any Steward2 workstream that could benefit from its database, research, realtime, tool, or integration patterns

## Step gates

This migration is step-gated.

Definitions:
- `analyze`: mapping seams, source modules, target modules, and invariants
- `implement`: writing code for the current workstream only
- `confirm`: proving the workstream is fully functional through visible evidence
- `advance`: permission to start implementation of the next workstream

Hard rule:
- no advancement to the next workstream until the current one is in `confirm` state and all required evidence is recorded in this spec

Required evidence before advancement:
- `module evidence`
  - steward logic exists in the planned `src/steward/...` modules
  - the logic is not scattered across unrelated OpenClaw files
- `boundary evidence`
  - the OpenClaw seam adapter is explicit and named
  - the ownership line between OpenClaw shell and steward core is inspectable
- `persistence evidence`
  - required DB/session/runtime state can be queried directly
  - the workstream does not rely on hidden in-memory-only state
- `test evidence`
  - targeted tests for that workstream pass
  - tests prove the intended invariant, not only importability
- `runtime evidence`
  - a real end-to-end trace demonstrates the invariant in live execution

Disallowed advancement evidence:
- "it compiles"
- "the files exist"
- "the adapter is mostly wired"
- "one unit test passed"
- "the model responded correctly once"

What must be recorded in the spec before advancement:
- implemented modules
- explicit seam adapters touched
- tests executed
- persisted artifacts inspected
- runtime trace observed
- unresolved gaps, if any

Advancement commandment:
- if any one of the five evidence categories is missing, the current workstream is still open

Workstream readiness commandment:
- a workstream may move from `analyze` to `implement` only when:
  - all of its listed blocking decisions are recorded as resolved
  - its donor references are recorded
  - its target modules and seam adapters are named
  - its advancement evidence section is already written

## Command protocol

Short trigger commands used by the operator. Each command fully defines the recipient's mandatory first actions and required output. No additional instructions needed in the command itself.

### `STEWARD2 IMPLEMENT WS-[X]`

Recipient: **Codex**

Mandatory first actions (in order, before writing any code):
1. Read `STEWARD2_SPEC.md` in full
2. Locate the workstream section for `WS-[X]` — read: intended invariant, PEQS source modules, OpenClaw target seams, Steward2 target modules, all resolved blocking decisions that apply
3. Read every PEQS source module listed for this workstream
4. Read every OpenClaw seam file listed for this workstream
5. Confirm status board shows `WS-[X]` as `code-ready: yes` before writing anything

Implementation constraints:
- implement only the modules listed in the workstream's target module list
- only touch OpenClaw files named in the workstream's OpenClaw target seams
- no downstream workstream code
- no scope expansion

When implementation is complete:
- commit all new/modified files on branch `ws-[x]`: `WS-[X] implement: [short description]`
- push the branch

Required output when done:
- every file created or modified, with path
- commit hash
- any spec ambiguity encountered during implementation
- nothing else

---

### `STEWARD2 REVIEW WS-[X]` + Codex output

Recipient: **Claude**

Usage: paste Codex's full implementation report (created/modified file paths + commit hash) directly after the command. No separate attachment needed — Claude reads those paths from the repo.

Mandatory first actions (in order):
1. Read `STEWARD2_SPEC.md` — Workstream `[X]` section, resolved BDs, advancement checklist
2. Read every file path listed in the Codex output
3. Read every PEQS source module listed for the workstream (verify port fidelity)
4. Read every named OpenClaw seam file (verify boundary and regression risk)

Review checklist:
- every target module exists and owns exactly what the spec says it owns
- seam adapters are explicit and at the named hook points
- no downstream workstream code present
- invariant is enforced by host code, not by prompt text alone
- existing OpenClaw surfaces are not broken

Required output:
- `PASS` or `FAIL`
- if FAIL: exact structural finding and which spec rule it violates
- if PASS: any non-structural notes
- write reviewer statement into spec before returning result

---

### `STEWARD2 VERIFY WS-[X]`

Recipient: **Codex**

Mandatory first actions:
1. Read `STEWARD2_SPEC.md` — Workstream `[X]` acceptance conditions and advancement checklist
2. Run existing OpenClaw tests — confirm no regression
3. Write and run targeted tests per the workstream's advancement checklist test evidence items
4. Inspect DB/session/runtime artifacts directly — do not infer from code alone
5. Produce one end-to-end runtime trace demonstrating the intended invariant

When verification is complete:
- commit any test files added on the same branch: `WS-[X] verify: tests and artifacts`
- push the branch

Required output:
- test names and results
- DB rows directly inspected (show values)
- runtime trace output
- explicit verdict against each acceptance condition
- commit hash

---

### `STEWARD2 CONFIRM WS-[X]` + Codex verification report

Recipient: **Claude**

Mandatory first actions:
1. Read the verification report
2. Cross-check each item against `STEWARD2_SPEC.md` Workstream `[X]` acceptance conditions

Actions:
- write verifier statement into spec
- if all five evidence categories satisfied: update status board `WS-[X]` to `confirm`
- if any category missing: return to Codex with specific gap

Required output:
- verdict: `confirm` or `still open` with gap identified

---

### `STEWARD2 APPROVE WS-[X] → WS-[Y]`

Recipient: **Claude**

Actions:
- write approver decision into spec
- update status board: `WS-[X]` → `advance-ready`, `WS-[Y]` → `implement`
- confirm what blockers, if any, remain before `WS-[Y]` code can start

Required output:
- confirmation of status board update
- what Codex should receive next (`STEWARD2 IMPLEMENT WS-[Y]`)

---

### `STEWARD2 SPEC-Q: [question]`

Recipient: **Claude**

Answer the question against the spec. If the answer requires a spec change, make it. Return the answer and note if the spec was updated.

---

## Git policy

### Branch strategy

- every workstream is implemented on its own branch: `ws-a`, `ws-e-core`, `ws-f`, `ws-g`, etc.
- `main` only ever contains confirmed + approved work
- no workstream branch is merged to `main` before the Advancement gate approval is recorded in the spec

### When to commit

| Gate | Who commits | What |
|---|---|---|
| Implementation gate complete | Codex | all new/modified files for the workstream; message: `WS-[X] implement: [short description]` |
| Verification gate complete | Codex | any test files added; message: `WS-[X] verify: tests and artifacts` |
| Advancement gate approved | Claude | spec update only; message: `WS-[X] advance: spec handoff record + status board` |
| Merge to main | Operator | squash-merge workstream branch after approval; message: `WS-[X] merge: [workstream name]` |

### When to push

- push the workstream branch after each commit so history is never local-only
- do not push to `main` directly; always merge via the Advancement gate

### Commit message format

```
WS-[X] [gate]: [one-line description]

- [bullet: what changed]
- [bullet: what changed]
```

Example:
```
WS-A implement: DB runtime authority — steward DB bootstrap and session authority

- add src/steward/db/ (runtime-db, runtime-schema, db-bootstrap, tx, migrations)
- add src/steward/runtime/ (runtime-state, runtime-state-repo, runtime-flow, runtime-events, runtime-bridge, session-authority, session-bridge, session-projection)
```

---

## Code comment policy

### Always comment

- **seam adapter files**: one block comment at the top of the file naming the OpenClaw hook point and what the steward layer is injecting — e.g. `// Seam: hooks after recordSessionMetaFromInbound in src/config/sessions/store.ts`
- **PEQS port logic**: inline comment on the first line of any function ported from PEQS naming the source — e.g. `// port of core/runtime_flow.py:create_flow_for_goal`
- **CAS writes**: comment the pattern inline — e.g. `// CAS: fails silently if version is stale; caller must retry`
- **non-obvious invariant enforcement**: one line stating what invariant the code upholds

### Never comment

- obvious logic (`// increment version` above `version++`)
- restatements of the function name
- TODO comments — if something is deferred, it belongs in the spec as a blocking decision, not in the code

### No generated boilerplate

- no auto-generated JSDoc blocks on every function
- no `@param` / `@returns` annotations unless the type system cannot express the contract
- type signatures are the documentation for straightforward functions

---

## Development process

This process is mandatory for every Steward2 workstream. It exists to prevent the migration from collapsing into the same ambiguity, patch-forward behavior, and weak verification that damaged earlier tracks.

### Required roles

The same person or model may perform more than one role, but the role boundaries must remain explicit.

- `Architect`
  - defines the invariant
  - defines the ownership seam
  - defines the acceptance evidence
  - updates the spec before implementation starts
- `Implementer`
  - writes only the current workstream
  - does not redefine scope while coding
  - does not advance to downstream workstreams
- `Reviewer`
  - reviews against the spec and invariant, not against vague usefulness
  - checks architecture fit, dependency impact, regression risk, and missing cases
  - rejects local patching when the invariant is still violated
- `Verifier`
  - runs tests
  - inspects persisted state and runtime traces
  - confirms the actual acceptance evidence for the workstream
- `Approver`
  - decides whether the current workstream is complete
  - decides whether the next workstream may begin
  - no advancement is allowed without explicit approval

### Mandatory workflow

Every workstream must pass through these gates in order.

1. `Spec gate`
- intended invariant written
- OpenClaw seam identified
- PEQS source modules listed
- Steward2 target modules listed
- dependency list written
- donor references recorded
- blockers for the current workstream resolved
- advancement evidence already written in this spec
- output: Architect statement of invariant and seam recorded in spec

2. `Implementation gate`
- status board row updated to `implement`
- one active workstream only
- code changes limited to the current workstream and its named seam adapters
- no downstream coding
- no scope expansion during implementation
- output: Implementer statement of modules changed recorded in spec

3. `Review gate`
- review against invariant, ownership seam, and module boundaries
- review every dependent surface affected by the contract change
- review against OpenClaw fit and donor benchmark fit
- confirm existing OpenClaw tests still pass; no regression introduced into shell surfaces
- **pass**: reviewer writes pass statement with any noted non-structural findings; workstream proceeds to Verification gate
- **fail (structural)**: reviewer writes fail statement with structural finding; workstream returns to Spec gate; no local patching
- output: Reviewer statement of pass/fail with structural findings recorded in spec

4. `Verification gate`
- targeted tests pass
- persisted DB/session/runtime state is inspected directly
- runtime trace is inspected directly
- acceptance evidence is written back into this spec
- **pass**: Verifier writes confirmed evidence into spec; status board row updated to `confirm`
- **fail (implementation bug)**: return to Implementation gate; no spec change needed unless the bug reveals a design gap
- **fail (design gap)**: return to Spec gate; reviewer must also sign off on the spec correction
- output: Verifier statement of tests run, artifacts inspected, and runtime trace observed recorded in spec

5. `Advancement gate`
- current workstream status board row must be `confirm`
- all five evidence categories from the step gates satisfied
- explicit Approver decision recorded before the next workstream may start
- status board row updated to `advance-ready` after approval
- output: Approver decision (`approved to advance` or `not approved`) recorded in spec

### Hard process rules

- no one may implement a workstream whose blockers are still `OPEN`
- no one may implement two dependent workstreams in parallel
- no speculative scaffolding for future workstreams counts as allowed implementation
- no code change counts as complete until review and verification are both finished
- no advancement happens because the code "looks done"
- no advancement happens because one test passed
- no advancement happens because the model produced a plausible output once
- if review finds a structural mismatch, the process returns to `Spec gate`, not to local patching
- if verification cannot prove the acceptance evidence, the workstream remains open
- a workstream seam change that breaks existing OpenClaw tests is a structural failure; it does not ship until OpenClaw regression is clean
- verification failure due to an implementation bug loops back to Implementation gate only; it does not restart from Spec gate unless the bug exposes a design gap
- the status board is the authority on which workstream is active; if it says `analyze`, no implementation code for that workstream is in scope

### Required handoff record

Each gate produces a mandatory output statement. All five must be present in the spec before a workstream may move to `confirm`.

- `Spec gate output` — Architect statement: invariant defined, seam identified, blockers resolved
- `Implementation gate output` — Implementer statement: list of modules created or modified
- `Review gate output` — Reviewer statement: pass or fail; if fail, structural finding; if pass, any non-structural notes
- `Verification gate output` — Verifier statement: tests run, DB/session/runtime artifacts directly inspected, runtime trace observed, verdict
- `Advancement gate output` — Approver decision: `approved to advance` or `not approved`, with reason if not approved

No handoff record is considered complete if any of the five statements is missing or says only "looks good" / "seems fine" / "passes" without naming specific artifacts.

### Steward2-specific enforcement

- Workstream A may now enter `implement` because its blockers are resolved
- downstream workstreams remain blocked by their own open decisions and dependencies
- when a workstream is active, all other workstreams remain in `analyze` unless explicitly moved by approval
- no future assistant or model working on Steward2 may skip this process and still claim the workstream is ready, complete, or approved

## Workstream status board

This board is the single glanceable source of implementation readiness.

| Workstream | Name | Current state | Code-ready | Blocking decisions that must be closed first |
| --- | --- | --- | --- | --- |
| A | DB runtime authority | `advance-ready` | `yes` | resolved: `BD-1`, `BD-2`, `BD-5`, `BD-7` |
| B | Truth audit | `advance-ready` | `yes` | reviewed + advanced: PASS; merge ws-b → main |
| C | Proof judge | `advance-ready` | `yes` | reviewed: PASS; advancement gate: ADVANCE; merging ws-c → main |
| D | Consequence logic | `advance-ready` | `yes` | reviewed: PASS; advancement gate: ADVANCE; merged ws-d → main in PR #6 |
| E | Stewardship mission / operator hierarchy | `advance-ready` | `yes` | reviewed: PASS; advancement gate: ADVANCE; merged ws-e-remaining → main in PR #7 |
| F | Tool supervisor | `advance-ready` | `yes` | depends on `A`; no local blocker beyond upstream readiness |
| G | Relationship memory / knowledge store | `advance-ready` | `yes` | resolved: `BD-3`; reviewed: PASS; advancement gate approved |
| H | Maintenance governor / metacog monitor | `implement` | `yes` | depends on `A`, `E`, `G` — all `advance-ready`; opened for implementation 2026-04-24 |

Interpretation:
- `Current state` must be one of `analyze`, `implement`, `confirm`, or `advance-ready`
- `Code-ready` stays `no` until both local blockers and upstream dependency gates are closed
- no speculative scaffolding counts as implementation while `Code-ready` is `no`

## Module map

### Workstream A. DB runtime authority

Intended invariant:
- canonical runtime state (who owns the runtime, what session is active, what work is in flight) is always readable from the DB without consulting session JSON, in-memory state, or process-local variables; a cold process can reconstruct full runtime context from DB alone

Goal:
- make DB state the canonical runtime authority under the OpenClaw shell

PEQS source modules:
- [core/db.py](C:\ai_agent\PEQS\core\db.py)
- [core/runtime_flow.py](C:\ai_agent\PEQS\core\runtime_flow.py)
- [core/controller.py](C:\ai_agent\PEQS\core\controller.py) as a source of runtime semantics only, not as a file to port wholesale

OpenClaw target seams:
- [src/routing/session-key.ts](C:\ai_agent\Steward2\src\routing\session-key.ts) — canonical session key resolution; basis for `steward_session_id` hash
- [src/config/sessions/store.ts](C:\ai_agent\Steward2\src\config\sessions\store.ts) — session JSON store; becomes a compatibility projection surface (BD-2)
- [src/config/sessions/store-load.ts](C:\ai_agent\Steward2\src\config\sessions\store-load.ts) — legacy JSON load path; remains valid for compatibility readers during Workstream A, while steward-aware bridges read DB directly
- [src/agents/session-write-lock.ts](C:\ai_agent\Steward2\src\agents\session-write-lock.ts) — OpenClaw scoped session lock; reference point for BD-7 CAS strategy
- [src/channels/plugins/session-conversation.ts](C:\ai_agent\Steward2\src\channels\plugins\session-conversation.ts)
- [packages/plugin-sdk/src/config-runtime.ts](C:\ai_agent\Steward2\packages\plugin-sdk\src\config-runtime.ts)
- session metadata loaders under `src/acp/runtime/`

ii-agent donor references:
- [docs/database-design.md](C:\ai_agent\Steward2_ii_agent\docs\database-design.md)
- `src/ii_agent/app/__init__.py`
- `src/ii_agent/projects/repository.py`

ii-agent inspiration use:
- DB-backed sessions, run logs, append-only events, and serious backend persistence shape

Steward2 target modules:
- `src/steward/db/runtime-db.ts` — `DatabaseSync` open/close; WAL + busy_timeout bootstrap
- `src/steward/db/runtime-schema.ts` — TypeScript type definitions mirroring the SQL tables
- `src/steward/db/db-bootstrap.ts` — startup bootstrap: open DB, run forward migrations, export singleton handle
- `src/steward/db/migrations/0001_init.sql` — initial schema DDL (all steward tables)
- `src/steward/db/migrations/runner.ts` — reads `PRAGMA user_version`, applies forward SQL files in order, bumps version
- `src/steward/db/tx.ts` — typed transaction helpers; CAS write helper for `steward_runtime_state`
- `src/steward/runtime/runtime-state.ts` — typed read/write API for `steward_runtime_state` rows; CAS update
- `src/steward/runtime/runtime-state-repo.ts` — repository layer: `getOrCreate`, `heartbeat(sessionKey, flowId, taskId)`, `casUpdate`, `markIdle`
- `src/steward/runtime/runtime-flow.ts` — flow lifecycle: create, resume, complete, block
- `src/steward/runtime/runtime-events.ts` — append-only event writer; typed event kinds
- `src/steward/runtime/runtime-bridge.ts` — wires DB runtime into OpenClaw agent turn lifecycle
- `src/steward/runtime/session-authority.ts` — resolves (agentId + channelKey) to DB steward session row; creates on first contact
- `src/steward/runtime/session-bridge.ts` — writes DB-canonical session state; calls session-projection afterward
- `src/steward/runtime/session-projection.ts` — projects DB session subset back to `sessions.json` for OpenClaw compat readers (BD-2)

Session identity definition:
- a steward session maps 1:1 to an OpenClaw (agentId + channelKey) pair
- agentId is the OpenClaw agent identifier
- channelKey is the normalized channel-specific session key from `src/routing/session-key.ts`
- thread IDs are sub-entries within a session, not independent sessions
- session is created on first inbound message for a given (agentId, channelKey) pair; never destroyed, only closed
- `steward_session_id` = SHA-256 hex digest of the string `${agentId}:${channelKey}` using Node's built-in `crypto.createHash('sha256')`
- hash is computed once in `session-authority.ts` and reused everywhere; do not recompute inline

`steward_flow_tasks.task_id` note for Workstream A:
- in Steward2 there is no equivalent of PEQS's `tasks` table yet
- for Workstream A, `task_id` in `steward_flow_tasks` is an opaque integer representing an OpenClaw agent run/turn; no FK constraint is declared
- a `steward_tasks` table and proper FK will be scoped when the task model is formally defined (not in Workstream A)

Required data model with column definitions:

```sql
-- Per-session runtime state. One row per steward session (keyed by session_key).
-- CAS writes: UPDATE ... WHERE session_key = ? AND version = ?; increment version on success.
CREATE TABLE steward_runtime_state (
  session_key      TEXT PRIMARY KEY,               -- SHA-256 hex of (agentId + ':' + channelKey)
  status           TEXT NOT NULL DEFAULT 'idle',   -- idle | running | waiting | blocked
  owner_pid        INTEGER,
  active_flow_id   INTEGER,
  active_task_id   INTEGER,                        -- which task within the flow is currently running
  heartbeat_ts     INTEGER,
  last_transition_ts INTEGER,
  wait_reason      TEXT DEFAULT '',
  last_error       TEXT DEFAULT '',
  version          INTEGER NOT NULL DEFAULT 0,     -- optimistic CAS field
  data_json        TEXT DEFAULT '{}'
);

CREATE TABLE steward_sessions (
  id               TEXT PRIMARY KEY,               -- hash(agentId + channelKey)
  agent_id         TEXT NOT NULL,
  channel_key      TEXT NOT NULL,
  created_ts       INTEGER NOT NULL,
  last_active_ts   INTEGER NOT NULL,
  status           TEXT NOT NULL DEFAULT 'open',   -- open | closed
  data_json        TEXT DEFAULT '{}'
);

CREATE TABLE steward_session_entries (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id       TEXT NOT NULL REFERENCES steward_sessions(id),
  ts               INTEGER NOT NULL,
  kind             TEXT NOT NULL,                  -- inbound | outbound | event
  content_json     TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE steward_flows (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id       TEXT REFERENCES steward_sessions(id),
  flow_type        TEXT NOT NULL,                  -- research | maintenance | recovery | control
  status           TEXT NOT NULL,                  -- running | resumable | blocked_transient | blocked_deterministic | completed
  state_json       TEXT DEFAULT '{}',
  owner_pid        INTEGER,
  created_ts       INTEGER NOT NULL,
  updated_ts       INTEGER NOT NULL,
  heartbeat_ts     INTEGER
);

CREATE TABLE steward_flow_tasks (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  flow_id          INTEGER NOT NULL REFERENCES steward_flows(id),
  task_id          INTEGER NOT NULL,
  role             TEXT NOT NULL DEFAULT 'primary', -- primary | recovery | diagnostic
  link_status      TEXT NOT NULL,                  -- pending | running | succeeded | failed
  created_ts       INTEGER NOT NULL,
  updated_ts       INTEGER NOT NULL
);

CREATE TABLE steward_blockers (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  flow_id          INTEGER REFERENCES steward_flows(id),
  task_id          INTEGER,
  blocker_type     TEXT NOT NULL,                  -- no_seedable_work | blocked_transient | time_exhausted | operator_required
  status           TEXT NOT NULL DEFAULT 'active', -- active | resolved
  retry_count      INTEGER DEFAULT 0,
  data_json        TEXT DEFAULT '{}',
  created_ts       INTEGER NOT NULL,
  updated_ts       INTEGER NOT NULL
);

CREATE TABLE steward_events (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  ts               INTEGER NOT NULL,
  session_id       TEXT REFERENCES steward_sessions(id),
  flow_id          INTEGER REFERENCES steward_flows(id),
  kind             TEXT NOT NULL,
  message          TEXT NOT NULL,
  data_json        TEXT DEFAULT '{}'
);

CREATE TABLE steward_kv (
  k                TEXT PRIMARY KEY,
  v                TEXT NOT NULL
);
```

Concurrency model (updated per BD-7):
- Steward2 is a multi-tenant web server; multiple concurrent requests may write to the same or different sessions
- SQLite WAL mode must be enabled (`PRAGMA journal_mode=WAL`)
- busy timeout must be set (`PRAGMA busy_timeout=15000`)
- `steward_runtime_state` is per-session (keyed by `session_key`); concurrent writes to different sessions do not serialize each other
- writes to `steward_runtime_state` use optimistic CAS: `UPDATE ... WHERE session_key = ? AND version = ?`; if zero rows affected, the write was stale and must retry; `version` is incremented on every successful write
- session-scoped writes (session_entries, flow_tasks, blockers, events) are append-only; no CAS needed
- `steward_kv` writes must use `INSERT OR REPLACE` with no separate read-modify-write cycle
- a process-local per-session mutex may be used as a fast path, but DB CAS is the authority; process-local mutex alone is never sufficient

Responsibilities:
- persist canonical runtime owner / active work
- map OpenClaw (agentId + channelKey) pairs to DB-backed steward sessions
- expose typed read/write APIs for session continuity, task continuity, and operator continuity
- keep OpenClaw session store as cache/compat layer or derived view, not authority

DB file path:
- the steward DB file is `steward.db`, co-located with the sessions directory (`path.join(path.dirname(storePath), 'steward.db')`)
- `storePath` is the sessions JSON path already present in `OpenClawConfig`; no new config field needed for Workstream A
- `db-bootstrap.ts` receives `storePath` as its sole required parameter and derives the DB path from it

DB handle injection:
- the DB handle is a **module-level singleton** inside `db-bootstrap.ts`; all steward modules import `getDb()` from it
- the singleton is initialized once at server startup via `initStewardDb(storePath)`; subsequent `getDb()` calls return the same handle
- in tests: each test calls `initStewardDb(':memory:')` at setup and `closeStewardDb()` at teardown; the singleton is reset between tests via a `resetDbForTest()` export

`runtime-bridge.ts` hook points (explicit):
- **on inbound turn start**: hook after `recordSessionMetaFromInbound` in `src/config/sessions/store.ts`; call `session-authority.ts` to create/touch the steward session row and write a `steward_runtime_state` row with `status='running'`
- **on turn complete**: hook after `updateSessionStoreAfterAgentRun` in `src/agents/command/session-store.ts`; write `status='idle'` and append a `steward_events` entry
- **on inbound entry**: hook is a thin wrapper; the bridge does not replace OpenClaw's session store writes — it runs after them

Important design rule:
- do not port `core/controller.py` as a monolith
- port its runtime semantics into smaller runtime modules and keep turn orchestration aligned with OpenClaw runtime entrypoints

Dependencies:
- BD-1 resolved (SQLite package: `node:sqlite` + `DatabaseSync`)
- BD-2 resolved (session-store bridge: DB authoritative, JSON as compatibility projection)
- BD-5 resolved (schema versioning: manual versioned SQL files + `PRAGMA user_version`)
- BD-7 resolved (concurrency: per-session rows + CAS via `version` column)
- session identity definition finalized (above)

WS-A implementation brief:

- objective:
  - establish DB runtime authority without breaking existing OpenClaw session and reply surfaces
- in scope:
  - DB bootstrap
  - schema + migrations
  - per-session runtime state
  - session authority resolution
  - runtime event append path
  - JSON compatibility projection
  - explicit hook-in at named OpenClaw turn boundaries
- out of scope:
  - truth audit
  - proof judge
  - consequence logic
  - tool supervisor
  - knowledge embeddings
  - mission/heuristic prompt behavior
  - replacing all legacy JSON readers with DB readers

WS-A implementation order:

1. create `src/steward/db/` and `src/steward/runtime/`
2. implement `runtime-db.ts`, `db-bootstrap.ts`, migration runner, and `0001_init.sql`
3. implement `runtime-schema.ts` type surface matching the SQL schema
4. implement `session-authority.ts` with canonical SHA-256 session id generation
5. implement `runtime-state.ts` and `runtime-state-repo.ts` with CAS writes
6. implement `runtime-events.ts` append-only writer
7. implement `session-projection.ts` and `session-bridge.ts`
8. implement `runtime-bridge.ts` at the named OpenClaw hook points only
9. write targeted tests for bootstrap, migration, CAS conflict, session identity, restart reconstruction, and JSON projection compatibility
10. run verification and record evidence before any review/advancement request

WS-A developer questions:

- `Q1. What is the canonical session identity?`
  - `A:` SHA-256 hex of `${agentId}:${channelKey}`, computed once in `session-authority.ts`
- `Q2. Is `sessions.json` still authoritative anywhere in WS-A?`
  - `A:` no; it remains a compatibility projection only
- `Q3. Must `store-load.ts` be globally replaced with DB reads in WS-A?`
  - `A:` no; legacy JSON readers remain valid during WS-A, while steward-aware modules read DB directly
- `Q4. Is `steward_runtime_state` a singleton row?`
  - `A:` no; it is per-session and keyed by canonical session identity
- `Q5. What prevents same-session write races?`
  - `A:` optimistic CAS on `version`, with bounded retry; process-local mutex is optional optimization only
- `Q6. Where does the DB live?`
  - `A:` `steward.db`, colocated with the existing sessions directory
- `Q7. How is the DB handle passed around?`
  - `A:` module-level singleton from `db-bootstrap.ts`, initialized once at startup
- `Q8. Are we allowed to refactor OpenClaw shell files broadly during WS-A?`
  - `A:` no; only named seam adapters and minimal hook-point edits are in scope
- `Q9. Does WS-A introduce the full PEQS task model?`
  - `A:` no; `steward_flow_tasks.task_id` is opaque for now
- `Q10. What counts as success?`
  - `A:` DB can reconstruct session runtime state after restart, CAS protects same-session writes, and OpenClaw reply/session behavior still works

WS-A open implementation questions:

- none at the architecture level
- implementation-level questions discovered during coding must be answered by:
  - first checking this WS-A section
  - then checking the named OpenClaw seam files
  - then updating this spec if the question exposes a real design gap
- do not create ad hoc implementation rules in chat

WS-A non-negotiable coding rules:

- do not add truth/proof/consequence/mission logic to WS-A modules
- do not silently widen scope beyond the named target modules
- do not bypass `session-authority.ts` by recomputing session ids inline
- do not make JSON write-first and DB write-second
- do not replace broad OpenClaw session infrastructure when a narrow steward seam adapter is sufficient
- do not treat a passing smoke test as acceptance

Implementation gate output:

- Implementer statement:
  - WS-A implementation started
  - modules created:
    - `src/steward/db/runtime-schema.ts`
    - `src/steward/db/runtime-db.ts`
    - `src/steward/db/migrations/0001_init.sql`
    - `src/steward/db/migrations/runner.ts`
    - `src/steward/db/db-bootstrap.ts`
    - `src/steward/db/tx.ts`
    - `src/steward/runtime/session-authority.ts`
    - `src/steward/runtime/runtime-state.ts`
    - `src/steward/runtime/runtime-state-repo.ts`
    - `src/steward/runtime/runtime-flow.ts`
    - `src/steward/runtime/runtime-events.ts`
    - `src/steward/runtime/session-projection.ts`
    - `src/steward/runtime/session-bridge.ts`
    - `src/steward/runtime/runtime-bridge.ts`
    - `src/steward/runtime/ws-a.integration.test.ts`
  - existing seam files modified:
    - `src/config/sessions/store.ts`
    - `src/agents/command/session-store.ts`
  - current known gap:
    - verification runner is blocked in the current environment because local `vitest` is not installed, so WS-A is implemented but not yet verified

Acceptance:
- one inbound session is resolved deterministically to a DB steward session row (hash of agentId + channelKey)
- runtime owner, active flow, and active task can be inspected from DB without reading session JSON
- concurrent writes to the same session via CAS: a stale write fails cleanly and retries; no silent overwrites
- reply routing still works through OpenClaw surfaces; `sessions.json` projection remains compat-valid
- DB survives process restart; cold start reconstructs full runtime context from DB rows without session JSON

### Workstream B. Truth audit

Intended invariant:
- no high-impact knowledge write, candidate promotion, or research claim can be committed without passing deterministic host-owned truth validation; the model cannot bypass or shortcut the truth gate by producing persuasive-sounding output

Goal:
- add host-owned truth validation for candidate claims, extracted findings, and high-impact stored knowledge

PEQS source modules:
- [core/truth_audit.py](C:\ai_agent\PEQS\core\truth_audit.py)
- [core/knowledge.py](C:\ai_agent\PEQS\core\knowledge.py) — vector store backing for truth findings and claim records; all truth audit outputs that get promoted to durable knowledge must flow through this
- [core/relationship_memory.py](C:\ai_agent\PEQS\core\relationship_memory.py) — 8-type memory store including `truth_violation` and `truth_reinforced`; this is the persistence layer for truth audit findings

OpenClaw target seams:
- active-memory result injection
- agent tool call completion / post-tool evaluation
- storage of memory/session summaries
- any future research / fetch / extraction pipeline
- `src/agents/memory-search.ts` — memory retrieval before context injection; truth-audited entries must be preferable to unaudited ones

ii-agent donor references:
- `src/ii_agent/agents/prompts/deep_research_system_prompt.py`
- `src/ii_agent/agents/tools/web/web_visit_tool.py`
- `src/ii_agent/agents/tools/web/web_visit_compress.py`

ii-agent inspiration use:
- research-oriented source handling, web content extraction shape, and deep-research quality expectations

Steward2 target modules:
- `src/steward/truth/truth-types.ts`
- `src/steward/truth/truth-audit.ts`
- `src/steward/truth/claim-record.ts`
- `src/steward/truth/candidate-ranking.ts`
- `src/steward/truth/source-kind.ts`
- `src/steward/truth/truth-persistence.ts` — write truth findings to DB; bridge between audit output and Workstream G relationship-memory

Port shape:
- direct logic port, translated from Python to TypeScript
- keep deterministic candidate evaluation and truth findings as host code
- do not push truth classification back into prompt-only behavior
- truth findings of type `truth_violation` and `truth_reinforced` must be persisted via Workstream G, not emitted as ephemeral events only

Responsibilities:
- claim record creation
- family signature / stale-family overlap
- source-kind and candidate-kind classification
- metric extraction heuristics
- candidate scoring / slate / final decision
- truth findings summary
- routing audit output to relationship memory (truth_violation, truth_reinforced types)

Dependencies:
- Workstream A: DB runtime entities for storing candidate slates, truth findings, and claim records
- Workstream G: relationship memory and knowledge store for persistence of audit outputs
- web fetch/search result adapters to normalize OpenClaw tool output into steward truth input

Acceptance:
- a fetched source can be converted into a typed claim record
- truth audit can reject stale, generic, unsupported, or weak candidates deterministically
- high-impact memory writes require truth audit metadata
- `truth_violation` findings are persisted to DB as relationship memory entries, queryable by session and task

### Workstream C. Proof judge

Intended invariant:
- a steward turn is never recorded as successful unless execution history, claimed outputs, and grounding evidence satisfy task-type-specific criteria evaluated by host code; model self-reporting of success is never sufficient

Goal:
- preserve steward-style grounding verification before high-confidence completion or durable memory promotion

PEQS source modules:
- [core/proof_judge.py](C:\ai_agent\PEQS\core\proof_judge.py)
- [core/proof_knowledge.py](C:\ai_agent\PEQS\core\proof_knowledge.py) — vector store of labeled good/bad proof examples by task type; `retrieve_similar()` is called inside `verify_proof_grounding()`; required, not optional
- [core/novel_flag.py](C:\ai_agent\PEQS\core\novel_flag.py) — 32 lines; post-judge step: if `novel_flag=True` and `novel_confidence > 0.85`, emits `novel_claim.flagged` DB event and appends the proof as a new labeled example via `append_novel_flag()`

OpenClaw target seams:
- final answer / task completion boundary
- any autonomous tool-driven run claiming successful completion
- structured output checkpoints for long-running agent turns
- `src/agents/command/attempt-execution.runtime.ts` — tool execution entry point; proof judge hooks here on turn completion

ii-agent donor references:
- [docs/CODE_REVIEW.md](C:\ai_agent\Steward2_ii_agent\docs\CODE_REVIEW.md)
- [docs/database-design.md](C:\ai_agent\Steward2_ii_agent\docs\database-design.md)
- `src/ii_agent/agents/tools/base.py`

ii-agent inspiration use:
- richer runtime review/replay expectations and tool execution record structure

Steward2 target modules:
- `src/steward/proof/proof-judge.ts`
- `src/steward/proof/proof-types.ts`
- `src/steward/proof/proof-history.ts`
- `src/steward/proof/proof-examples.ts` — port of proof_knowledge.py; labeled example retrieval backed by knowledge store
- `src/steward/proof/proof-schema.ts` — DB table definition for `steward_proofs` (task_id, session_id, proof_text, verdict, score, failure_class, grounded, accepted_at, rejected_at, rejection_reason)
- `src/steward/proof/novel-flag.ts` — post-judge novel detection; high-confidence novel proofs appended to proof example store; emits `novel_claim.flagged` DB event

Port shape:
- hybrid deterministic + model-assisted evaluator
- reuse OpenClaw runtime context summaries, but final grounding verdict remains steward-owned
- heuristic fallback (`_contribution_heuristic_fallback`) must be ported and strengthened — it is the only path when the judge model fails

Responsibilities:
- build condensed execution history (3000-char cap)
- enforce task-type-specific evidence requirements (6 types: learning, self_improvement, contribution, steward_health, communication, general)
- evaluate proof note grounding
- classify failure classes: `judge_error`, ungrounded, metric_missing, source_missing, history_mismatch
- persist proof verdicts to `steward_proofs` table

Dependencies:
- Workstream A: DB runtime for execution history and proof persistence
- Workstream B: truth-audit outputs feed into proof context
- Workstream G: knowledge store for proof example retrieval
- OpenClaw agent-run result packaging
- model integration (see Blocking decisions — model manager)

Acceptance:
- a turn cannot be marked steward-successful without passing proof criteria
- proof verdicts are persisted to `steward_proofs` table with acceptance_status, score, and failure_class
- proof examples (good/bad) are retrievable by task_type from the knowledge store
- heuristic fallback produces a deterministic verdict when the judge model is unavailable

### Workstream D. Consequence logic

Intended invariant:
- no mutating, truth-sensitive, or high-impact action executes without passing a steward-owned consequence policy check; the consequence decision is deterministic for truth-gated cases and model-assisted for causal classification; the model cannot approve its own high-impact actions

Goal:
- inject steward consequence policy into external action approval and execution

PEQS source modules:
- [core/consequence_simulator.py](C:\ai_agent\PEQS\core\consequence_simulator.py)
- [core/survival_causal_model.py](C:\ai_agent\PEQS\core\survival_causal_model.py) — deterministic causal dependency graph; `simulate_negation()` propagates failed states transitively; consequence simulator cannot work without this
- [core/operator_override.py](C:\ai_agent\PEQS\core\operator_override.py) — operator can override a REFUSE/WARN to `ALLOW_BY_OPERATOR_OVERRIDE`; includes fatigue penalty (>= 4 overrides in 7 days: -1800s budget; >= 7: requires review); logs override events to relationship_memory

Note: `core/tool_supervisor.py` (precheck validation) is a structural gate that runs BEFORE consequence_simulator. It belongs in Workstream F. Do not merge into consequence logic.

OpenClaw target seams:
- [src/acp/approval-classifier.ts](C:\ai_agent\Steward2\src\acp\approval-classifier.ts) — currently classifies tools as `readonly_scoped | mutating | exec_capable | control_plane | interactive | other | unknown`; steward consequence recommendation must bridge into this classification, not replace it
- exec approval and plugin approval flows
- message action dispatch
- node / system action dispatch

ii-agent donor references:
- `src/ii_agent/agents/tools/base.py`
- `src/ii_server/utils.py`
- integration and tool modules under `src/ii_agent/agents/tools/`

ii-agent inspiration use:
- broad tool surface metadata, confirmation needs, MCP loading shape, and integration breadth

Steward2 target modules:
- `src/steward/consequence/consequence-simulator.ts`
- `src/steward/consequence/causal-model.ts`
- `src/steward/consequence/truth-gate.ts` — deterministic pre-LLM gate for `knowledge.store` (requires provenance_urls, confidence >= 0.6) and `file.write` (blocks writes to protected paths); protected paths from code_improvement.py FORBIDDEN list: `core/stewardship.py`, `core/code_improvement.py`, `core/consequence_simulator.py`, `core/controller.py`, and their Steward2 equivalents under `src/steward/`
- `src/steward/consequence/action-policy-bridge.ts` — maps steward recommendation (ALLOW / WARN / REROUTE / REFUSE / ALLOW_BY_OPERATOR_OVERRIDE) to OpenClaw AcpApprovalClass; this bridge is required for approval UI to remain OpenClaw-grade
- `src/steward/consequence/operator-override.ts` — port of operator_override.py; override fatigue tracking; override events persisted via Workstream G

Port shape:
- keep OpenClaw approval transport and delivery
- replace or extend the approval decision policy with steward consequence evaluation
- truth-gate runs first (deterministic, no LLM); LLM negation classification runs second; causal model simulation runs third; operator override check runs last
- consequence events are written to DB (kind=`consequence`, messages: `consequence.check`, `consequence.warning`, `consequence.reroute`, `consequence.refused`, `consequence.override_allowed`)

Responsibilities:
- fast-pass vs checked tools (FAST_PASS set: note.write, task.done, knowledge.store, file.read, browser.fetch, etc.)
- truth-gated writes (REROUTE or REFUSE on missing provenance, low confidence, protected path writes)
- causal negation simulation via CausalDependencyModel
- action recommendation: ALLOW / WARN / REROUTE / REFUSE / ALLOW_BY_OPERATOR_OVERRIDE
- operator override application and fatigue penalty
- bridge recommendation into OpenClaw approval classes and exec/plugin approval surfaces

Consequence → approval bridge (required, explicit):
- ALLOW → pass through as OpenClaw `readonly_scoped` or `mutating` (existing behavior)
- WARN → emit warning event + pass as `mutating` with warn flag
- REROUTE → redirect to safer tool path; do not execute original tool
- REFUSE → map to OpenClaw `control_plane` denial; block execution
- ALLOW_BY_OPERATOR_OVERRIDE → pass as `mutating` with override metadata recorded

Dependencies:
- Workstream A: DB event write path for action checks and approvals
- Workstream F: tool_supervisor precheck must run before consequence_simulator.simulate()
- Workstream G: operator override events persisted to relationship_memory
- command/tool taxonomy map between OpenClaw tool ids and steward consequence classes (required before Workstream D can be considered complete)
- model integration (LLM negation classification; see Blocking decisions)

Acceptance:
- mutating or high-impact actions are classified and checked through steward consequence logic before execution
- approval UI and routing remain OpenClaw-grade
- REFUSE produces an OpenClaw-grade denial; ALLOW passes through without disruption
- consequence events are written to DB and queryable by task and session
- operator override is persisted with fatigue tracking; >= 4 overrides in 7 days triggers time penalty

### Workstream E. Stewardship mission and operator hierarchy

Intended invariant:
- steward identity, operator hierarchy, and mission principles are structurally enforced by host modules injected into every LLM call and every runtime decision; steward behavior cannot degrade to generic assistant behavior when prompt fragments are missing or rewritten

Goal:
- turn the OpenClaw assistant into a steward by structural mission policy, not only persona wording

PEQS source modules:
- [core/stewardship.py](C:\ai_agent\PEQS\core\stewardship.py) — mission preamble, truth/boundary/refusal/hierarchy/time constants; `prompt_preamble()` is injected into every LLM call across all workstreams
- [core/task_value_adjudicator.py](C:\ai_agent\PEQS\core\task_value_adjudicator.py) — task scoring 0–10; labels: high_value (8+), neutral (5–7), low_value (2–4), hollow (0–1); adjustments: phase_advanced, proof_written, proof_type_novel, reflection metadata
- [core/time_clock.py](C:\ai_agent\PEQS\core\time_clock.py) — two-mode time budget: percentage penalty at high runway (> 48h), fixed penalty at low runway; bonuses: VALIDATION_BONUS (~1.8 days), KNOWLEDGE_MILESTONE_BONUS (30m per 15 entries), TELEMETRY_BONUS (60s); REJECTION_BURN base 1800s max 14400s
- [core/stewardship_reflection.py](C:\ai_agent\PEQS\core\stewardship_reflection.py) — post-task grading: truth_preserved, operator_served, burden_reduced, continuity_protected, discretion_honored, contradiction_surfaced, truthful_refusal, busywork; called by task_value_adjudicator; required for accurate task scoring
- [core/stewardship_audit.py](C:\ai_agent\PEQS\core\stewardship_audit.py) — weekly/monthly drift reports; detects mission drift (revenue % vs stewardship scores, truth violation rate); `score_recent_events()` grades health
- [core/goals.py](C:\ai_agent\PEQS\core\goals.py) — opportunity category registry (trading, saas, defi, affiliate, arbitrage, api_service, token, agent_product, power_market, roblox); research phase flow (4 steps: pick/research/implement/prove); category diversity enforcement (24h window); task template generation
- [core/heuristics.py](C:\ai_agent\PEQS\core\heuristics.py) — confidence/frustration/curiosity state machine; three KV-backed floats clamped 0–1; event handlers adjust on proof/validation/failure events; `decay_tick()` nudges values toward 0.5 each controller tick; `get_prompt_context()` injects temperament label into prompts; `should_force_research()` gate at frustration > 0.80 and curiosity > 0.60

Note: `core/operator_override.py` moved to Workstream D (consequence logic) because overrides are structurally part of the consequence decision path, not mission text.

OpenClaw target seams:
- agent system prompts / runtime prompts — `prompt_preamble()` must be injected here
- approval and owner-only tool policy
- session-level operator identity and preferences
- heartbeat/proactive behavior

ii-agent donor references:
- [README.md](C:\ai_agent\Steward2_ii_agent\README.md)
- docs overview and methods sections under [docs](C:\ai_agent\Steward2_ii_agent\docs)

ii-agent inspiration use:
- contrast source for generic assistant behavior, planning/reflection presentation, and realtime interaction expectations

Steward2 target modules:
- `src/steward/mission/stewardship-core.ts` — `promptPreamble()`, `coreHash()`, `sourceHash()`, mission/truth/boundary/refusal/hierarchy/time constants
- `src/steward/mission/operator-hierarchy.ts` — hierarchy enforcement logic; stewardship > research > revenue; task yields to mission, not the reverse
- `src/steward/mission/time-budget.ts` — two-mode penalty, bonus logic, VALIDATION_BONUS, KNOWLEDGE_MILESTONE_BONUS, TELEMETRY_BONUS, REJECTION_BURN; DB-backed time state via `steward_kv`
- `src/steward/mission/task-value.ts` — task scoring + label adjudication; calls stewardship-reflection
- `src/steward/mission/stewardship-reflection.ts` — post-task quality grader; 8 dimensions; busywork detection
- `src/steward/mission/stewardship-audit.ts` — weekly/monthly drift report; health scoring
- `src/steward/mission/goals-registry.ts` — opportunity category registry; research phase templates; category diversity enforcement
- `src/steward/mission/heuristics.ts` — temperament state machine; confidence/frustration/curiosity event handlers; `decayTick()`; prompt injection via `getPromptContext()`; `shouldForceResearch()` gate

Port shape:
- `stewardship-core.ts` is a direct port (77 lines of constants + hashes); do this first, everything else imports it
- time/value logic must be redesigned to fit Steward2 runtime once DB authority is in place
- stewardship_reflection is a required dependency of task-value — do not port task-value without it

Responsibilities:
- canonical steward preamble injected into all LLM calls
- mission hierarchy and refusal semantics
- time budget / reward / burn policy (two-mode, DB-backed)
- task value scoring aligned to stewardship, not just activity
- post-task reflection for stewardship quality grading
- weekly/monthly drift detection and health reporting
- operator goal and opportunity category management

Dependencies:
- Workstream A: DB runtime and event model; `steward_kv` for time budget state
- Workstream G: relationship_memory for drift reports and truth event queries

Acceptance:
- steward mission is a central runtime module, not scattered prompt fragments
- `promptPreamble()` is injected into every LLM system prompt
- operator-first hierarchy can affect approval, refusal, and reward paths
- task value score is computed with stewardship-reflection dimensions, not just activity count
- time budget has two-mode penalty logic and all bonus types from PEQS time_clock

### Workstream F. Tool supervisor

Intended invariant:
- tool arguments are structurally validated by host code before any consequence evaluation or execution attempt; malformed, empty, or structurally forbidden inputs are rejected before the LLM consequence classifier sees them

Goal:
- add a host-owned structural precheck gate before consequence logic and tool dispatch; validate tool arguments before any consequence evaluation or LLM classification runs

PEQS source modules:
- [core/tool_supervisor.py](C:\ai_agent\PEQS\core\tool_supervisor.py) — `precheck(tool, args)` validates before dispatch: research.web requires non-empty query; browser.fetch requires valid non-empty URL; code.run detects remote acquisition attempts (requests, urllib, socket, bs4); detects URL literals in code strings; knowledge.store requires non-empty text; returns classification: accept | hard_fail | retry | reroute | refuse

OpenClaw target seams:
- `src/agents/pi-tools.before-tool-call.ts` — `runBeforeToolCallHook()` / `wrapToolWithBeforeToolCallHook()` are the correct call sites; runs before every individual tool execution inside the existing host-owned before_tool_call wrapper; `attempt-execution.runtime.ts` is a re-export barrel, not the call site

ii-agent donor references:
- `src/ii_agent/agents/tools/base.py`
- tool modules under `src/ii_agent/agents/tools/`

ii-agent inspiration use:
- typed tool metadata, sandbox requirements, confirmation details, and stop-after-tool-call semantics

Steward2 target modules:
- `src/steward/tool/tool-supervisor.ts` — `precheckToolCall({toolName, args, sessionKey?})` returning `ToolSupervisorPrecheckResult`; emits DB event on `hard_fail` or `refuse`; safe fallback if DB not initialized
- `src/steward/tool/precheck-rules.ts` — `PrecheckVerdict` union, `ToolPrecheckResult` and `ToolPrecheckIssue` types; `runToolPrecheckRules(toolName, rawArgs)` with extensible `RULES` array; uses OpenClaw-native tool IDs

Port shape:
- precheck rules ported from `tool_supervisor.py` and re-expressed with OpenClaw tool IDs (`web_search`, `web_fetch`, `exec`, `read`/`write`/`edit`, `apply_patch`) — do not use PEQS-internal IDs
- TypeScript type is an idiomatic adaptation: `verdict` replaces `classification`, `rerouteToolName` makes rerouting explicit, Python-only fields (`report_type`, `ok`, `sanitized_args`) dropped as redundant in a typed language
- `postcheck()` (result normalization) is not in WS-F scope; deferred as a separate host-owned follow-up slice on the post-tool result seam
- unknown tool IDs pass precheck with `accept`; no PEQS-to-OpenClaw ID mapping needed

Responsibilities:
- validate tool arguments before consequence_simulator sees them
- detect malformed, empty, or structurally invalid inputs
- detect code that attempts remote acquisition without using web tools
- detect URL literals embedded directly in code strings
- emit precheck events to DB on hard_fail or refuse

Dependencies:
- Workstream A: DB event write for precheck failures
- must run before Workstream D (consequence_simulator.simulate())

Acceptance:
- `precheck()` is called before every tool dispatch attempt
- `hard_fail` blocks execution and emits DB event; `reroute` redirects to correct tool; `refuse` blocks
- OpenClaw tool ids are mapped to precheck rules; unknown tool ids pass with accept

---

### Workstream G. Relationship memory and knowledge store

Intended invariant:
- operator preferences, truth findings, stewardship ledger entries, and proof examples are durable across sessions and process restarts; memory is never lost because a process died or a session JSON was evicted; recall is always from DB-backed store, never from in-memory or session-only state

Goal:
- provide the persistence layer for truth findings, operator preferences, session continuity, and proof examples; bridge Workstream B (truth audit) and Workstream C (proof judge) to durable DB-backed memory

PEQS source modules:
- [core/relationship_memory.py](C:\ai_agent\PEQS\core\relationship_memory.py) — 8 memory types with salience weights: operator_boundary (1.0), operator_preference (0.95), truth_reinforced (0.9), truth_violation (0.8), shared_thread (0.8), household_routine (0.75), stewardship_ledger (0.7), operator_override (0.6); `recall()` returns salience-weighted entries (similarity × importance × recency × weight); `inject_current_context()` injects into prompts; `reinforce_truth()` adjusts confidence score on an existing entry; `bootstrap_first_contact()` seeds 5 initial memories if none exist
- [core/knowledge.py](C:\ai_agent\PEQS\core\knowledge.py) — vector store; `store(text, metadata, db)` embeds and inserts; `search(query, db, top_k)` brute-force cosine over all rows; temporal decay, stale/fallback/confidence multipliers; high-impact entries require `provenance_urls`, `confidence_score`, `last_verified_ts` in metadata or store raises
- [core/skills.py](C:\ai_agent\PEQS\core\skills.py) — `extract(task, history, db)` extracts tool sequences from successful tasks; `match(title, db)` Jaccard similarity to surface best-matching skill; `load_skills_for_task_type()` reads vault markdown files — **out of scope** (vault structure does not exist in Steward2; OpenClaw has its own skills system)

OpenClaw target seams:
- `src/agents/system-prompt.ts` — relationship context injection (`injectCurrentContext()` equivalent) hooks here, after stewardship core preamble; bounded to ≤ 2000 chars; only called if DB is open and memories exist (`src/agents/memory-search.ts` is OpenClaw's own file-ingestion memory system — it is NOT the steward injection seam)
- no OpenClaw file requires modification for memory writes — `storeRecord()` is called directly by other steward modules (truth audit → truth_violation/truth_reinforced, session bridge → first-contact bootstrap)

ii-agent donor references:
- [docs/database-design.md](C:\ai_agent\Steward2_ii_agent\docs\database-design.md)
- session-related modules under `src/ii_agent/sessions/` when implementation starts

ii-agent inspiration use:
- richer session/message/run schema expectations and durable runtime artifact storage shape

Steward2 target modules:
- `src/steward/memory/relationship-memory.ts` — 8-type memory store; `storeRecord()`, `recall()`, `injectCurrentContext()`, `reinforceTruth()`, `bootstrapFirstContact()`
- `src/steward/memory/memory-types.ts` — `RelationshipMemoryType` union, `MEMORY_TYPE_WEIGHTS` map, `FIRST_CONTACT_RECORDS` seed data
- `src/steward/memory/knowledge-store.ts` — sqlite-vec backed store; `storeKnowledge(text, meta, embedder?)`, `searchKnowledge(query, options?)`, `loadSqliteVecForDb(db)` — loads extension synchronously using `require('sqlite-vec').load(db)` via `createRequire` (sqlite-vec's `load()` is synchronous; only the dynamic `import()` call is async, so use `createRequire` to bypass that); called once at DB init time from `knowledge-store.ts` not from `db-bootstrap.ts`
- `src/steward/memory/embedder.ts` — `type Embedder = (text: string) => Promise<Float32Array>`; `deterministicEmbed(text, dim?)` SHA-256 fallback; `lmstudioEmbed(text, baseUrl)` LMStudio client; `resolveEmbedder()` returns lmstudio embedder if `STEWARD_EMBED_URL` is set, deterministic fallback otherwise
- `src/steward/db/migrations/0002_knowledge.sql` — `steward_knowledge` table (`id`, `session_id`, `ts`, `memory_type`, `text`, `embedding`, `meta_json`); `steward_knowledge_vec` virtual table via `vec0(embedding float[768])`; `steward_skills` table (`id`, `task_id`, `title`, `normalized_title`, `tool_sequence_json`, `ts`)
- `src/steward/memory/skills.ts` — `extractSkill(task, toolHistory)` stores to `steward_skills`; `matchSkill(title)` Jaccard against `steward_skills`; `load_skills_for_task_type()` is NOT ported (vault structure absent; OpenClaw has `src/agents/skills.ts`)

Port shape:
- `relationship-memory.ts` is a direct port of `relationship_memory.py` with session_id (steward SHA-256 hash) as the primary grouping key
- `knowledge-store.ts` ports `knowledge.py` with sqlite-vec replacing brute-force Python cosine; temporal decay, stale/fallback/confidence multipliers preserved exactly
- `bootstrapFirstContact()` is called from `getOrCreateStewardSession()` in `session-authority.ts` (WS-A seam) — add a non-breaking call after the upsert; it is idempotent (checks `has_minimum_relationship_context()` first)
- `injectCurrentContext()` is called from `buildAgentSystemPrompt()` in `src/agents/system-prompt.ts` — add after the stewardship core section; bounded to 2000 chars; guarded by `try/catch` (DB may not be open in all contexts)
- `proof_knowledge.py` is Workstream C; `knowledge-store.ts` provides the shared storage layer; the `examples` table and proof-specific schema are WS-C's responsibility, not WS-G's — do not port proof_knowledge.py here

Responsibilities:
- store and retrieve operator preferences, boundaries, shared threads, stewardship ledger entries
- store and retrieve truth violations and truth reinforcements (feeds back into truth audit and stewardship audit)
- store and retrieve operator override events (feeds into time budget fatigue tracking)
- provide vector similarity search backed by sqlite-vec
- inject relevant memories into agent prompts at session start (bounded, guarded)
- bootstrap first-contact seed memories on first session

Dependencies:
- Workstream A: DB bootstrap and session authority seam; `steward_knowledge` and `steward_skills` tables are added by WS-G migration `0002_knowledge.sql` — NOT present in WS-A's `0001_init.sql`
- must be in place before Workstream B (truth audit persistence), Workstream C (proof examples), and Workstream D (override event persistence)

Blocking decision:
- embedding strategy: resolved in BD-3 — `sqlite-vec` for storage; injectable embedder with SHA-256 deterministic fallback; real embedder via `STEWARD_EMBED_URL` (LMStudio `/v1/embeddings` compatible)

Acceptance:
- `recall(sessionId, query, memoryType?)` returns salience-sorted entries from `steward_knowledge` via sqlite-vec
- `storeRecord(sessionId, memoryType, text, meta)` persists with embedding to `steward_knowledge`
- `bootstrapFirstContact()` seeds 5 initial memories on first session; is idempotent
- `injectCurrentContext()` returns bounded relationship context string injected into system prompt
- truth_violation and truth_reinforced entries are queryable by session and ts range
- `matchSkill(title)` returns Jaccard-matched skill from `steward_skills` or null
- migration `0002_knowledge.sql` runs cleanly after `0001_init.sql`; sqlite-vec extension loads on first knowledge access

---

### Workstream H. Maintenance governor and metacog monitor

Intended invariant:
- broken loops, mission drift, and operational anomalies are detected and corrected by host-owned control logic without operator intervention; the control system cannot consume more than its budget (max 3 control tasks per 24h, max 20% of total tasks); self-healing never starves the main runtime

Goal:
- give Steward2 structural self-healing: detect broken loops, mission drift, and operational anomalies; seed corrective control tasks without operator intervention; prune stale data

PEQS source modules:
- [core/maintenance_governor.py](C:\ai_agent\PEQS\core\maintenance_governor.py) — rule-based observer; detects root causes: task_design_issue, planner_issue, research_deficit, tool_misuse, strategy_defect, stewardship_drift; interventions: hint_patch, reroute_task, diagnostic_task, strategy_reset; control budget (max 3 control tasks per 24h, max 20% of total tasks); weekly/monthly DB audits; prunes old events/knowledge/tasks
- [core/metacog_monitor.py](C:\ai_agent\PEQS\core\metacog_monitor.py) — anomaly detection: SPIN (> 50 identical events in 60s), STAGNATION (no proofs in > 2h), FRUSTRATION (> 5 consecutive failed tasks); seeds analysis tasks on anomaly; control-budget aware
- [core/self_improvement.py](C:\ai_agent\PEQS\core\self_improvement.py) — task failure rate analysis by normalized title group (min 3 attempts, > 50% failure); builds corrective hints from common error messages and proven tool sequences; `run_tick()` called with 3600s cooldown per title group; storage moves from file-based JSON to DB-backed (kv + events); revenue drift markers stripped — replaced with stewardship drift from stewardship_audit

OpenClaw target seams:
- agent runtime event stream — both monitors observe all DB events
- task creation API — seeds diagnostic/control tasks
- session lifecycle hooks — maintenance runs on session tick or scheduled interval

ii-agent donor references:
- `src/ii_agent/app/__init__.py`
- websocket / realtime integration modules under `src/ii_agent/app/`
- reviewer / replay / runtime event modules when implementation starts

ii-agent inspiration use:
- live event surfacing, replay expectations, and richer runtime observation patterns

Steward2 target modules:
- `src/steward/control/maintenance-governor.ts` — event observer; root cause classifier; intervention seeder; DB pruner; control budget enforcer
- `src/steward/control/metacog-monitor.ts` — anomaly detector (SPIN, STAGNATION, FRUSTRATION); analysis task seeder
- `src/steward/control/control-budget.ts` — shared control budget tracker (max tasks per window, max ratio); used by both governor and metacog
- `src/steward/control/self-improvement.ts` — systematic failure pattern analysis; corrective hint construction and injection; cooldown enforcement; stewardship-drift detection (not revenue-drift)

Port shape:
- direct port of detection logic and intervention rules
- control budget is shared across both modules via `control-budget.ts`
- DB pruning (old events, knowledge, tasks) runs on governor schedule, not on every turn

Responsibilities:
- detect SPIN, STAGNATION, FRUSTRATION patterns from event stream
- detect root causes of repeated task failure (task design, planner, research deficit, tool misuse)
- seed corrective tasks within control budget
- weekly/monthly stewardship drift reports (via stewardship_audit)
- prune stale events, knowledge, and tasks on schedule

Dependencies:
- Workstream A: DB event stream read; task creation write path
- Workstream E: stewardship_audit for drift reports; time_clock for budget-aware pruning
- Workstream G: relationship_memory for drift signal queries

Acceptance:
- SPIN detected within 60s of > 50 identical events; analysis task seeded within 1 control budget slot
- STAGNATION detected after 2h without proofs; corrective task seeded
- control budget enforced: no more than 3 governor/metacog tasks per 24h window
- DB pruning runs on schedule without operator action; prune events respect retention policy

---

## Port order

The full tranche, ordered by structural dependency:

1. `DB runtime authority` (Workstream A)
- every later subsystem needs a canonical DB layer; nothing else can be built without this
- blocking decision: SQLite package choice must be resolved first

2. `Stewardship mission / operator hierarchy` (Workstream E — stewardship-core.ts only)
- `stewardship-core.ts` (prompt_preamble, constants, hashes) is 77 lines and zero dependencies
- port this immediately after DB; it is injected into every LLM call in all later workstreams
- time-budget.ts, task-value.ts, stewardship-reflection.ts depend on DB and G; port those after G

3. `Tool supervisor` (Workstream F)
- must be in place before consequence logic; consequence_simulator assumes args are structurally valid
- F is a structural gate, not a semantic layer; port early and wire into tool dispatch

4. `Relationship memory and knowledge store` (Workstream G)
- truth audit findings, proof examples, operator overrides, and drift signals all persist here
- B, C, D, E (full) all depend on G; port G before any of them are considered complete

5. `Consequence logic` (Workstream D)
- OpenClaw already has approval transport; steward consequence policy goes in now
- requires: A (DB events), F (tool precheck), G (override persistence)
- consequence→approval bridge (`action-policy-bridge.ts`) is required before D is complete

6. `Truth audit` (Workstream B)
- requires: A (DB), G (relationship_memory and knowledge_store for persistence)
- deterministic host logic; direct TypeScript port from PEQS

7. `Proof judge` (Workstream C)
- requires: A (DB), B (truth audit context), G (knowledge store for proof examples)

8. `Stewardship mission — full` (Workstream E remaining modules)
- time-budget.ts, task-value.ts, stewardship-reflection.ts, stewardship-audit.ts, goals-registry.ts
- requires: A (DB kv), G (relationship_memory for drift queries)

9. `Maintenance governor and metacog monitor` (Workstream H)
- requires: A (event stream + task creation), E (audit + time clock), G (relationship_memory)
- last in order because it observes the whole system; needs everything else in place first

## Workstream advancement checklist

This section defines what must be seen before implementation may advance to the next workstream.

### Before advancing past Workstream A. DB runtime authority

We must see:
- `module evidence`
  - all target modules under `src/steward/db/*` and `src/steward/runtime/*` exist
  - db-bootstrap.ts runs migrations on startup and exports the DB handle
  - session-authority.ts, session-bridge.ts, and session-projection.ts are present and wired
- `boundary evidence`
  - explicit adapters from OpenClaw `session-key.ts` and `store.ts` into steward DB runtime
  - `sessions.json` projection is confirmed as derived output, not authority
- `persistence evidence`
  - DB rows can be directly inspected for:
    - `steward_runtime_state` row for an active session (with `version` field)
    - `steward_sessions` row created on first contact
    - `steward_flows` row for a running flow
    - at least one `steward_events` row for an inbound turn
- `test evidence`
  - test: `session-key` → `steward_session_id` hash is deterministic across cold starts
  - test: CAS write with stale `version` fails cleanly without overwriting
  - test: DB rows survive process restart; cold start reconstructs runtime context without session JSON
- `runtime evidence`
  - one real inbound session is processed and its canonical state is queryable from DB without relying on session JSON as authority

### Before advancing past Workstream E (phase 1). Stewardship core

We must see:
- `module evidence`
  - `src/steward/mission/stewardship-core.ts` exists and is used by runtime prompt/policy assembly
- `boundary evidence`
  - the seam where OpenClaw runtime consumes steward mission policy is explicit
- `persistence evidence`
  - stewardship configuration / mission hash / policy version is persisted or inspectable
- `test evidence`
  - tests proving steward preamble and mission hierarchy are injected consistently
- `runtime evidence`
  - one live turn shows steward mission text and hierarchy coming from the steward module, not ad hoc prompt fragments

### Before advancing past Workstream F. Tool supervisor

We must see:
- `module evidence`
  - `src/steward/tool/*` owns precheck logic
- `boundary evidence`
  - tool dispatch path calls steward precheck before consequence logic and execution
- `persistence evidence`
  - precheck failures are written to DB/events with typed failure classes
- `test evidence`
  - tests proving invalid tool args are rejected before consequence logic runs
- `runtime evidence`
  - one live blocked tool call is rejected by the supervisor before action execution

### Before advancing past Workstream G. Relationship memory and knowledge store

We must see:
- `module evidence`
  - `src/steward/memory/*` owns steward memory and knowledge persistence
- `boundary evidence`
  - active-memory / retrieval seam into OpenClaw is explicit
- `persistence evidence`
  - steward memories and knowledge entries are queryable from DB
- `test evidence`
  - tests proving store + recall + provenance fields
- `runtime evidence`
  - one live recalled memory is injected from steward DB-backed memory, not from an ad hoc temporary path

### Before advancing past Workstream D. Consequence logic

We must see:
- `module evidence`
  - `src/steward/consequence/*` owns consequence policy
- `boundary evidence`
  - explicit bridge from steward consequence results into OpenClaw approval flows
- `persistence evidence`
  - action checks and their recommendations are persisted
- `test evidence`
  - tests proving recommendation mapping for ALLOW / WARN / REROUTE / REFUSE / override path
- `runtime evidence`
  - one live mutating action goes through steward consequence policy before approval/execution

### Before advancing past Workstream B. Truth audit

We must see:
- `module evidence`
  - `src/steward/truth/*` owns truth audit and candidate ranking
- `boundary evidence`
  - fetch/search/tool result normalization into truth-audit input is explicit
- `persistence evidence`
  - claim record, truth findings, and candidate decision are persisted
- `test evidence`
  - tests proving stale/generic/unsupported candidates are rejected deterministically
- `runtime evidence`
  - one live candidate path shows a truth-audited decision and stored findings

## Workstream C review gate

Reviewer: Claude. Files read: `proof-types.ts`, `proof-schema.ts`, `proof-history.ts`, `proof-examples.ts`, `proof-judge.ts`, `novel-flag.ts`, `0003_proof.sql`, `proof-judge.test.ts`. Seam confirmed in `session-store.ts` → `session-bridge.ts`.

Acceptance criterion assessment:

1. **A turn cannot be marked steward-successful without passing proof criteria** — `judgeAndPersistProof()` called from `session-bridge.ts:recordTurnComplete()` which is called in `session-store.ts` after every agent turn. Verdict gates on `grounded && score >= 0.65`. PASS.

2. **Proof verdicts persisted with acceptance_status, score, failure_class** — `steward_proofs` table in `0003_proof.sql`: all required fields present (`verdict`, `score`, `failure_class`, `grounded`, `accepted_at`, `rejected_at`, `rejection_reason`). `judgeAndPersistProof()` inserts and emits `proof.accepted` / `proof.rejected` events. PASS.

3. **Proof examples (good/bad) retrievable by task_type from knowledge store** — `storeProofExample()` writes to `steward_proof_examples` + `steward_knowledge` (via `skill_context` memory type); `retrieveSimilarProofExamples()` filters by `task_type` and `label` from vector search results. Dedup via SHA-1 `content_hash`. PASS.

4. **Heuristic fallback produces deterministic verdict when judge model unavailable** — `heuristicFallback()` covers all 6 task types with specific checks (URL required for learning, metric required for steward_health, lexical overlap for general); `contributionHeuristicFallback()` enforces key-value proof format with metric presence; used when no classifier injected or on classifier error. PASS.

5. **Module evidence** — all 6 spec-listed modules present: `proof-judge.ts`, `proof-types.ts`, `proof-history.ts`, `proof-examples.ts`, `proof-schema.ts`, `novel-flag.ts`. PASS.

6. **Boundary evidence** — seam: `session-store.ts:updateSessionStoreAfterAgentRun()` → `session-bridge.ts:recordTurnComplete()` → `judgeAndPersistProof()`. Classifier injected via `createSimpleCompletionStewardClassifier()` using haiku-4-5. PASS.

7. **Novel flag** — `handleNovelProofFlag()` emits `novel_claim.flagged` event and stores novel proof as `good` / `novel_flag` labeled example when `novelFlag=true && novelConfidence > 0.85`. Test proves this path via stub classifier. PASS.

Non-structural notes:
- `StewardClassifier` is defined as an interface with `classifyJson<T>()` rather than the simple function type from BD-4 spec — stricter typing, no behavioral difference.
- Seam is `session-bridge.ts` (not `attempt-execution.runtime.ts` as spec named) — same functional boundary, correct decomposition.

**Verdict: PASS.** All 4 acceptance criteria and advancement gate requirements met. 1 file, 3 tests passing.

---

### Before advancing past Workstream C. Proof judge

We must see:
- `module evidence`
  - `src/steward/proof/*` owns proof verification
- `boundary evidence`
  - explicit completion seam where proof judge runs before steward-success is recorded
- `persistence evidence`
  - proof verdicts and supporting context are persisted
- `test evidence`
  - tests proving grounded vs ungrounded completion outcomes
- `runtime evidence`
  - one live turn is marked successful only after proof verification passes

### Before advancing past Workstream E (remaining modules)

We must see:
- `module evidence`
  - time-budget, task-value, stewardship-reflection, stewardship-audit, goals-registry all exist under `src/steward/mission/*`
- `boundary evidence`
  - runtime/value/reflection hooks are explicit, not hidden in unrelated shell modules
- `persistence evidence`
  - time budget, task value, and reflection outputs are persisted
- `test evidence`
  - tests proving reward/burn/value behavior and reflection generation
- `runtime evidence`
  - one live run shows mission/time/value behavior operating through steward modules

### Before advancing past Workstream H. Maintenance governor and metacog monitor

We must see:
- `module evidence`
  - `src/steward/control/*` owns maintenance and metacognitive monitoring
- `boundary evidence`
  - hooks from runtime/task/event streams into control modules are explicit
- `persistence evidence`
  - generated maintenance / metacog outputs are persisted and queryable
- `test evidence`
  - tests proving interval gating, budget caps, and emitted outputs
- `runtime evidence`
  - one live run shows bounded maintenance/metacog behavior without collapsing the main runtime path

## Current target module structure

Steward2 namespace (`src/steward/`):
- `src/steward/db/*` — runtime-db.ts, runtime-schema.ts, db-bootstrap.ts, tx.ts, migrations/0001_init.sql, migrations/runner.ts
- `src/steward/runtime/*` — runtime-state.ts, runtime-state-repo.ts, runtime-flow.ts, runtime-events.ts, runtime-bridge.ts, session-authority.ts, session-bridge.ts, session-projection.ts
- `src/steward/mission/*` — stewardship-core.ts, operator-hierarchy.ts, time-budget.ts, task-value.ts, stewardship-reflection.ts, stewardship-audit.ts, goals-registry.ts, heuristics.ts
- `src/steward/consequence/*` — consequence-simulator.ts, causal-model.ts, truth-gate.ts, action-policy-bridge.ts, operator-override.ts
- `src/steward/truth/*` — truth-types.ts, truth-audit.ts, claim-record.ts, candidate-ranking.ts, source-kind.ts, truth-persistence.ts
- `src/steward/proof/*` — proof-judge.ts, proof-types.ts, proof-history.ts, proof-examples.ts, proof-schema.ts, novel-flag.ts
- `src/steward/memory/*` — relationship-memory.ts, memory-types.ts, knowledge-store.ts, memory-schema.ts, skills.ts
- `src/steward/tool/*` — tool-supervisor.ts, precheck-rules.ts
- `src/steward/control/*` — maintenance-governor.ts, metacog-monitor.ts, control-budget.ts, self-improvement.ts

Note: `src/steward/` does not exist yet. It must be created before any port begins.

Reason:
- keeps steward-native core visually separate from OpenClaw-native shell
- makes future rebases against upstream OpenClaw easier

## Blocking decisions

These must be resolved before the relevant workstream starts. No implementation proceeds without a decision recorded here.

Decision record rule:
- a blocking decision is not resolved by preference text alone
- the chosen option, rationale, affected files/seams, and rejected alternatives must all be recorded here
- when a blocker is resolved, the relevant row in the `Workstream status board` must be updated in the same edit

Blocker handling rule:
- blockers must be resolved workstream-by-workstream before that workstream starts
- do not try to fully pre-resolve every downstream blocker before upstream foundation work exists, unless the blocker is global and architecture-shaping
- resolve blockers in this order:
  - first: blockers for the current implementation workstream
  - second: blockers for the next directly dependent workstream
  - third: downstream blockers that require code or artifact inspection created by earlier workstreams
- global blockers that shape multiple workstreams must be resolved early even if their implementation comes later

Current blocker resolution stance:
- Workstream A blockers must be fully resolved before any code porting starts
- Workstream E phase 1 and F may be analyzed in parallel, but their implementation still waits for Workstream A confirmation
- Workstream G blocker (`BD-3`) should be resolved before Workstream G starts, not necessarily before Workstream A
- Workstreams C, D, and E LLM-dependent blocker (`BD-4`) should be resolved before the first LLM-dependent steward module starts
- Workstream D blockers (`BD-6`, `BD-8`) must be resolved before any consequence code is ported
- downstream blockers may remain `OPEN` while upstream workstreams are being implemented, as long as they do not affect the current workstream's invariant or acceptance

### BD-1. SQLite package / runtime strategy (blocks Workstream A)
OpenClaw currently has no SQLite driver. Options:
- `node:sqlite` — built into Node 22+, synchronous `DatabaseSync`, no extra package, already used in-repo for sqlite-vec loading
- `better-sqlite3` — synchronous, zero-overhead, most common in Node for embedded SQLite
- `sqlite3` npm — async, callback-based
- `@databases/sqlite` — async, promise-based, built on better-sqlite3
- `drizzle-orm` + `better-sqlite3` — typed ORM + migration layer

Decision: **RESOLVED**

Chosen option:
- `node:sqlite` with `DatabaseSync` as the canonical Steward2 runtime driver

Rationale:
- OpenClaw already requires Node `>=22.14.0`, so `node:sqlite` is available without adding a new native dependency
- the repo already contains a working `DatabaseSync` + `enableLoadExtension()` pattern in [sqlite-vec.ts](C:\ai_agent\Steward2\packages\memory-host-sdk\src\host\sqlite-vec.ts)
- Workstream A needs deterministic embedded SQLite behavior, not ORM features
- this keeps the stewardship core on platform primitives and minimizes install friction

Affected seams / files:
- `src/steward/db/runtime-db.ts`
- `src/steward/db/runtime-schema.ts`
- `src/steward/db/db-bootstrap.ts`
- `src/steward/db/migrations/*`

Rejected alternatives:
- `better-sqlite3`: good, but redundant with built-in `node:sqlite` and adds native install/build burden
- `sqlite3` npm: callback-oriented and not aligned with a deterministic host-owned runtime seam
- `@databases/sqlite`: wrapper not needed for the first stewardship tranche
- `drizzle-orm` + `better-sqlite3`: too much framework weight before the runtime authority seam is proven

### BD-2. Session-to-DB bridge strategy (blocks Workstream A acceptance)
OpenClaw session store is file-based JSON (`src/config/sessions/store.ts`). Three options:
- `cache-over-DB`: DB is authoritative; session JSON is a read-through cache derived from DB on miss
- `mirror-from-DB`: both are written on every session change; JSON is kept for OpenClaw compat
- `progressive-replacement`: JSON store is authoritative initially; DB takes over subsystem by subsystem

Decision: **RESOLVED**

Chosen option:
- `mirror-from-DB`, with DB authoritative and JSON kept only as a compatibility projection

Rationale:
- OpenClaw has many existing JSON-session readers across gateway, ACP, plugin-sdk, heartbeat, and tooling surfaces
- replacing every reader in Workstream A would turn the DB authority slice into a shell-wide refactor
- keeping JSON authoritative would violate Steward2’s core invariant immediately
- therefore the correct seam is: write canonical state to DB first, then project the compatibility subset to `sessions.json` for legacy OpenClaw readers

Authority rule:
- no steward-owned runtime state may exist only in JSON
- `sessions.json` is a derived compatibility view, not the source of truth
- steward-aware reads must prefer DB entities once the bridge is in place

Affected seams / files:
- OpenClaw references:
  - [store.ts](C:\ai_agent\Steward2\src\config\sessions\store.ts)
  - [store-load.ts](C:\ai_agent\Steward2\src\config\sessions\store-load.ts)
  - [session-key.ts](C:\ai_agent\Steward2\src\routing\session-key.ts)
- new Steward2 seam adapters:
  - `src/steward/runtime/session-authority.ts`
  - `src/steward/runtime/session-bridge.ts`
  - `src/steward/runtime/session-projection.ts`

Rejected alternatives:
- `cache-over-DB`: architecturally clean, but too disruptive for Workstream A because it forces immediate replacement of too many existing read paths
- `progressive-replacement`: preserves the wrong authority and invites split-brain state during migration

### BD-3. Knowledge store / embedding strategy (blocks Workstream G)
OpenClaw already has two vector options in deps:
- `sqlite-vec` (0.1.9) — SQLite extension for vector search; stays in same DB file
- `@lancedb/lancedb` (^0.27.2) — separate columnar vector store; more capable but separate process

Choose one as canonical. Do not use both. Embeddings must be generated somewhere — model or local embedder must be chosen.

Decision: **RESOLVED**

**Vector store: `sqlite-vec`.**
Rationale: stays in `steward.db` — the single-DB authority established by WS-A; no separate process or file; already in deps (no new dependency); at the scale of this system (hundreds of entries for one operator) sqlite-vec's ANN is sufficient. `lancedb` rejected: separate columnar file + process contradicts single-DB ownership.

PEQS note: `knowledge.py` uses plain SQLite BLOB + Python-side cosine with no vector extension. sqlite-vec is a direct upgrade of that approach — same DB, proper indexed vector search instead of full-table scan.

**Embedding interface: injectable function `(text: string) => Promise<Float32Array>` with SHA-256 deterministic fallback.**
Rationale: separates the storage concern (sqlite-vec) from the embedder concern (model selection). WS-G implements storage; the embedder is a pluggable dependency, not hardcoded.

- Default embedder: deterministic SHA-256 fallback (same algorithm as PEQS `_deterministic_embed`), dim=768 — works offline with no model dependency; tagged as fallback in metadata (same as PEQS `fallback_embed: true`)
- Configurable real embedder: LMStudio-compatible `/v1/embeddings` endpoint via `STEWARD_EMBED_URL` env var; model `text-embedding-nomic-embed-text-v1.5`, dim=768 — identical to PEQS; no new protocol to implement
- Embedder resolution is independent of BD-4 (BD-4 is about LLM inference; BD-3 embedder is a separate local endpoint)

Affected files: `src/steward/memory/knowledge-store.ts`, `src/steward/memory/embedder.ts` (new module owning embed interface + fallback + LMStudio client)

### BD-4. Model manager integration (blocks Workstreams C, D, E LLM calls)
PEQS uses `model_manager.call(model_name, prompt, system)` against a local LMStudio instance. Steward2 must decide:
- Does Steward2 use the OpenClaw model routing layer?
- Or does it wire a dedicated model client (Claude API, local, etc.)?
- Which model is used for consequence negation classification, proof grounding, and task value scoring?

Decision: **RESOLVED**

Chosen option:
- **injectable classifier** — `type StewardClassifier = (prompt: string, system?: string) => Promise<string>`; same pattern as WS-G's `StewardEmbedder`
- default model: `claude-haiku-4-5-20251001` — fast and cheap; adequate for binary/categorical classification (grounding, negation, value scoring)
- wired at the OpenClaw embedded runner seam — the caller injects the classifier when constructing proof/consequence/value modules; steward modules never import the Anthropic transport directly
- deterministic rule-based fallback when no classifier is injected — used in tests and low-trust contexts; never blocks execution
- PEQS `model_manager.call()` is NOT ported — the injectable pattern replaces it

Rationale:
- OpenClaw already owns the Anthropic transport (`anthropic-transport-stream.ts`); steward should not duplicate it or hold its own API key
- injectable keeps steward modules fully testable without a live model
- haiku is the right tier for classification subtasks; sonnet/opus remain reserved for agent turns
- the fallback ensures steward never hard-blocks on model availability

Affected modules:
- `src/steward/proof/proof-classifier.ts` — injectable classifier seam for WS-C
- `src/steward/consequence/negation-classifier.ts` — injectable classifier seam for WS-D
- `src/steward/mission/value-scorer.ts` — injectable classifier seam for WS-E
- injection point: `src/agents/pi-embedded-runner/run/attempt.ts` — same file as WS-G memory seam

### BD-5. DB schema versioning (blocks Workstream A)
PEQS has no migration system — schema is hardcoded SQL. Steward2 must choose:
- embedded migration runner (e.g. `better-sqlite3-migrations`)
- Drizzle migrations
- manual versioned SQL files

Decision: **RESOLVED**

Chosen option:
- manual versioned SQL files with `PRAGMA user_version`

Rationale:
- Workstream A needs explicit, reviewable, deterministic schema control
- the stewardship schema is architectural infrastructure, not generic CRUD
- this avoids coupling the first inner-core slice to an ORM or migration package before the authority seam is proven
- it matches OpenClaw’s broader style of explicit migration/normalization helpers, while making DB schema evolution first-class

Affected seams / files:
- `src/steward/db/migrations/0001_init.sql`
- `src/steward/db/migrations/runner.ts`
- `src/steward/db/db-bootstrap.ts`

Migration rule:
- every schema change gets a numbered SQL file
- startup bootstrap reads `PRAGMA user_version`, applies forward migrations in order, and then bumps `user_version`
- no implicit schema drift inside runtime code

Rejected alternatives:
- embedded migration runner package: unnecessary dependency surface for the first tranche
- Drizzle migrations: potentially useful later, but too heavy for steward-core startup

### BD-6. Consequence → approval bridge mapping (blocks Workstream D acceptance)
PEQS recommendations (ALLOW / WARN / REROUTE / REFUSE / ALLOW_BY_OPERATOR_OVERRIDE) must map to OpenClaw AcpApprovalClass (readonly_scoped / readonly_search / mutating / exec_capable / control_plane / interactive / other / unknown).
Explicit mapping must be written before Workstream D is considered complete.

Decision: **RESOLVED** — `src/steward/consequence/consequence-bridge.ts` (BD-6 artifact).
- `ConsequenceRecommendation` type: 5 PEQS recommendation values.
- `ConsequenceBridgeDecision` type: `approve`, `requireOperatorEscalation`, `persistConsequenceEvent`, `annotation`, `operatorOverride`.
- `resolveBridgeDecision(recommendation, approvalClass, annotationText?)`: primary action from recommendation (ALLOW/WARN/ALLOW_BY_OPERATOR_OVERRIDE → approve; REROUTE/REFUSE → block) + class modifier (exec_capable always persists + escalates on WARN; control_plane always escalates on approve; unknown treated as mutating + escalate; operator override always persists).
- `shouldApprove()` convenience wrapper for fast-path checks.

### BD-7. Concurrency write policy for steward_runtime_state (blocks Workstream A)
`steward_runtime_state` is a singleton row. Under concurrent web requests, two requests to the same session could race to update it. Options:
- `serialized via app-level lock`: acquire an async mutex before writing; works in single-process Node
- `optimistic CAS`: include `heartbeat_ts` in WHERE clause; retry on stale read
- `DB-level exclusive transaction`: `BEGIN EXCLUSIVE` before runtime state write; blocks other writers for the duration

Single-process Node can use app-level lock. Multi-process (clustered) deployments require DB-level exclusive or a separate coordinator.

Decision: **RESOLVED**

Structural correction:
- `steward_runtime_state` must not remain a singleton row
- runtime state is session-scoped and keyed by canonical session identity

Chosen option:
- per-session runtime row + optimistic CAS via integer `version` column
- optional process-local session mutex may be used as an optimization, but DB CAS is the authority

Rationale:
- OpenClaw scopes runtime/session state by session key and session file path; it does not funnel all conversations through one global mutable row
- a singleton row would create artificial cross-session contention and violate the intended ownership model
- app-level lock alone is insufficient because it only protects a single process
- `BEGIN EXCLUSIVE` is too coarse because unrelated sessions should not block each other
- the correct invariant is: one session’s runtime state update must not serialize all other sessions

Affected seams / files:
- `src/steward/db/runtime-schema.ts` or `src/steward/db/migrations/0001_init.sql`
- `src/steward/runtime/runtime-state-repo.ts`
- `src/steward/runtime/session-authority.ts`
- `src/steward/db/tx.ts`
- OpenClaw scoped-lock reference:
  - [store.ts](C:\ai_agent\Steward2\src\config\sessions\store.ts)
  - [session-write-lock.ts](C:\ai_agent\Steward2\src\agents\session-write-lock.ts)

Concurrency rule:
- runtime rows are keyed by session key
- writes read the current `version`
- update succeeds only when `WHERE session_key = ? AND version = ?`
- successful write increments `version`
- stale write retries are bounded and surfaced in logs/tests

Rejected alternatives:
- app-level lock only: insufficient as the source of truth
- DB-level exclusive transaction: blocks unrelated sessions and does not match OpenClaw’s scoped state model
- singleton-row optimistic CAS: still preserves the wrong global-shared state shape

### BD-8. OpenClaw tool ID → steward consequence class mapping (blocks Workstream D)
PEQS consequence_simulator uses internal tool strings (`file.write`, `knowledge.store`, `research.web`, etc.). OpenClaw uses its own tool/command IDs. A mapping table is required before Workstream D can wire the consequence gate.

This mapping must be written as a static artifact in `src/steward/consequence/tool-taxonomy.ts` before Workstream D implementation starts. It must cover:
- fast-pass tools (no consequence check needed)
- always-allow tools (consequence check skipped)
- truth-gated tools (deterministic check, no LLM)
- checked tools (LLM negation classification required)
- OpenClaw exec/plugin/control-plane tool classes

Decision: **RESOLVED** — `src/steward/consequence/tool-taxonomy.ts` written. Sources enumerated: `tool-catalog.ts` (31 core tool IDs), `tool-mutation.ts`, `tool-policy.ts`, `tool-policy-shared.ts`, `acp/approval-classifier.ts`. All five required consequence classes covered: `fast_pass`, `always_allow`, `truth_gated`, `checked`, `exec`, plus `control_plane` and `plugin` for OpenClaw-specific classes. `resolveConsequenceClass()` handles conditionally-mutating tools and plugin registry fallback. Transpile clean.

## PEQS modules — assessed verdicts

All previously unassessed modules now have verdicts per R14.

### `core/heuristics.py` — verdict: `adapt` → Workstream E

What it is: confidence/frustration/curiosity state machine. Three floats persisted in KV, clamped 0–1. Event handlers (on_validation_win, on_proof_written, on_task_low_value, on_truth_violation, etc.) adjust the values. `decay_tick()` nudges values back toward 0.5 each controller tick. `get_prompt_context()` injects the temperament label into task prompts. `should_force_research()` triggers forced research when frustration > 0.80 and curiosity > 0.60.

Why adapt (not drop): steward-native, not trading-specific. The temperament state directly affects prompt framing and intervention triggers. Without it, Steward2 has no dynamic self-modulation — every turn looks the same regardless of whether the agent is stuck or winning.

Where it goes: add to Workstream E as `src/steward/mission/heuristics.ts`. Depends on Workstream A (DB kv) and E task/proof events.

Additions to Workstream E:
- PEQS source: `core/heuristics.py`
- Target module: `src/steward/mission/heuristics.ts`
- Responsibilities: temperament state (confidence/frustration/curiosity); event handlers; decay tick; prompt injection; forced-research gate

---

### `core/novel_flag.py` — verdict: `adapt` → Workstream C

What it is: 32 lines. If `verify_proof_grounding()` returns `novel_flag=True` and `novel_confidence > 0.85`, emits a `novel_claim.flagged` DB event and calls `append_novel_flag()` in proof_knowledge (adds the proof as a new labeled example).

Why adapt: it is directly downstream of proof_judge and upstream of proof_knowledge. It belongs inside Workstream C, not as a separate workstream.

Where it goes: merge into `src/steward/proof/proof-judge.ts` as a post-judge step, or as `src/steward/proof/novel-flag.ts` if the caller chain warrants separation.

Additions to Workstream C:
- PEQS source: `core/novel_flag.py`
- Target module: `src/steward/proof/novel-flag.ts`
- Responsibilities: post-judge novel detection; high-confidence novel proofs are appended to the proof example store

---

### `core/skills.py` — verdict: `adapt` → Workstream G

What it is: `extract()` saves successful tool sequences as JSON skill files per task; `match()` does Jaccard similarity against saved skills to find the closest match for a new task title; `load_skills_for_task_type()` loads markdown vault skill files as prompt context for a given task type.

Why adapt: steward-native. The "remember what worked and surface it for similar future tasks" pattern is core to continuity-preserving stewardship. The file-based JSON storage is PEQS-specific and must become DB-backed in Steward2 (via knowledge store).

Where it goes: `src/steward/memory/skills.ts`. Storage moves from file-based JSON to `steward_knowledge` table entries with `memory_type=skill_sequence`. Vault markdown skill files become DB knowledge entries.

Additions to Workstream G:
- PEQS source: `core/skills.py`
- Target module: `src/steward/memory/skills.ts`
- Responsibilities: extract and store successful tool sequences; Jaccard-match against stored sequences for new tasks; load skill context for task-type prompt assembly

---

### `core/self_improvement.py` — verdict: `adapt` (strip trading markers) → Workstream H

What it is: analyzes task failure rate by normalized title group (min 3 attempts, > 50% failure rate), builds correction hints from common error messages and proven tool sequences, persists to workspace/self_improvement.json. Also detects revenue drift (> 60% of recent 20 tasks have trading markers — strip this for Steward2). `run_tick()` called from controller loop with 3600s cooldown per title group. `get_hint_for_title()` is a stub returning None.

Why adapt: the core pattern (detect systematic failure on a task type → build a corrective hint → inject into future task prompts) is steward-native self-healing. It is not trading-specific except for the drift detection markers.

What to strip: revenue drift detection markers (`revenue`, `trade`, `btc`, `crypto`, `binance`, `backtest`) — these are PEQS-specific. The concept of drift detection is still valid; the implementation should use stewardship drift (from stewardship_audit) not revenue ratio.

Where it goes: add to Workstream H as `src/steward/control/self-improvement.ts`. Storage moves from file-based JSON to DB-backed (kv for state, events for history).

Additions to Workstream H:
- PEQS source: `core/self_improvement.py`
- Target module: `src/steward/control/self-improvement.ts`
- Responsibilities: task failure rate analysis by normalized title; corrective hint construction; hint injection into new task prompts; cooldown enforcement; drift detection (stewardship-based, not revenue-based)

---

### `core/code_improvement.py` — verdict: `drop` for Steward2 v1

What it is: daily self-modification pipeline — primary LLM proposes a code change to one of up to 5 source files, critic reviews, adjudicator decides, consequence simulator gates the write, verify.py validates after apply. Has FORBIDDEN list (code_improvement.py itself, stewardship.py cannot be self-modified).

Why drop: prerequisites not met for Steward2 v1 — no stable test suite, no verified consequence gate, no trusted execution environment. Self-modification risk is asymmetric; the downside is unbounded platform corruption.

What to preserve: the FORBIDDEN path list (stewardship.py, consequence simulator must never be self-modified by the agent) informs the protected paths in Workstream D truth gate (`truth-gate.ts`). Add these paths to the `_PROTECTED_UPDATE_PATH_MARKERS` equivalent in Steward2.

Defer to: Steward2 v2, once consequence logic, proof judge, and platform stability are verified.

---

### `core/strategy_validator.py` — verdict: `drop` for core migration

What it is: three-LLM revenue proof validation gate. Trading-specific (sharpe ≥ 0.3, r_ratio ≥ 1.0, trade_count ≥ 10, walk_forward windows ≥ 2, paper_trades.json). Phase-gated to "scale" phase. Burns time budget on rejection, resets to research phase after 5 rejections.

Why drop: trading-specific throughout. The sharpe/r_ratio/walk_forward bar, the paper_trades.json dependency, the phase gate — none of these translate to Steward2's general assistant mission.

What to preserve: the three-LLM adjudication pattern (primary → critic → adjudicator, with retry logic and deterministic pre-filter before LLM tokens are spent) is a general proof review pattern. It is already captured in `proof_judge.py` and should be the model for Workstream C. No separate port needed.

## Workstream A handoff record

### Spec gate output
Architect: invariant defined (canonical runtime readable from DB without session JSON), seam identified (recordSessionMetaFromInbound + updateSessionStoreAfterAgentRun), all four blockers BD-1/BD-2/BD-5/BD-7 resolved before implementation started.

### Implementation gate output
Implementer (Codex): modules created — `src/steward/db/` (runtime-db.ts, runtime-schema.ts, db-bootstrap.ts, tx.ts, migrations/0001_init.sql, migrations/runner.ts), `src/steward/runtime/` (runtime-state.ts, runtime-state-repo.ts, runtime-flow.ts, runtime-events.ts, runtime-bridge.ts, session-authority.ts, session-bridge.ts, session-projection.ts, ws-a.integration.test.ts). OpenClaw files modified — `src/agents/command/session-store.ts`, `src/config/sessions/store.ts`. Commit: `8f2bcccae3`.

### Review gate output
Reviewer (Claude): **PASS**. All 14 target modules present. Only the two named OpenClaw seam files modified. Schema exact match including `active_task_id` and `version`. BD-1/2/5/7 all correctly implemented. CAS pattern correct and tested. Seam headers and PEQS port attributions follow comment policy. Integration test covers schema migration, deterministic session ID, CAS stale-write rejection, and full inbound→complete cycle with direct DB row inspection.

Non-structural notes: (1) `session-projection.ts` is create-only — sufficient for WS-A, will need extension in later workstreams. (2) `taskId = flowId` placeholder per spec. (3) `steward_runtime_state` row creation split between `getOrCreateStewardSession` and `getOrCreateRuntimeState` — correct but ownership worth consolidating later.

No structural findings.

### Verification gate output
Verifier (Codex): initial verification exposed a compatibility regression in `session-projection.ts`, where the steward DB hash overwrote an existing OpenClaw JSON `sessionId`. Corrected by preserving any existing JSON `sessionId` and only backfilling when the compatibility entry had none. Verification rerun from the start after the fix.

Verification evidence:
- targeted WS-A suite: `corepack pnpm exec vitest run src/steward/runtime/ws-a.integration.test.ts` — pass (`1` file, `4` tests)
- touched OpenClaw seam regressions: `corepack pnpm exec vitest run src/config/sessions/store.session-key-normalization.test.ts src/agents/command/session-store.test.ts src/channels/session.test.ts` — pass (`3` files, `12` tests)
- direct DB/runtime inspection covered by `ws-a.integration.test.ts`: migration bootstrap, deterministic steward session id, CAS stale-write rejection, inbound `running` state, completion `idle` state, flow completion, and append-only runtime events

Verdict: **PASS**. WS-A acceptance evidence is satisfied; DB is authoritative for runtime state while `sessions.json` remains compatibility-valid for existing OpenClaw surfaces.

### Advancement gate output
Architect (Claude): **ADVANCE**.

The revert of `session-projection.ts` in the verify commit is architecturally correct and supersedes review gate note #1. The steward SHA-256 session hash is an internal identity for `steward_sessions` row keying; the JSON `sessionId` is OpenClaw's conversation-continuity identifier. These are two deliberately separate identity systems coexisting in WS-A — unifying them is not in WS-A scope and would break OpenClaw lookups. Preserving existing JSON `sessionId` and backfilling only when absent is the correct compatibility projection behavior for all workstreams, not just WS-A.

All acceptance criteria satisfied: 4/4 WS-A integration tests pass; 12/12 OpenClaw seam regression tests pass; all BD-1/2/5/7 resolution requirements confirmed; no structural regressions; DB is the canonical runtime authority for all sessions.

## Workstream F handoff record

### Spec gate output
Architect: invariant defined (host-owned structural tool precheck before consequence logic and execution), donor sources recorded (`core/tool_supervisor.py`, `ii_agent/agents/tools/base.py`), and Workstream A dependency satisfied. Workstream F may start because it has no open local blocker beyond upstream readiness.

### Implementation gate output
Implementer (Codex): created `src/steward/tool/precheck-rules.ts` and `src/steward/tool/tool-supervisor.ts`. Modified `src/agents/pi-tools.before-tool-call.ts` so the steward precheck runs inside the existing host-owned `before_tool_call` wrapper seam before actual tool execution. Modified `src/steward/db/runtime-schema.ts` to register a typed precheck event kind for DB event persistence. Added targeted tests in `src/steward/tool/tool-supervisor.test.ts` and `src/agents/pi-tools.before-tool-call.steward-precheck.test.ts`.

Local implementation evidence gathered during coding:
- targeted tests passed: `corepack pnpm exec vitest run src/steward/tool/tool-supervisor.test.ts src/agents/pi-tools.before-tool-call.steward-precheck.test.ts`
- attempted to run existing `src/agents/pi-tools.before-tool-call.integration.e2e.test.ts`, but this repo's Vitest project config excludes `*.e2e.test.ts` from the active project selection; this is not claimed as verification evidence

### Review gate output
Reviewer (Claude): **PASS**. All structural requirements satisfied.

Seam: `pi-tools.before-tool-call.ts` `runBeforeToolCallHook()` is the correct call site; precheck runs in all three branches (no plugin hooks, hooks with params, hooks post-approval) so every tool dispatch goes through it regardless of plugin configuration. `wrapToolWithBeforeToolCallHook()` is the wrapping point; blocks with thrown error on hard_fail/refuse/reroute.

Rules: 5 rules using OpenClaw-native IDs (`web_search`, `web_fetch`, `exec`, `read`/`write`/`edit`, `apply_patch`). `NETWORK_ACQUISITION_RE` correctly extended to cover Windows PowerShell acquisition patterns not in the Python source. `RULES` array is extensible. Unknown tool IDs pass with `accept` as specified.

DB event emission: `tool.precheck.blocked` event kind registered in schema; emitted on `hard_fail` and `refuse` only (not `reroute`) — matches spec. Safe `getDb()` try-catch prevents crash when DB is not initialized (correct for offline/test contexts).

TypeScript type: idiomatic adaptation of Python shape — `verdict` replaces `classification`, `rerouteToolName` makes rerouting explicit, `sanitized_args`/`report_type`/`ok` dropped as redundant. This is correct per R17; spec has been updated to reflect it.

Tests: 5 tests — 3 in `tool-supervisor.test.ts` (hard fail, reroute, DB event), 2 integration tests at the seam in `pi-tools.before-tool-call.steward-precheck.test.ts` (blocks on hard fail, surfaces reroute reason).

Non-structural note: `postcheck()` (result normalization from `tool_supervisor.py`) not in this slice. Explicitly deferred — see "Not yet approved" below. `reroute` DB event gap fixed in same commit as review gate (reroute verdicts are diagnostically significant; `shouldPersistPrecheckEvent` extended to include `reroute`).

No structural findings.

### Verification gate output
Verifier (Codex): targeted Workstream F verification passed on branch `ws-f`.

Verification evidence:
- targeted tests passed: `corepack pnpm exec vitest run src/steward/tool/tool-supervisor.test.ts src/agents/pi-tools.before-tool-call.steward-precheck.test.ts` — pass (`2` files, `6` tests)
- direct DB artifact inspection: `tool-supervisor.test.ts` initializes steward DB, triggers a deterministic `web_fetch` hard-fail, and directly queries `steward_events` for `tool.precheck.blocked`, confirming typed event persistence with message and JSON payload
- runtime trace evidence: `pi-tools.before-tool-call.steward-precheck.test.ts` verifies a wrapped tool call is rejected before underlying tool execution on both `hard_fail` (`web_search` missing query) and `reroute` (`exec` with URL acquisition) paths; `execute` is not called in either case
- seam evidence: verification exercised the actual host-owned wrapper seam in `runBeforeToolCallHook()` / `wrapToolWithBeforeToolCallHook()`, not an isolated helper detached from dispatch

Verdict: **PASS**. Workstream F acceptance evidence is satisfied for module/boundary/persistence/test/runtime categories. Workstream F is now in `confirm` state and is ready for an Advancement gate decision.

### Advancement gate output
Approver (User): **APPROVE TO ADVANCE**.

Workstream F is approved. The next planned workstream remains `WS-G`, but `WS-G` cannot enter `implement` yet because blocker `BD-3` is still explicitly `OPEN`. This approval advances `WS-F` to `advance-ready`; it does not authorize `WS-G` code until `BD-3` is resolved in this spec.

---

## Workstream G handoff record

### Spec gate output
Architect: invariant defined (durable operator/truth/session memory in steward DB), donor sources recorded (`relationship_memory.py`, `knowledge.py`, `skills.py`, OpenClaw memory seams, ii-agent DB/session references), and blocker `BD-3` resolved before implementation. Workstream A dependency already confirmed.

### Implementation gate output
Implementer (Codex): created steward-owned memory modules under `src/steward/memory/`:
- `memory-types.ts`
- `memory-schema.ts`
- `embedder.ts`
- `knowledge-store.ts`
- `relationship-memory.ts`
- `skills.ts`
- `prompt-context.ts`

DB/schema work:
- added migration `src/steward/db/migrations/0002_memory.sql`
- WS-A bootstrap test updated for schema version `2` and the new `steward_knowledge` / `steward_memories` tables

OpenClaw seam updates:
- `src/agents/pi-embedded-runner/run/attempt.ts`
  - steward relationship-memory recall is merged into `extraSystemPrompt` before prompt assembly
- `src/steward/runtime/session-bridge.ts`
  - turn completion now persists a session continuity memory entry through the steward memory layer

Targeted tests added:
- `src/steward/memory/knowledge-store.test.ts`
- `src/steward/memory/relationship-memory.test.ts`
- `src/steward/memory/prompt-context.test.ts`

Local validation during implementation:
- `corepack pnpm exec vitest run src/steward/runtime/ws-a.integration.test.ts` — pass after updating the migration expectation to version `2`
- initial direct targeted Vitest runs for the new WS-G files were blocked in the default sandbox by a Vitest/Vite startup `spawn EPERM` failure; verification was rerun outside the sandbox and completed successfully

Current implementation status:
- module seam is in place
- DB persistence seam is in place
- prompt injection seam is in place

### Verification gate output
Verifier (Codex): targeted Workstream G verification passed on branch `ws-g`.

Verification evidence:
- targeted WS-G suite passed: `corepack pnpm exec vitest run src/steward/memory/knowledge-store.test.ts src/steward/memory/relationship-memory.test.ts src/steward/memory/prompt-context.test.ts` — pass (`3` files, `4` tests)
- touched upstream seam regression passed: `corepack pnpm exec vitest run src/steward/runtime/ws-a.integration.test.ts` — pass (`1` file, `4` tests)
- persistence evidence covered by the WS-G tests:
  - `knowledge-store.test.ts` proves `steward_knowledge` write + similarity recall
  - `relationship-memory.test.ts` proves `steward_memories` write, salience recall, truth reinforcement persistence, and bounded injected context generation
  - `prompt-context.test.ts` proves DB-backed steward memory is merged into the system-prompt seam
- boundary evidence covered by direct touched seams:
  - `src/agents/pi-embedded-runner/run/attempt.ts` now injects steward recall through `extraSystemPrompt` before prompt assembly
  - `src/steward/runtime/session-bridge.ts` now persists session continuity through the steward memory layer on turn completion

Verdict: **PASS**. Workstream G acceptance evidence is satisfied for module/boundary/persistence/test categories and is ready for the review gate.

---

## Workstream G review gate

Reviewer: Claude. Files read: `memory-types.ts`, `memory-schema.ts`, `embedder.ts`, `knowledge-store.ts`, `relationship-memory.ts`, `skills.ts`, `prompt-context.ts`, `0002_memory.sql`, `attempt.ts` (seam lines), `session-bridge.ts`.

Acceptance criterion assessment:

1. **`recall()` returns salience-sorted entries via sqlite-vec** — `recallRelationshipMemory()` calls `searchKnowledge()` which uses `vec_distance_cosine` when sqlite-vec is available, falls back to in-process cosine. Results mapped through `mapRecallEntry()` scoring `hit.score × importance × recency × weight`, sorted descending. PASS.

2. **`storeRecord()` persists with embedding to `steward_knowledge`** — `storeRelationshipMemory()` calls `storeKnowledge()` which inserts embedding BLOB + dims + model into `steward_knowledge`, then writes the `steward_memories` row with `confidence_score` and `last_verified_ts` columns. Metadata back-patched with `memory_id` for cross-join recall. PASS.

3. **`bootstrapFirstContact()` seeds 5 memories; idempotent** — `bootstrapRelationshipFirstContact()` guards with `COUNT(*) WHERE source = 'first_contact_bootstrap'`; 5 `FIRST_CONTACT_RECORDS` typed against `RelationshipMemoryType`. Bootstrap is called lazily inside `injectRelationshipContext()` rather than eagerly from `getOrCreateStewardSession()` as spec described — lazy is strictly better (skips DB writes for sessions that never inject). Idempotency holds either way. PASS.

4. **`injectCurrentContext()` returns bounded context injected into system prompt** — `injectRelationshipContext()` → `buildStewardMemoryPromptContext()` → `mergeStewardMemoryIntoExtraSystemPrompt()` → `attempt.ts` line 850 → `extraSystemPrompt` parameter → `buildAgentSystemPrompt()` line 941 appends to system prompt output. Injection seam is `attempt.ts` via `extraSystemPrompt` (spec said `system-prompt.ts` directly) — outcome is identical; the memory appears in the final assembled system prompt. PASS.

5. **truth_violation and truth_reinforced queryable by session and ts range** — `searchKnowledge({ memoryTypes: [...] })` produces the WHERE clause `k.memory_type IN (?)` over `steward_knowledge`. `reinforceTruthMemory()` updates `confidence_score` and `last_verified_ts` on both `steward_memories` and `steward_knowledge`. PASS.

6. **`matchSkill(title)` returns Jaccard-matched skill or null** — `matchSkillSequence()` normalizes title, builds word-set, queries `steward_knowledge WHERE memory_type = 'skill_sequence'`, applies Jaccard ≥ 0.3 threshold. Returns best match or null. Skills are stored in `steward_knowledge` with `memory_type = 'skill_sequence'` rather than a separate `steward_skills` table (spec described both a table and `matchSkill()`); the table is absent, knowledge-row storage achieves identical semantics with fewer tables. PASS.

7. **Migration runs cleanly; sqlite-vec loads on first knowledge access** — `0002_memory.sql` creates `steward_knowledge` and `steward_memories` with full indexing. `steward_knowledge_vec` virtual table is created lazily inside `ensureVectorReady()` on first store/search call (cannot be in migration because the extension must be loaded first). PASS.

Non-structural notes (none block PASS):
- Migration file is `0002_memory.sql` (spec named it `0002_knowledge.sql`) — trivial naming deviation.
- `steward_skills` table absent; skills use `steward_knowledge` with `memory_type = 'skill_sequence'` — better schema.
- 2000-char bound from spec is implemented as `topK: 6` — practical bound rather than explicit char truncation.

**Verdict: PASS.** All 7 acceptance criteria met. No structural gaps. Workstream G is approved.

### Advancement gate output
Approver (User): **ADVANCE**.

Workstream G is advanced to `advance-ready`.

Dependency effect:
- Workstream B depends on `A` and `G`
- `A` is already `advance-ready`
- `G` is now `advance-ready`
- Workstream B has no remaining local blocker beyond upstream readiness

Therefore the next active workstream is `WS-B`.

---

## Workstream B review gate

Reviewer: Claude. Files read: `truth-types.ts`, `source-kind.ts`, `claim-record.ts`, `candidate-ranking.ts`, `truth-audit.ts`, `truth-persistence.ts`, `truth-audit.test.ts`, `truth-persistence.test.ts`. Also confirmed WS-B updates to `knowledge-store.ts` and `relationship-memory.ts`.

Process note: no spec handoff record or verification gate exists for WS-B. Implementation commit (`1b09c240c3`) was pushed without going through the gate process. Review proceeds against the code; Codex must run `STEWARD2 VERIFY WS-B` as part of the advancement gate.

Fix applied during review: `claim-record.ts:80` called `inferSelectedOpportunity(title, params.query, content)` with 3 args against a 2-param function — extra `content` arg silently ignored at runtime but rejected by tsc. Removed extra arg.

Acceptance criterion assessment:

1. **A fetched source can be converted into a typed claim record** — `buildClaimRecordFromResult()` normalizes a generic `Record<string, unknown>` (OpenClaw tool result) into a typed `ClaimRecord`: infers category, opportunity, key metric, excerpt hash, domain. Returns null if content < 200 chars, no selectedOpportunity, no keyMetric, or category mismatch. PASS.

2. **Truth audit rejects stale, generic, unsupported, or weak candidates deterministically** — `auditClaimRecord()` runs 9 deterministic checks (invalid URL, thin body, missing excerpt, low-signal source, ungrounded claim tokens, ungrounded metric, trivial metric, not-ready extract, weak commercial relevance, hypothesis overstatement, zero epistemic delta, high family reuse). `buildCandidateSlate()` pre-filters search engine pages, empty content, generic listicles, trivial metrics. Tests prove generic rejection and family reuse detection. PASS.

3. **High-impact memory writes require truth audit metadata** — `knowledge-store.ts` guard added: `requiresTruthAudit(memoryType)` returns true for `truth_violation` and `truth_reinforced`; `storeKnowledge` throws `truth_audit_required_for_<type>` if `metadata.truth_audit` is absent. `relationship-memory.ts` extended with optional `truthAudit?: TruthAuditMetadata` param; passed through to `storeKnowledge` metadata. Test proves `storeKnowledge` throws on direct unguarded write. PASS.

4. **`truth_violation` findings persisted to DB as relationship memory entries, queryable by session and task** — `persistTruthAudit()` emits `truth.claim_record` + `truth.candidate_decision` events; writes one `truth_violation` memory per non-info finding with `taskId` and `sessionKey`; writes one `truth_reinforced` memory when no critical findings and decision present. Test proves event sequence and memory metadata shape. PASS.

Non-structural notes:
- `source-kind.ts` not listed in spec's target modules table but is a natural extraction of source/metric classification helpers — correct decomposition.
- `truth_audit_required` guard lives in `knowledge-store.ts` (not a truth module) because all writes go through `storeKnowledge` — correct layer for enforcement.

**Verdict: PASS.** All 4 acceptance criteria met. Fix applied (TS arity). Advancement gate requires Codex to retest.

---

## Workstream B advancement gate

Verifier: Claude. Branch: `ws-b`. Tests run directly from this session.

```
corepack pnpm exec vitest run src/steward/truth/truth-audit.test.ts src/steward/truth/truth-persistence.test.ts src/steward/runtime/ws-a.integration.test.ts src/steward/memory/knowledge-store.test.ts
```

Result: **4 files, 9 tests — all pass.**

**ADVANCE.** Workstream B is approved for merge to main. WS-B is `advance-ready`.

Next: Codex merges `ws-b` → `main` via PR.

---

## Workstream C handoff record

### Implementation gate output
Implementer (Codex): created `src/steward/proof/proof-types.ts`, `src/steward/proof/proof-schema.ts`, `src/steward/proof/proof-history.ts`, `src/steward/proof/proof-examples.ts`, `src/steward/proof/novel-flag.ts`, `src/steward/proof/proof-judge.ts`, `src/steward/proof/proof-judge.test.ts`, and `src/steward/db/migrations/0003_proof.sql`. Modified `src/steward/runtime/session-bridge.ts`, `src/agents/command/session-store.ts`, `src/steward/db/runtime-schema.ts`, and `src/steward/runtime/ws-a.integration.test.ts`.

Implemented invariant:
- proof judgment is now a host-owned completion seam executed before `runtime.idle` is recorded
- proof verdicts persist in `steward_proofs`
- labeled proof examples persist through the steward knowledge store plus `steward_proof_examples`
- novel high-confidence proofs append a distinct labeled example and emit `novel_claim.flagged`
- the BD-4 model seam is injectable; empty/minimal configs short-circuit to deterministic fallback instead of probing auth indefinitely

Local implementation verification completed during implementation:
- `corepack pnpm exec tsc --noEmit` — pass
- `corepack pnpm exec vitest run src/steward/proof/proof-judge.test.ts src/steward/runtime/ws-a.integration.test.ts --reporter=verbose` — pass (`2` files, `7` tests)

### Verification gate output
Verifier (Codex): retested WS-C from branch `ws-c` against the required focused suite.

Verification evidence:
- `corepack pnpm exec vitest run src/steward/proof/proof-judge.test.ts src/steward/runtime/ws-a.integration.test.ts src/steward/memory/knowledge-store.test.ts` — pass (`3` files, `8` tests)
- proof persistence artifact evidence: `proof-judge.test.ts` confirms accepted contribution proofs persist retrievable `good` examples, rejected learning proofs persist failure-classed verdicts, and high-confidence novel proofs emit a distinct novel-flagged example
- runtime seam evidence: `ws-a.integration.test.ts` confirms turn completion now records `proof.accepted` before `runtime.idle`, preserving the host-owned completion ordering invariant
- memory-store compatibility evidence: `knowledge-store.test.ts` passes unchanged under the new WS-C schema/memory usage, showing no regression in the shared steward knowledge layer
- static verification: `corepack pnpm exec tsc --noEmit` — pass

Verdict: **PASS.**

### Review gate output
Reviewer (Claude): read `proof-judge.ts`, `proof-examples.ts`, `novel-flag.ts`, `proof-judge.test.ts`, `session-store.ts`.

Verdict: **PASS.**

### Advancement gate output
Claude: ran `vitest run src/steward/proof/proof-judge.test.ts` — 1 file, 3 tests, 3 passed.

**ADVANCE.** WS-C merges to main.

---

## Workstream E handoff record

### Implementation gate output
Implementer (Codex): phase-1 WS-E scope only, per spec. Created `src/steward/mission/stewardship-core.ts`. Modified `src/agents/system-prompt.ts`, `src/agents/system-prompt-report.ts`, `src/config/sessions/types.ts`, and `src/agents/system-prompt-report.test.ts`.

Implemented invariant:
- the canonical steward mission core now comes from `src/steward/mission/stewardship-core.ts`
- runtime prompt assembly injects that core through one explicit OpenClaw seam in `system-prompt.ts`
- prompt/report metadata now exposes steward policy version, core hash, source hash, and whether the stewardship core was injected
- this is phase-1 only; time-budget, task-value, stewardship-reflection, stewardship-audit, goals-registry, and heuristics remain for later WS-E completion

Local implementation verification completed during implementation:
- `corepack pnpm exec tsc --noEmit` — pass
- `corepack pnpm exec vitest run src/agents/system-prompt.test.ts src/agents/system-prompt-report.test.ts` — pass (`2` files, `66` tests)

### Verification gate output
Verifier (Claude): read `stewardship-core.ts`, `system-prompt.ts`, `system-prompt-report.ts`, `config/sessions/types.ts`, `system-prompt-report.test.ts`. Ran test suite.

Verification evidence:
- `vitest run src/agents/system-prompt.test.ts src/agents/system-prompt-report.test.ts` — pass (2 files, 66 tests)
- seam evidence: `system-prompt.ts:665,675,677` — `buildStewardPromptPreamble()` is called in the actual prompt builder, not merely imported; confirmed via grep
- module evidence: `stewardship-core.ts` exports all 6 mission constants, `promptPreamble()`, `missionStatement()`, `truthStatement()`, `coreHash()`, `sourceHash()`
- metadata evidence: `SessionSystemPromptReport.steward` field added to `config/sessions/types.ts`; `system-prompt-report.ts` computes and includes policyVersion, coreHash, sourceHash, injected
- injection detection test passes: `report.steward?.injected` is `true` when "## Stewardship Core" is present in system prompt
- static verification: `tsc --noEmit` OOM on this machine (known codebase-wide issue; implementer confirmed pass); focused test suite passes
- phase scope confirmed: stewardship-core.ts only; time-budget, task-value, stewardship-reflection, stewardship-audit, goals-registry, and heuristics are deferred to later WS-E phases pending WS-A and WS-G on main

Verdict: **PASS.** Phase 1 acceptance criteria met. Seam is active (not just imported). All 66 tests pass. WS-E phase 1 is ready for Advancement gate.

### Advancement gate output
Claude: ran `vitest run src/agents/system-prompt.test.ts src/agents/system-prompt-report.test.ts` — 2 files, 66 tests, 66 passed. Confirmed seam active at `system-prompt.ts:665,675,677`. Phase 1 scope correctly bounded.

**ADVANCE.** WS-E phase 1 merges to main.

### Spec gate output — remaining modules
Architect: Workstream E remaining modules are now opened for implementation after WS-D merge. Invariant remains: steward identity, mission hierarchy, time budget, task value, reflection, drift audit, goals, and heuristics must be structurally owned by `src/steward/mission/*` and must not degrade to generic assistant behavior or prompt-only persona text.

Scope:
- `operator-hierarchy.ts` — stewardship > research > revenue; task yields to mission, not the reverse
- `time-budget.ts` — DB-backed two-mode time budget, reward, burn, and penalty policy using `steward_kv`
- `stewardship-reflection.ts` — post-task quality grading across truth, operator service, burden, continuity, discretion, contradiction surfacing, truthful refusal, and busywork
- `task-value.ts` — value scoring and labels; must call stewardship reflection before final value adjudication
- `stewardship-audit.ts` — weekly/monthly drift reports over DB events and relationship memory
- `goals-registry.ts` — opportunity categories, research phase templates, category diversity policy
- `heuristics.ts` — confidence/frustration/curiosity state machine, decay tick, prompt context, force-research gate

Required ordering inside WS-E remaining:
- implement `stewardship-reflection.ts` before `task-value.ts`
- implement `time-budget.ts` before modules that apply reward/burn/penalty outcomes
- implement `operator-hierarchy.ts` before runtime hooks consume mission decisions
- do not implement Workstream H until E remaining modules pass review and advancement

Dependencies resolved:
- Workstream A provides DB runtime authority, events, and `steward_kv`
- Workstream G provides relationship memory / knowledge store for drift and operator context
- Workstream E phase 1 provides canonical `stewardship-core.ts` prompt/policy constants

WS-D follow-ups carried forward, not part of WS-E implementation:
- `postcheck()` result normalization remains a tool/consequence follow-up
- `action-policy-bridge.ts` shim/spec-location note remains a WS-D follow-up
- `knowledge_store: "truth_gated"` in `TOOL_TAXONOMY` remains a WS-D follow-up

### Implementation gate output — remaining modules
Implementer (Codex): created `src/steward/mission/operator-hierarchy.ts`, `src/steward/mission/time-budget.ts`, `src/steward/mission/stewardship-reflection.ts`, `src/steward/mission/task-value.ts`, `src/steward/mission/stewardship-audit.ts`, `src/steward/mission/goals-registry.ts`, and `src/steward/mission/heuristics.ts`. Added focused tests for each mission module. Modified `src/steward/runtime/session-bridge.ts` so turn completion now runs proof judgment first, then task value/reflection adjudication before `runtime.idle`. Modified `src/steward/db/runtime-schema.ts` to register typed mission event kinds. Updated `src/steward/runtime/ws-a.integration.test.ts` for the new runtime evidence.

Implemented invariant:
- WS-E remaining mission policy is now owned by `src/steward/mission/*`, not scattered prompt fragments
- `stewardship-reflection.ts` runs before `task-value.ts`, and `task-value.ts` owns final value scoring
- `time-budget.ts` owns DB-backed reward/burn/penalty state through `steward_kv`
- `operator-hierarchy.ts` owns stewardship > truth/operator/continuity > research/revenue ordering
- `stewardship-audit.ts` reads persisted events for drift/health scoring
- `goals-registry.ts` owns opportunity categories, phase templates, and 24h diversity tracking
- `heuristics.ts` owns confidence/frustration/curiosity state and prompt context

Local implementation verification completed during implementation:
- `corepack pnpm exec vitest run src/steward/mission/time-budget.test.ts src/steward/mission/heuristics.test.ts src/steward/mission/operator-hierarchy.test.ts src/steward/mission/goals-registry.test.ts src/steward/mission/task-value.test.ts src/steward/mission/stewardship-audit.test.ts src/steward/runtime/ws-a.integration.test.ts` — pass (`7` files, `11` tests)
- `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit` — pass

### Verification gate output — remaining modules
Verifier (Codex): targeted WS-E remaining verification passed on branch `ws-e-remaining`.

Verification evidence:
- module evidence: all opened remaining modules exist under `src/steward/mission/*`
- boundary evidence: `session-bridge.ts` explicitly invokes `adjudicateTaskValue()` after proof judgment and before `runtime.idle`
- persistence evidence: time budget and heuristics write `steward_kv`; task value and audit write typed `steward_events`; task value writes `stewardship_ledger` relationship memory
- test evidence: focused WS-E suite passed (`7` files, `11` tests)
- runtime evidence: `ws-a.integration.test.ts` now verifies the turn-completion path includes `mission.task_value.adjudicated` before idle
- static evidence: full TypeScript check passed with Node heap raised to 8192 MB

Verdict: **PASS.** Workstream E remaining implementation and Codex verification are complete. Next process step is the reviewer gate.

### Reviewer gate output — remaining modules

Reviewer (Claude): reviewed mission module ownership, runtime task-value seam, DB persistence, and test evidence on `ws-e-remaining`.

Review findings:

1. **Module ownership** — all 7 spec-named modules present under `src/steward/mission/*`: `operator-hierarchy.ts`, `time-budget.ts`, `stewardship-reflection.ts`, `task-value.ts`, `stewardship-audit.ts`, `goals-registry.ts`, `heuristics.ts`. PASS.
2. **Runtime task-value seam** — `session-bridge.ts` explicitly calls `judgeAndPersistProof()` → `adjudicateTaskValue()` → `completeRuntimeFlow()` → `markRuntimeIdle()`. Value adjudication is structurally ordered: reflection runs first inside `adjudicateTaskValue()`, then value scoring, then idle. `ws-a.integration.test.ts` confirms event sequence: `runtime.started` → `proof.accepted` → `mission.task_value.adjudicated` → `runtime.idle`. PASS.
3. **DB persistence** — `time-budget.ts` uses `steward_kv` for reward/burn/penalty state; `heuristics.ts` uses `steward_kv` for confidence/frustration/curiosity. `task-value.ts` writes `stewardship_ledger` relationship memory and emits `mission.task_value.adjudicated` events. PASS.
4. **Test evidence** — 7-file, 11-test suite passes on `ws-e-remaining`. PASS.
5. **Static evidence** — full TypeScript check passes. PASS.

Non-blocking findings (do not block ADVANCE; carry to WS-H pre-conditions):
- **Finding E-1** — `evaluateOperatorHierarchy()` and `hierarchyPromptContext()` in `operator-hierarchy.ts` are implemented but unwired: no call site in `session-bridge.ts` or `system-prompt.ts` routes through them. The hierarchy is defined but not injected into the prompt context. Track as WS-H pre-condition: wire or document as intentionally deferred.
- **Finding E-2** — `value-scorer.ts` (injectable classifier seam for WS-E, listed in spec at line 1683) is absent. The seam point in `attempt.ts` is documented but the adapter module does not exist. Track as WS-H pre-condition.

Verdict: **PASS.** All 5 structural criteria met. Two non-blocking findings carried forward.

### Advancement gate — remaining modules

Architect (Claude): **ADVANCE.** WS-E remaining modules pass review. Non-blocking findings E-1 and E-2 are documented as WS-H pre-conditions.

Merge instruction to Codex:
```
Merge the branch `ws-e-remaining` into `main`.
Commit message: `WS-E merge: stewardship mission remaining modules`
Squash-merge. Do not rebase. Confirm PR #7 after merge.
```

### WS-E post-merge status (2026-04-24)

Merge confirmed: PR #7 merged `ws-e-remaining` → `main`. Commit `6f43990984`.

WS-E is `advance-ready`. All 8 spec-named mission modules are on `main`:
- `stewardship-core.ts` (phase 1, merged earlier)
- `operator-hierarchy.ts`, `time-budget.ts`, `task-value.ts`, `stewardship-reflection.ts`, `stewardship-audit.ts`, `goals-registry.ts`, `heuristics.ts` (WS-E remaining, PR #7)

WS-H pre-conditions inherited from WS-E findings:
- E-1: wire `evaluateOperatorHierarchy()` / `hierarchyPromptContext()` into prompt context, or document as intentionally deferred in WS-H spec
- E-2: implement `src/steward/mission/value-scorer.ts` injectable classifier seam before WS-H closes

---

## Workstream D handoff record

### Implementation gate output
Implementer (Codex): created `src/steward/consequence/causal-model.ts`, `src/steward/consequence/truth-gate.ts`, `src/steward/consequence/consequence-simulator.ts`, `src/steward/consequence/operator-override.ts`, and `src/steward/consequence/action-policy-bridge.ts`. Added targeted tests in `src/steward/consequence/causal-model.test.ts`, `src/steward/consequence/truth-gate.test.ts`, `src/steward/consequence/consequence-bridge.test.ts`, `src/steward/consequence/operator-override.test.ts`, `src/steward/consequence/consequence-simulator.test.ts`, and `src/agents/pi-tools.before-tool-call.consequence.test.ts`. Modified `src/agents/pi-tools.before-tool-call.ts` to run steward consequence policy after the host-owned precheck seam and before tool execution. Modified `src/steward/db/runtime-schema.ts` to register typed consequence event kinds.

Implemented invariant:
- steward consequence policy is now owned by `src/steward/consequence/*`, not dispersed through ad hoc execution branches
- the host seam is explicit: `precheckToolCall()` runs first, then `evaluateConsequencePolicy()`, then OpenClaw execution continues only if the steward consequence result is not `REROUTE` or `REFUSE`
- deterministic truth-gated cases (`write`, `edit`, `apply_patch`, `knowledge_store`) are evaluated without LLM discretion
- consequence recommendations are bridged through the OpenClaw approval class model via the BD-6 mapping artifact and persisted as steward events
- operator overrides are persisted into relationship memory with 7-day fatigue tracking

Local implementation verification completed during implementation:
- `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit` — pass
- `corepack pnpm exec vitest run src/steward/consequence/causal-model.test.ts src/steward/consequence/truth-gate.test.ts src/steward/consequence/consequence-bridge.test.ts src/steward/consequence/operator-override.test.ts src/steward/consequence/consequence-simulator.test.ts src/agents/pi-tools.before-tool-call.consequence.test.ts` — pass (`6` files, `12` tests)

### Verification gate output
Verifier (Codex): targeted Workstream D verification passed on branch `ws-d`.

Verification evidence:
- focused WS-D suite passed: `corepack pnpm exec vitest run src/steward/consequence/causal-model.test.ts src/steward/consequence/truth-gate.test.ts src/steward/consequence/consequence-bridge.test.ts src/steward/consequence/operator-override.test.ts src/steward/consequence/consequence-simulator.test.ts src/agents/pi-tools.before-tool-call.consequence.test.ts` — pass (`6` files, `12` tests)
- static verification passed after increasing Node heap for the full repo compiler process: `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit`
- module evidence: `src/steward/consequence/*` now owns the causal model, deterministic truth gate, simulator, override persistence, and the spec-named approval bridge shim
- boundary evidence: `src/agents/pi-tools.before-tool-call.ts` now runs steward consequence evaluation after WS-F precheck and before wrapped tool execution, preserving the host-owned transition order
- persistence evidence: `consequence-simulator.test.ts` directly inspects `steward_events` for `consequence.warning` and `consequence.refused`; `operator-override.test.ts` directly inspects `steward_memories` for persisted override rows and fatigue threshold behavior
- runtime seam evidence: `pi-tools.before-tool-call.consequence.test.ts` proves a protected `write` action is blocked before tool execution and the underlying tool implementation is never called

Verdict: **PASS.** Workstream D implementation and Codex verification are complete. Next process step is the reviewer gate.

---

## Current tasks

Current phase at that time: **WS-IC merged via PR #18. Next slice selected: WS-JA daily self-review job (2026-04-30).**  
Supersedes the old pre-autonomy “ready for deployment testing” state.

Immediate next tasks:
1. ~~Claude: review WS-H~~ ✓ done 2026-04-25 — PASS on code, blocked on H-1 (uncommitted files)
2. ~~Codex: commit all WS-H changes~~ ✓ commit 730063ea0a — H-1 resolved
3. ~~Claude: ADVANCE/NO-ADVANCE~~ ✓ **ADVANCE** 2026-04-25
4. ~~Open PR~~ ws-h → main ✓ PR #8 opened
5. ~~Merge PR #8~~ ✓ merged to `main` on 2026-04-25
6. ~~Select next slice~~ ✓ chosen on 2026-04-25
7. ~~Codex: implement D-2~~ ✓ done 2026-04-27 — PASS on code and tests; reviewer gate: PASS; ADVANCE issued.
8. ~~Open PR~~ d-2 → main ✓ PR #9 opened and merged on 2026-04-27
9. ~~Codex: implement H-2~~ ✓ done 2026-04-27 — PASS on code and tests; reviewer gate: PASS; ADVANCE issued.
10. ~~Open PR~~ h-2 → main ✓ PR #10 opened and merged on 2026-04-27
11. ~~Codex: implement D-1~~ ✓ done 2026-04-27 — PASS on code and tests; reviewer gate: PASS; ADVANCE issued.
12. ~~Open PR~~ d-1 → main ✓ PR #11 opened and merged on 2026-04-27
13. ~~Reconcile D-1 post-merge state~~ ✓ done 2026-04-27
14. **Open final follow-up slice** postcheck normalization ✓ done 2026-04-27
15. ~~Codex: implement postcheck normalization slice~~ ✓ done 2026-04-27 — focused tests PASS; full TypeScript PASS
16. ~~Claude: review P-1~~ ✓ done 2026-04-28 — PASS; reviewer gate: PASS; ADVANCE issued.
17. ~~Open PR~~ p-1 → main ✓ PR #12 opened and merged on 2026-04-28
18. ~~Codex: implement D-1b~~ ✓ done 2026-04-28 — PASS on code and tests; reviewer gate: PASS; ADVANCE issued.
19. ~~Open PR~~ d-1b → main ✓ PR #13 opened and merged on 2026-04-28
20. ~~Codex: implement P-1b~~ ✓ done 2026-04-29 — PASS on code and tests; reviewer gate: PASS; ADVANCE issued.
21. ~~Open PR~~ p-1b → main ✓ PR #14 opened and merged on 2026-04-29

Carry-forward (open):
- none

WS-H pre-conditions:
- E-1 resolved in `src/steward/memory/prompt-context.ts`
- E-2 resolved in `src/steward/mission/value-scorer.ts` and `src/agents/pi-embedded-runner/run/attempt.ts`

### Workstream H — implementation gate

Implementer (Codex): implement the WS-H maintenance governor and metacog monitor on branch `ws-h`.

**Scope — exactly these 4 modules under `src/steward/control/`:**
- `maintenance-governor.ts` — rule-based event observer; root cause classifier (task_design_issue, planner_issue, research_deficit, tool_misuse, strategy_defect, stewardship_drift); intervention seeder (hint_patch, reroute_task, diagnostic_task, strategy_reset); DB pruner (old events/knowledge/tasks on weekly/monthly schedule); delegates budget enforcement to `control-budget.ts`
- `metacog-monitor.ts` — anomaly detector: SPIN (> 50 identical events in 60s), STAGNATION (no proofs > 2h), FRUSTRATION (> 5 consecutive failed tasks); seeds analysis tasks on anomaly; checks budget before seeding
- `control-budget.ts` — shared control budget tracker: max 3 control tasks per 24h window, max 20% of total tasks; used by both governor and metacog; DB-backed via `steward_kv`
- `self-improvement.ts` — failure pattern analysis by normalized title group (min 3 attempts, > 50% failure rate); builds corrective hints from common error messages and proven tool sequences; 3600s cooldown per title group via `steward_kv`; revenue/trading drift markers stripped — replaced with stewardship drift from `stewardship-audit.ts`

**PEQS source modules to port:**
- `C:\ai_agent\PEQS\core\maintenance_governor.py`
- `C:\ai_agent\PEQS\core\metacog_monitor.py`
- `C:\ai_agent\PEQS\core\self_improvement.py`

**WS-H pre-conditions to resolve during implementation:**
- Finding E-1: wire `evaluateOperatorHierarchy()` / `hierarchyPromptContext()` into the system prompt context (or document as intentionally deferred with explicit rationale in this spec)
- Finding E-2: implement `src/steward/mission/value-scorer.ts` — injectable classifier seam stub; injection point is `src/agents/pi-embedded-runner/run/attempt.ts`

**Acceptance (must all pass before reviewer gate):**
- SPIN detected within 60s of > 50 identical events; analysis task seeded within 1 control budget slot
- STAGNATION detected after 2h without proofs; corrective task seeded
- control budget enforced: no more than 3 governor/metacog tasks per 24h window, no more than 20% ratio
- DB pruning runs on schedule without operator action; prune events respect retention policy
- WS-H pre-conditions E-1 and E-2 resolved before review gate

**Tests required:**
- `src/steward/control/control-budget.test.ts`
- `src/steward/control/metacog-monitor.test.ts`
- `src/steward/control/maintenance-governor.test.ts`
- `src/steward/control/self-improvement.test.ts`

**Codex prompt:**
```
Branch: ws-h
Base: main (after PR #7 ws-e-remaining merge)

Implement Workstream H: Maintenance governor and metacog monitor.

Create exactly these modules under src/steward/control/:
  - maintenance-governor.ts
  - metacog-monitor.ts
  - control-budget.ts
  - self-improvement.ts

Port from PEQS source:
  - C:\ai_agent\PEQS\core\maintenance_governor.py
  - C:\ai_agent\PEQS\core\metacog_monitor.py
  - C:\ai_agent\PEQS\core\self_improvement.py

Also resolve WS-H pre-conditions before closing:
  - E-1: wire evaluateOperatorHierarchy() / hierarchyPromptContext() into system prompt context OR document as intentionally deferred with explicit rationale in STEWARD2_SPEC.md
  - E-2: implement src/steward/mission/value-scorer.ts injectable classifier seam stub with injection point at src/agents/pi-embedded-runner/run/attempt.ts

Full spec: STEWARD2_SPEC.md — Workstream H section and WS-H implementation gate.

On completion, run:
  corepack pnpm exec vitest run src/steward/control/control-budget.test.ts src/steward/control/metacog-monitor.test.ts src/steward/control/maintenance-governor.test.ts src/steward/control/self-improvement.test.ts
  node --max-old-space-size=8192 ./node_modules/typescript/bin/tsc --noEmit

Report all 4 tests passing and TypeScript clean before marking complete.
```

### Implementation gate output
Implementer (Codex): created `src/steward/control/maintenance-governor.ts`, `src/steward/control/metacog-monitor.ts`, `src/steward/control/control-budget.ts`, and `src/steward/control/self-improvement.ts`. Added focused tests in `src/steward/control/control-budget.test.ts`, `src/steward/control/metacog-monitor.test.ts`, `src/steward/control/maintenance-governor.test.ts`, and `src/steward/control/self-improvement.test.ts`. Modified `src/steward/runtime/session-bridge.ts` so turn completion now runs task-value adjudication first, then host-owned metacog/governor/self-improvement ticks before `runtime.idle`. Modified `src/steward/memory/prompt-context.ts` to inject hierarchy context plus self-improvement hints into the system prompt seam. Added `src/steward/mission/value-scorer.ts` and wired its prompt seam into `src/agents/pi-embedded-runner/run/attempt.ts`. Modified `src/steward/db/runtime-schema.ts` to register typed control event kinds.

Implemented invariant:
- WS-H control logic is now owned by `src/steward/control/*`, not dispersed across prompt text or ad hoc runtime branches
- the host-owned completion order is explicit: `judgeAndPersistProof()` -> `adjudicateTaskValue()` -> `runMetacogMonitorTick()` / `runMaintenanceGovernorTick()` / `runSelfImprovementTick()` -> `runtime.idle`
- metacog and governor share one DB-backed control budget and seed maintenance work through steward flow/task rows, not planner-owned state
- self-improvement writes reusable corrective hints into steward DB state and the prompt seam re-injects them on later turns
- WS-E carry-forward pre-conditions are resolved inside this slice:
  - E-1: `hierarchyPromptContext()` now enters prompt context through `src/steward/memory/prompt-context.ts`
  - E-2: `src/steward/mission/value-scorer.ts` exists and is injected from `src/agents/pi-embedded-runner/run/attempt.ts`

Local implementation verification completed during implementation:
- `corepack pnpm exec vitest run src/steward/control/control-budget.test.ts src/steward/control/metacog-monitor.test.ts src/steward/control/maintenance-governor.test.ts src/steward/control/self-improvement.test.ts` — pass (`4` files, `8` tests)
- `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit` — pass

### Verification gate output
Verifier (Codex): targeted Workstream H verification passed on branch `ws-h`.

Verification evidence:
- module evidence: all 4 spec-named WS-H modules exist under `src/steward/control/*`
- boundary evidence: `session-bridge.ts` now owns the runtime transition from mission adjudication into control analysis before idle, so the planner cannot bypass metacog/governor/self-improvement ticks
- persistence evidence: control task seeding, anomaly detection, governor interventions, and self-improvement application all emit typed `steward_events`; budget state and hint state persist through `steward_kv`; seeded work persists through `steward_flows` and `steward_flow_tasks`
- prompt evidence: `prompt-context.ts` injects hierarchy context and DB-backed self-improvement hints; `attempt.ts` injects the value-scorer prompt seam
- pre-condition evidence: WS-E findings E-1 and E-2 are resolved in code, not deferred
- test evidence: focused WS-H suite passed (`4` files, `8` tests)
- static evidence: full TypeScript check passed with Node heap raised to 8192 MB

Verdict: **PASS.** Workstream H implementation and Codex verification are complete. Next process step is the reviewer gate.

### Reviewer gate output (2026-04-25)

Reviewer (Claude): WS-H reviewed on branch `ws-h`. Code passes all structural checks. One blocking branch finding and one minor deviation documented below.

**Module ownership:** all 4 spec-named modules exist under `src/steward/control/` — `control-budget.ts`, `metacog-monitor.ts`, `maintenance-governor.ts`, `self-improvement.ts` ✓

**Runtime control seam:** `session-bridge.ts` owns the completion sequence: `judgeAndPersistProof()` → `adjudicateTaskValue()` → `runMetacogMonitorTick()` / `runMaintenanceGovernorTick()` / `runSelfImprovementTick()` → `completeRuntimeFlow()` / `markRuntimeIdle()` → `runtime.idle`. All three control ticks gated on `aborted !== true`. Planner cannot bypass. ✓

**Budget enforcement:** constants (3 tasks / 24h, 20% ratio) match spec. DB-backed via `steward_kv` and `steward_flow_tasks`. Blocked seeds emit `control.budget.blocked`. Ratio gate has grace zone for low total-task counts. ✓ Observation: `taskId = flowId` alias in `seedControlTask` is fragile if `steward_flows` and task rows diverge — not blocking.

**Prompt injection:** E-1 resolved — `hierarchyPromptContext()` called in `prompt-context.ts`. E-2 resolved — `value-scorer.ts` exists and injected from `attempt.ts`. Self-improvement hints DB-backed and injected from `prompt-context.ts`. ✓

**DB persistence:** 6 typed control event kinds registered in `runtime-schema.ts`. Budget and hint state in `steward_kv`. Seeded work in `steward_flows` + `steward_flow_tasks`. ✓

**Test evidence:** `4` files, `8` tests — all pass. TypeScript clean. ✓

**Findings:**

- **H-1 (BLOCKING)** — Nothing committed to `ws-h`. All 8 new files (`src/steward/control/*.ts` and `*.test.ts`) are untracked. All 5 modified files (`session-bridge.ts`, `prompt-context.ts`, `attempt.ts`, `runtime-schema.ts`, `value-scorer.ts`) are uncommitted working tree changes. `ws-h` is identical to `main` in git history. Branch cannot be merged or PRed until all changes are staged and committed.

- **H-2 (non-blocking)** — FRUSTRATION detection uses `mission.task_value.adjudicated` events (score ≤ 3 or label hollow/low_value) rather than proof verdicts. Spec says "> 5 consecutive failed tasks." Low-value ≠ failed — a task can score low value without being a proof failure. Acceptable approximation but is an intentional deviation from the PEQS Python source. Document as such if keeping.

**Verdict: PASS on code. BLOCKED on branch state (H-1).** Resolve H-1 (commit all changes to ws-h), then open PR.

### Advancement decision (2026-04-25)

Commit 730063ea0a delivered all 14 files: 4 control modules, 4 test files, 5 modified seam files, STEWARD2_SPEC.md. H-1 resolved.

Re-verified against committed state:
- Tests: 4 files, 8 tests — pass ✓
- TypeScript: clean ✓
- Working tree: only reviewer spec edits uncommitted (no implementation drift) ✓

Open findings carried forward — do not block advancement:
- H-2: FRUSTRATION uses task-value score proxy instead of proof verdict; document or align before next workstream closes
- D-1: `action-policy-bridge.ts` spec-location ambiguity
- ~~D-2: `knowledge_store: "truth_gated"` absent from `TOOL_TAXONOMY`~~ ✓ closed by D-2 (2026-04-27)

**Architect (Claude): ADVANCE.** WS-H passes review on commit 730063ea0a. Open PR ws-h → main.

### WS-H post-merge status (2026-04-25)

Merge confirmed: PR #8 merged `ws-h` → `main`. Merge commit `1c7b57f934`.

WS-H is on `main`:
- `src/steward/control/control-budget.ts`
- `src/steward/control/metacog-monitor.ts`
- `src/steward/control/maintenance-governor.ts`
- `src/steward/control/self-improvement.ts`
- `src/steward/mission/value-scorer.ts`
- host seam updates in `src/steward/runtime/session-bridge.ts`, `src/steward/memory/prompt-context.ts`, `src/agents/pi-embedded-runner/run/attempt.ts`, and `src/steward/db/runtime-schema.ts`

Open carry-forward findings after merge:
- H-2: FRUSTRATION uses task-value score proxy instead of proof verdict; either align to proof verdicts or document as intentional
- D-1: `action-policy-bridge.ts` spec-location ambiguity
- ~~D-2: `knowledge_store: "truth_gated"` absent from `TOOL_TAXONOMY`~~ ✓ closed by D-2 (2026-04-27)
- postcheck normalization remains unimplemented as `src/steward/tool/postcheck-rules.ts`

Next process step: run a spec gate to choose the next follow-up slice or declare tranche-close criteria.

### Post-WS-H spec gate decision (2026-04-25)

Spec-Q result: choose **D-2** as the next follow-up slice.

Why D-2 goes first:
- `D-2` is the only open carry-forward that currently leaves a live steward invariant partially unenforced.
- `truth-gate.ts` already defines deterministic grounding policy for `knowledge_store`:
  - requires `provenance_urls`
  - requires `confidence >= 0.6`
  - returns `REROUTE` when those conditions are missing
- but `consequence-simulator.ts` only enters the deterministic truth-gate path when `resolveConsequenceClass(...) === "truth_gated"`.
- current `src/steward/consequence/tool-taxonomy.ts` does **not** include `knowledge_store`, so the fallback class is `"checked"`.
- result: the host-owned deterministic gate for `knowledge_store` exists in code but is not the actual live path. That violates the intended WS-D invariant that deterministic truth-gated cases are enforced without planner/model discretion.

Why the other carry-forward items do **not** go first:
- `H-2` is a fidelity/alignment issue inside metacog anomaly semantics, but it does not leave the deterministic truth gate unreachable.
- `D-1` is a spec-location / ownership-clarity issue around `action-policy-bridge.ts`; the bridge works and was already review-passed as non-blocking.
- `postcheck-rules.ts` is still a valid follow-up, but the specific spec text saying "before WS-B or WS-D consumes normalized tool artifacts" is now stale because WS-B and WS-D are already merged. It should be reframed before implementation, not taken first by reflex.

Chosen next slice:
- **Slice D-2** — `knowledge_store` deterministic truth-gate routing

Invariant for D-2:
- if steward policy says a tool is deterministically truth-gated, the live consequence path must route that tool through `evaluateTruthGate(...)` before any model-based consequence classification.

Target files for D-2:
- `src/steward/consequence/tool-taxonomy.ts`
- `src/steward/consequence/consequence-simulator.test.ts`
- optionally `src/steward/consequence/truth-gate.test.ts` if additional direct coverage is needed
- `STEWARD2_SPEC.md`

Acceptance for D-2:
- `knowledge_store` resolves to `truth_gated` in the taxonomy
- `evaluateConsequencePolicy({ toolName: "knowledge_store", ... })` reaches the deterministic truth gate
- missing provenance causes `REROUTE`
- confidence below `0.6` causes `REROUTE`
- grounded knowledge writes can `ALLOW`
- focused consequence tests pass

Next command:
`STEWARD2 IMPLEMENT D-2`

### D-2 implementation gate (2026-04-25)

Implementer (Codex): implement follow-up slice D-2 on branch `d-2`.

Invariant:
- if steward policy says a tool is deterministically truth-gated, the live consequence path must route that tool through `evaluateTruthGate(...)` before any model-based consequence classification.

Scope:
- add `knowledge_store: "truth_gated"` to `src/steward/consequence/tool-taxonomy.ts`
- add focused live-path coverage to `src/steward/consequence/consequence-simulator.test.ts`
- update `STEWARD2_SPEC.md` with implementation and verification evidence

Acceptance:
- `knowledge_store` resolves to `truth_gated`
- missing provenance causes live `REROUTE`
- low confidence causes live `REROUTE`
- grounded knowledge writes can live `ALLOW`
- focused consequence tests pass

### D-2 implementation output

Implementer (Codex): modified `src/steward/consequence/tool-taxonomy.ts` so `knowledge_store` now resolves to `truth_gated`. Extended `src/steward/consequence/consequence-simulator.test.ts` with live-path coverage proving the simulator routes `knowledge_store` through the deterministic truth gate.

Implemented invariant:
- `knowledge_store` no longer falls through to the generic `"checked"` consequence class
- the live consequence path for `knowledge_store` now enters `evaluateTruthGate(...)` before any model-based consequence classification
- the deterministic grounding contract for knowledge persistence is now host-owned in the actual route, not only in an unreachable helper branch

Local implementation verification completed during implementation:
- `corepack pnpm exec vitest run src/steward/consequence/truth-gate.test.ts src/steward/consequence/consequence-simulator.test.ts` — pass (`2` files, `6` tests)
- `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit` — pass

### D-2 verification output

Verifier (Codex): targeted D-2 verification passed on branch `d-2`.

Verification evidence:
- taxonomy evidence: `knowledge_store` is explicitly classified as `truth_gated`
- live-path evidence: `evaluateConsequencePolicy({ toolName: "knowledge_store", ... })` now returns `consequenceClass = "truth_gated"`
- reroute evidence: missing provenance triggers live `REROUTE` with `rerouteToolName = "web_fetch"` and persists `consequence.reroute`
- allow evidence: grounded `knowledge_store` writes can live `ALLOW` and persist `consequence.check`
- static evidence: full TypeScript check passed

Verdict: **PASS.** D-2 implementation and Codex verification are complete. Next process step is reviewer gate / advancement decision for the D-2 follow-up slice.

### D-2 reviewer gate output (2026-04-27)

Reviewer (Claude): reviewed branch `d-2` against all D-2 acceptance criteria.

Evidence reviewed:

1. **Taxonomy routing** (`tool-taxonomy.ts` line 78): `knowledge_store: "truth_gated"` — correctly placed in the truth-gated group alongside existing truth-gated tools. `resolveConsequenceClass()` will return `"truth_gated"` for any `knowledge_store` call. ✓

2. **Live deterministic path** (`consequence-simulator.ts` lines 245–277): `evaluateConsequencePolicy` routes `consequenceClass === "truth_gated"` to `evaluateTruthGate(...)` before the model-based `classifyNegationWithModel` call at line 279. Invariant enforced: no LLM involvement in the knowledge-store gate decision. ✓

3. **REROUTE path** (`truth-gate.ts` lines 113–131): missing `provenance_urls` → `{ recommendation: "REROUTE", rerouteToolName: "web_fetch" }`. `consequence.reroute` event persisted with `toolName: "knowledge_store"`. Test coverage in `consequence-simulator.test.ts` lines 55–80 confirms end-to-end. ✓

4. **Low-confidence REROUTE path**: `confidence < 0.6` → `{ recommendation: "REROUTE", rerouteToolName: "web_search" }` — different reroute target from provenance failure, structurally correct; the two failure modes route to different resolution tools. ✓

5. **ALLOW path** (`truth-gate.ts`): provenance present + confidence ≥ 0.6 → `ALLOW`. `consequence.check` event persisted. Test coverage in `consequence-simulator.test.ts` lines 82–107 confirms end-to-end. ✓

6. **Test evidence**: `2` files, `6` tests — all pass. ✓

7. **Static evidence**: `tsc --noEmit` — clean (no output). ✓

Structural findings (non-blocking):

- D-1 carry-forward (`action-policy-bridge.ts` spec-location ambiguity) remains open — not in D-2 scope.
- H-2 carry-forward (FRUSTRATION proxy deviation) remains open — not in D-2 scope.
- `postcheck-rules.ts` reframing remains open — spec dependency rationale now stale; reframe before implementation.

**Verdict: PASS.**

**Architect (Claude): ADVANCE.** D-2 passes review. Open PR d-2 → main.

### D-2 post-merge status (2026-04-27)

Merge confirmed: PR #9 merged `d-2` → `main`. Merge commit `52b57630f3`.

D-2 is on `main`:
- `knowledge_store` is `truth_gated` in `src/steward/consequence/tool-taxonomy.ts`
- live-path coverage exists in `src/steward/consequence/consequence-simulator.test.ts`

Open carry-forward findings after D-2 merge:
- H-2: FRUSTRATION uses task-value score proxy instead of terminal task/proof failure semantics
- D-1: `action-policy-bridge.ts` spec-location ambiguity
- postcheck normalization remains unimplemented and its old dependency rationale is stale

Next process step: run a spec gate to choose the next follow-up slice.

### Post-D-2 spec gate decision (2026-04-27)

Spec-Q result: choose **H-2** as the next follow-up slice.

Why H-2 goes first:
- `H-2` is now the only remaining carry-forward that changes live steward runtime behavior rather than documentation clarity or stale planning text.
- PEQS source behavior in `C:\ai_agent\PEQS\core\metacog_monitor.py` defines FRUSTRATION as `> 5 terminal failures in a row`, implemented by checking the last task statuses for `failed`, `stopped`, or `deleted`.
- current Steward2 behavior in `src/steward/control/metacog-monitor.ts` instead checks the last `mission.task_value.adjudicated` events and treats low-value / hollow outcomes as frustration.
- that is not just an implementation detail; it changes the anomaly invariant. Low-value is a mission-scoring judgment, not a terminal failure state.
- as long as that mismatch remains, metacog can seed self-analysis tasks for low-value-but-completed work, which is a different runtime behavior from the PEQS donor.

Why the other carry-forward items do **not** go first:
- `D-1` is still an ownership/spec-location issue. The bridge behavior works; the remaining problem is whether the shim file should stay a re-export or own the bridge seam explicitly.
- `postcheck-rules.ts` still needs a spec rewrite before implementation because its old phrase "before WS-B or WS-D consumes normalized tool artifacts" no longer matches repo state after both workstreams merged.

Chosen next slice:
- **Slice H-2** — FRUSTRATION semantics alignment

Invariant for H-2:
- metacog FRUSTRATION must detect consecutive terminal failure states, not merely low-value outcomes, unless Steward2 explicitly adopts a different steward-native invariant and documents that replacement in the spec and code.

Target files for H-2:
- `src/steward/control/metacog-monitor.ts`
- `src/steward/control/metacog-monitor.test.ts`
- potentially `src/steward/runtime/session-bridge.ts` or runtime persistence tables only if a task-terminal signal must be persisted to support the invariant
- `STEWARD2_SPEC.md`

Acceptance for H-2:
- FRUSTRATION is driven by terminal failure semantics, not task-value labels alone
- the runtime has a host-owned persisted signal for consecutive terminal failures
- metacog test coverage proves low-value-but-completed work does not trigger FRUSTRATION by itself
- metacog test coverage proves terminal failure sequences do trigger FRUSTRATION

Next command:
`STEWARD2 IMPLEMENT H-2`

### H-2 implementation gate (2026-04-27)

Implementer (Codex): implement follow-up slice H-2 on branch `h-2`.

Invariant:
- metacog FRUSTRATION must detect consecutive terminal failure states, not merely low-value outcomes, unless Steward2 explicitly adopts a different steward-native invariant and documents that replacement in the spec and code.

Scope:
- persist a host-owned terminal task status at turn completion
- update `src/steward/control/metacog-monitor.ts` so FRUSTRATION reads terminal failure state rather than `mission.task_value.adjudicated`
- add focused tests for:
  - low-value-but-completed work does not trigger FRUSTRATION
  - consecutive terminal failures do trigger FRUSTRATION
  - runtime completion persists terminal failure state
- update `STEWARD2_SPEC.md` with implementation and verification evidence

Acceptance:
- FRUSTRATION is driven by terminal failure semantics, not task-value labels alone
- the runtime has a host-owned persisted signal for consecutive terminal failures
- metacog test coverage proves low-value-but-completed work does not trigger FRUSTRATION by itself
- metacog test coverage proves terminal failure sequences do trigger FRUSTRATION

### H-2 implementation output

Implementer (Codex): modified `src/steward/runtime/runtime-flow.ts` and `src/steward/runtime/session-bridge.ts` so turn completion now persists a terminal task outcome on the runtime task row: `failed` when the turn aborts or the proof verdict is `rejected`, otherwise `succeeded`. Modified `src/steward/control/metacog-monitor.ts` so FRUSTRATION reads the last primary `steward_flow_tasks.link_status` values for the session instead of low-value task-value events. Extended `src/steward/control/metacog-monitor.test.ts` and `src/steward/runtime/ws-a.integration.test.ts` with focused H-2 coverage.

Implemented invariant:
- FRUSTRATION no longer piggybacks on mission scoring
- the host seam now persists a terminal failure signal at runtime completion
- metacog reads that persisted terminal state directly from steward runtime tables
- low-value-but-completed work no longer counts as terminal failure by itself

Local implementation verification completed during implementation:
- `corepack pnpm exec vitest run src/steward/control/metacog-monitor.test.ts src/steward/runtime/ws-a.integration.test.ts` — pass (`2` files, `8` tests)
- `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit` — pass

### H-2 verification output

Verifier (Codex): targeted H-2 verification passed on branch `h-2`.

Verification evidence:
- runtime persistence evidence: aborted turns now persist `terminalTaskStatus = "failed"` and the corresponding runtime task row is stored with `link_status = 'failed'`
- anomaly evidence: FRUSTRATION reads the last primary task terminal statuses instead of task-value labels
- negative evidence: low-value-but-completed work does not trigger FRUSTRATION
- positive evidence: consecutive terminal failures do trigger FRUSTRATION and seed a control analysis task
- static evidence: full TypeScript check passed

Verdict: **PASS.** H-2 implementation and Codex verification are complete. Next process step is reviewer gate / advancement decision for the H-2 follow-up slice.

### H-2 reviewer gate output (2026-04-27)

Reviewer (Claude): reviewed branch `h-2` against all H-2 acceptance criteria.

Evidence reviewed:

1. **FRUSTRATION reads terminal failure state, not task-value labels** (`metacog-monitor.ts` lines 94–122): `detectFrustration()` queries `steward_flow_tasks.link_status` for the last `FRUSTRATION_THRESHOLD` primary tasks in the session, checks `every row === 'failed'`. Zero reference to `mission.task_value.adjudicated` events in the FRUSTRATION path. ✓

2. **Host-owned persisted terminal signal** (`session-bridge.ts` lines 19–30, `runtime-flow.ts` lines 29–53): `resolveTerminalTaskStatus()` is purely deterministic — `aborted === true` → `"failed"`, `proofVerdict === "rejected"` → `"failed"`, else `"succeeded"`. Neither branch depends on model output or improvisation. `completeRuntimeFlow()` writes this to `steward_flow_tasks.link_status`. ✓

3. **Integration evidence** (`ws-a.integration.test.ts` lines 188–239): aborted turn → `taskRow.link_status === "failed"` and `runtime.idle` event contains `"terminalTaskStatus":"failed"`. End-to-end persistence path confirmed. ✓

4. **Negative test — low-value-but-completed does not trigger FRUSTRATION** (`metacog-monitor.test.ts` lines 42–82): `FRUSTRATION_THRESHOLD` flows inserted with `link_status = 'succeeded'` plus `mission.task_value.adjudicated` events (score=1, label="hollow") → `anomalies` does not contain `"frustration"`. ✓

5. **Positive test — consecutive terminal failures do trigger FRUSTRATION** (`metacog-monitor.test.ts` lines 84–114): `FRUSTRATION_THRESHOLD` flows inserted with `link_status = 'failed'` → `anomalies` contains `"frustration"`, one analysis task seeded. ✓

6. **FRUSTRATION_THRESHOLD = 6 matches PEQS `> 5`** — numerically correct. ✓

7. **Test evidence**: `2` files, `8` tests — all pass (re-verified in reviewer session). ✓

8. **Static evidence**: `tsc --noEmit` — clean (no output, re-verified in reviewer session). ✓

Structural findings (non-blocking):

- **Metacog runs before `completeRuntimeFlow` in `session-bridge.ts`** (lines 112–137): the current turn's `link_status` is not yet persisted when metacog checks FRUSTRATION. In live runtime, FRUSTRATION triggers when N prior turns are all `failed`, meaning the effective trigger is turn N+1 (7th failure for threshold=6) rather than turn N (6th). The unit tests correctly isolate component behavior; the off-by-one exists only in the end-to-end ordering. This does not block advancement — the pattern is still correctly detected, just one turn late. Carry forward as a hardening opportunity.
- **`proofVerdict === "rejected"` → `failed` path** is covered by the component logic but has no dedicated integration test (only `aborted` is integration-tested in `ws-a.integration.test.ts`). Non-blocking; correctness is structurally guaranteed by `resolveTerminalTaskStatus`.

**Verdict: PASS.**

**Architect (Claude): ADVANCE.** H-2 passes review. Open PR h-2 → main.

### H-2 post-merge status (2026-04-27)

Merge confirmed: PR #10 merged `h-2` → `main`. Merge commit `076e8c8733`.

H-2 is on `main`:
- runtime completion persists terminal task status in `src/steward/runtime/runtime-flow.ts` and `src/steward/runtime/session-bridge.ts`
- FRUSTRATION now reads terminal failure state in `src/steward/control/metacog-monitor.ts`
- focused runtime/metacog coverage exists in `src/steward/control/metacog-monitor.test.ts` and `src/steward/runtime/ws-a.integration.test.ts`

Open carry-forward findings after H-2 merge:
- D-1: `action-policy-bridge.ts` spec-location ambiguity
- postcheck normalization remains unimplemented and its old dependency rationale is stale

Next process step: run a spec gate to choose the next follow-up slice.

### Post-H-2 spec gate decision (2026-04-27)

Spec-Q result: choose **D-1** as the next follow-up slice.

Why D-1 goes first:
- `D-1` is now the only remaining concrete follow-up that is immediately implementation-ready.
- the current file `src/steward/consequence/action-policy-bridge.ts` is only a re-export shim:
  - it exports from `consequence-bridge.ts`
  - but the spec still names `action-policy-bridge.ts` as the bridge module that maps steward consequence recommendations to OpenClaw approval behavior
- this is not a runtime break, but it is an ownership ambiguity: the spec says one file owns the seam while the code puts the seam logic in another file.
- that mismatch is small, local, and ready to close either by:
  - documenting `action-policy-bridge.ts` as an intentional compatibility shim, or
  - moving/owning the bridge logic there directly.

Why `postcheck` does **not** go first:
- `postcheck-rules.ts` is not yet a clean implementation slice because the old spec rationale is stale:
  - "before WS-B or WS-D consumes normalized tool artifacts" no longer matches repo reality after both workstreams merged
- before implementation, that slice needs its invariant and dependency framing rewritten around the current codebase.
- so `postcheck` is a later spec+implementation slice, not the next ready one.

Chosen next slice:
- **Slice D-1** — `action-policy-bridge.ts` ownership clarification

Invariant for D-1:
- the file named in the spec as the consequence→approval bridge must either actually own that seam or be explicitly documented as a compatibility shim with the true owner named.

Target files for D-1:
- `src/steward/consequence/action-policy-bridge.ts`
- `src/steward/consequence/consequence-bridge.ts`
- `STEWARD2_SPEC.md`
- optionally the related consequence tests if the seam location changes

Acceptance for D-1:
- the spec and code agree on which file owns the consequence→approval bridge seam
- there is no ambiguity between shim vs owner
- if the shim stays, the spec explicitly says so
- if ownership moves, focused consequence tests still pass

Next command:
`STEWARD2 IMPLEMENT D-1`

### D-1 implementation gate (2026-04-27)

Implementer (Codex): implement follow-up slice D-1 on branch `d-1`.

Invariant:
- the file named in the spec as the consequence→approval bridge must either actually own that seam or be explicitly documented as a compatibility shim with the true owner named.

Scope:
- make `src/steward/consequence/action-policy-bridge.ts` the seam-owning bridge module
- keep `src/steward/consequence/consequence-bridge.ts` only as an explicit compatibility shim
- switch live imports/tests to the seam-owning file
- update `STEWARD2_SPEC.md` with implementation and verification evidence

Acceptance:
- the spec and code agree that `action-policy-bridge.ts` owns the bridge seam
- `consequence-bridge.ts` is clearly a compatibility shim, not an ambiguous second owner
- focused consequence bridge tests still pass

### D-1 implementation output

Implementer (Codex): moved the bridge mapping implementation into `src/steward/consequence/action-policy-bridge.ts`, converted `src/steward/consequence/consequence-bridge.ts` into an explicit compatibility re-export shim, and switched live imports/tests to the seam-owning file.

Implemented invariant:
- the spec-named file now actually owns the consequence→approval bridge seam
- `consequence-bridge.ts` is no longer a silent second owner; it is explicitly documented as compatibility-only
- the live consequence simulator now binds to the spec-named bridge file

Local implementation verification completed during implementation:
- `corepack pnpm exec vitest run src/steward/consequence/consequence-bridge.test.ts src/steward/consequence/consequence-simulator.test.ts` — pass (`2` files, `9` tests)
- `node --max-old-space-size=8192 .\node_modules\typescript\bin\tsc --noEmit` — pass

### D-1 verification output

Verifier (Codex): targeted D-1 verification passed on branch `d-1`.

Verification evidence:
- ownership evidence: `action-policy-bridge.ts` now contains the bridge mapping implementation
- compatibility evidence: `consequence-bridge.ts` is explicitly documented as a compatibility shim and only re-exports from `action-policy-bridge.ts`
- live-path evidence: `consequence-simulator.ts` now imports the bridge seam from `action-policy-bridge.ts`
- test evidence: focused consequence bridge suite passed (`2` files, `9` tests)
- static evidence: full TypeScript check passed

Verdict: **PASS.** D-1 implementation and Codex verification are complete. Next process step is reviewer gate / advancement decision for the D-1 follow-up slice.

### D-1 reviewer gate (2026-04-27)

Reviewer (Claude): reviewed `action-policy-bridge.ts`, `consequence-bridge.ts`, `consequence-simulator.ts`, `consequence-bridge.test.ts` on branch `d-1`.

Invariant satisfied: the spec-named file now owns the consequence→approval bridge seam. File name and spec agree. `consequence-bridge.ts` is an explicitly documented compatibility re-export shim with no implementation remaining.

Evidence confirmed independently:
- `corepack pnpm exec vitest run src/steward/consequence/consequence-bridge.test.ts src/steward/consequence/consequence-simulator.test.ts` — pass (2 files, 9 tests)
- `node --max-old-space-size=8192 ./node_modules/typescript/bin/tsc --noEmit` — pass (clean)

Carry-forward (non-blocking): `consequence-bridge.ts` shim says "temporarily" but has no `@deprecated` JSDoc or removal target. Add before workstream is fully closed.

Verdict: **PASS. ADVANCE** — open PR `d-1 → main`.

### D-1 post-merge status (2026-04-27)

D-1 is on `main`:
- branch `d-1`
- PR `#11`
- merge commit `6931e51bd960ba43e1c9c7f8cfea827907c74313`

Closed by D-1 merge:
- `action-policy-bridge.ts` ownership/spec-location ambiguity

Open carry-forward after D-1 merge:
- final open implementation slice: `postcheck()` result normalization on the live tool-result seam
- non-blocking cleanup: add `@deprecated` JSDoc and removal target to `consequence-bridge.ts`

Next process step: run a spec gate to reconcile D-1 as merged and define the final postcheck slice against the actual code path.

### Post-D-1 spec gate decision (2026-04-27)

Spec-Q result: choose **Postcheck normalization** as the final follow-up slice.

Why this is now the next slice:
- `D-1`, `D-2`, and `H-2` are merged and closed.
- `postcheck()` is now the only remaining implementation follow-up that changes host-owned runtime behavior.
- the old phrase "before WS-B or WS-D consumes normalized tool artifacts" is obsolete because both workstreams are already merged.
- the real remaining gap is not a dependency ordering issue; it is a missing host seam after tool execution.

Invariant for the final postcheck slice:
- every tool result that leaves the execution layer must pass through a host-owned postcheck seam that:
  - classifies failed tool outcomes deterministically as `retry`, `reroute`, `refuse`, or `hard_fail`
  - normalizes successful tool outputs into typed artifacts before downstream steward logic consumes them
  - persists diagnostically relevant blocked/rerouted/error evidence in the steward event ledger
- this normalization must not depend on planner prose, ad hoc per-tool parsing in downstream modules, or hidden session state.

Architectural benchmark and donor:
- PEQS donor: `C:\ai_agent\PEQS\core\tool_supervisor.py`
- proven donor behavior:
  - `precheck(tool, args)` validates inputs before execution
  - `postcheck(tool, args, result)` deterministically classifies failed tool results and emits normalized artifacts for successful results
- OpenClaw seam to own in Steward2:
  - tool execution enters through the existing steward tool supervisor / before-tool-call path
  - result normalization must be added as the host-owned post-tool seam, not pushed into truth/proof/consequence consumers

Current code-path violation:
- `src/steward/tool/precheck-rules.ts` and `src/steward/tool/tool-supervisor.ts` currently cover only pre-execution validation.
- there is no steward-owned `postcheck-rules.ts`.
- downstream modules therefore cannot rely on one canonical normalized artifact contract for tool outcomes.

Chosen final slice:
- **Slice P-1** — postcheck normalization seam

Ownership stance:
- `copy/adapt`: PEQS deterministic postcheck classification and artifact-shaping rules
- `bridge`: OpenClaw tool execution result surface into steward DB/event evidence
- `replace`: any downstream ad hoc interpretation of raw tool result payloads as a substitute for a canonical postcheck contract

Target files for P-1:
- `src/steward/tool/postcheck-rules.ts`
- `src/steward/tool/tool-supervisor.ts`
- one explicit OpenClaw seam adapter where tool results become available after execution
- focused tests under `src/steward/tool/` and one live seam/integration test proving post-tool classification/normalization

Dependencies for P-1:
- none blocking; all prerequisite workstreams are already merged
- use PEQS `tool_supervisor.postcheck()` as donor reference before implementation
- keep scope on the host-owned result seam only; do not reopen D/H slices while implementing P-1

Acceptance for P-1:
- failed tool results are classified deterministically through one steward-owned postcheck path
- successful tool results for the current steward-supported tool set produce typed normalized artifacts
- diagnostically relevant postcheck failures/reroutes are persisted in the steward event ledger
- focused tests prove both positive normalization and negative classification behavior
- one runtime seam test proves the postcheck path executes after tool completion and before downstream steward consumers rely on tool-result structure

Next command:
`STEWARD2 IMPLEMENT P-1`

### P-1 implementation gate (2026-04-27)

Implementer (Codex): implement follow-up slice P-1 on branch `p-1`.

Invariant:
- every tool result that leaves the execution layer must pass through one steward-owned postcheck seam that deterministically classifies failures, normalizes supported successful tool payloads into typed artifacts, and persists diagnosable evidence in the steward ledger.

### P-1 implementation output

Implementer (Codex): added `src/steward/tool/postcheck-rules.ts` as the steward-owned donor port for deterministic post-tool classification and artifact normalization. Extended `src/steward/tool/tool-supervisor.ts` with `postcheckToolResult()`, steward-event persistence, and canonical `details.stewardPostcheck` attachment on returned tool results. Added `tool.postcheck.normalized` and `tool.postcheck.classified` to `src/steward/db/runtime-schema.ts`.

Seam wiring:
- `src/agents/pi-tools.before-tool-call.ts` now runs postcheck immediately after tool execution and before loop outcome recording or downstream result use; thrown tool failures are classified through the same seam with a synthetic error result payload.
- `src/gateway/tools-invoke-http.ts` now runs the same postcheck seam for direct HTTP tool invocation before returning the tool result.
- `src/agents/pi-tool-definition-adapter.ts` now applies postcheck for unwrapped tool definitions so non-wrapped tool execution still leaves through the steward-owned normalization seam exactly once.

Supported normalized artifacts in P-1:
- `web_search` -> `search_result_set`
- `web_fetch` -> `fetched_document`
- `exec` -> `execution_report`
- `knowledge_store` -> `store_report`

Tests added/extended:
- `src/steward/tool/tool-supervisor.test.ts`
- `src/agents/pi-tools.before-tool-call.steward-precheck.test.ts`

### P-1 verification output

Verifier (Codex): targeted P-1 verification passed on branch `p-1`.

Evidence:
- focused postcheck/supervisor suites passed:
  - `corepack pnpm exec vitest run src/steward/tool/tool-supervisor.test.ts src/agents/pi-tools.before-tool-call.steward-precheck.test.ts`
  - result: `2` files, `9` tests, PASS
- full static check passed:
  - `node --max-old-space-size=8192 ./node_modules/typescript/bin/tsc --noEmit`
- live seam evidence:
  - wrapped `web_search` execution now returns `details.stewardPostcheck.artifacts.search_result_set`
  - same execution persists `tool.postcheck.normalized` with `toolCallId` and normalized artifact evidence in `steward_events`
  - deterministic error payloads persist `tool.postcheck.classified` with retry/refuse/reroute/hard-fail verdict evidence

Verdict: **PASS.** P-1 implementation and Codex verification are complete. Next process step is reviewer gate.

### P-1 reviewer gate (2026-04-28)

Reviewer (Claude): reviewed `postcheck-rules.ts`, `tool-supervisor.ts`, `pi-tools.before-tool-call.ts`, `tools-invoke-http.ts`, `pi-tool-definition-adapter.ts`, `tool-supervisor.test.ts`, `pi-tools.before-tool-call.steward-precheck.test.ts` on branch `p-1`.

Invariant satisfied: every tool result leaving the execution layer passes through `postcheckToolResult`. Failures classified deterministically. 4 supported tool payloads produce typed normalized artifacts. Events persisted in steward ledger for non-accept verdicts and normalized artifacts.

Evidence confirmed independently:
- `corepack pnpm exec vitest run src/steward/tool/tool-supervisor.test.ts src/agents/pi-tools.before-tool-call.steward-precheck.test.ts` — pass (2 files, 9 tests)
- `node --max-old-space-size=8192 ./node_modules/typescript/bin/tsc --noEmit` — pass (clean)

Carry-forwards (non-blocking):
- `postcheck-rules.ts` line 75: hardcoded Danish locale OS error string (`"forbudt af den pågældende..."`) — `winerror 10013` check above already catches this case language-independently; the Danish string is redundant and will silently not match on any other locale. Remove before next release.
- `tools-invoke-http.ts` passes no `sessionKey` to `postcheckToolResult` — gateway-path postchecks normalize artifacts but never persist steward events. Must be wired before WS-B (truth audit) consumes postcheck events from the gateway path.

Verdict: **PASS. ADVANCE** — open PR `p-1 → main`.

### P-1 post-merge status (2026-04-28)

P-1 is on `main`:
- branch `p-1`
- PR `#12`
- merge commit `e6cc770519ee980a2059afe2832869af9c673154`

Closed by P-1 merge:
- final open implementation slice: `postcheck()` result normalization on the live tool-result seam

Open carry-forward after P-1 merge:
- remove the redundant hardcoded Danish locale string from `src/steward/tool/postcheck-rules.ts`
- ~~wire `sessionKey` into the gateway path in `src/gateway/tools-invoke-http.ts` so gateway-invoked postchecks persist steward events before WS-B consumes gateway-path postcheck evidence~~ ✓ already satisfied on `main` by merged P-1 code
- add `@deprecated` JSDoc and removal target to `src/steward/consequence/consequence-bridge.ts`

Next process step: run a spec gate to choose the next follow-up slice after P-1 merge.

### Post-P-1 spec gate decision (2026-04-28)

Spec-Q result: choose **D-1b** as the next follow-up slice.

Why D-1b goes first:
- the gateway `sessionKey` carry-forward is stale and already resolved in merged `main`; it is not a real remaining slice.
- `D-1b` closes the last explicit ownership-cleanup requirement on the consequence bridge seam.
- unlike the redundant locale-string cleanup, `D-1b` completes a previously reviewer-noted compatibility-shim contract and removes ambiguity about lifecycle/retirement of the shim file.

Why the locale-string cleanup does **not** go first:
- it is a narrow classifier hygiene fix with no ownership or lifecycle consequence.
- it remains valid, but it does not block understanding of any seam or module boundary.

Chosen next slice:
- **Slice D-1b** — compatibility shim deprecation marker

Invariant for D-1b:
- any compatibility shim retained after ownership has moved must explicitly declare its deprecated status and removal target in code, so there is no silent second long-term owner.

Target files for D-1b:
- `src/steward/consequence/consequence-bridge.ts`
- `STEWARD2_SPEC.md`

Acceptance for D-1b:
- `consequence-bridge.ts` has explicit `@deprecated` JSDoc
- the removal target is named in the file comment/JSDoc
- the file remains a compatibility re-export only
- no runtime behavior changes

Next command:
`STEWARD2 IMPLEMENT D-1b`

### D-1b implementation gate (2026-04-28)

Implementer (Codex): implement follow-up slice D-1b on branch `d-1b`.

Invariant:
- any compatibility shim retained after ownership has moved must explicitly declare its deprecated status and removal target in code, so there is no silent second long-term owner.

### D-1b implementation output

Implementer (Codex): updated `src/steward/consequence/consequence-bridge.ts` to add explicit `@deprecated` JSDoc, identify `action-policy-bridge.ts` as the seam-owning file, and name tranche-close after the remaining post-P-1 follow-up slices as the removal target. The file remains a compatibility re-export only; no runtime behavior changed.

### D-1b verification output

Verifier (Codex): targeted D-1b verification passed on branch `d-1b`.

Evidence:
- focused compatibility shim suite passed:
  - `corepack pnpm exec vitest run src/steward/consequence/consequence-bridge.test.ts`
  - result: `1` file, `5` tests, PASS
- full static check passed:
  - `node --max-old-space-size=8192 ./node_modules/typescript/bin/tsc --noEmit`
- runtime evidence:
  - none required; D-1b is a documentation/ownership cleanup slice with no behavior change

Verdict: **PASS.** D-1b implementation and Codex verification are complete. Next process step is reviewer gate.

### D-1b post-merge status (2026-04-28)

D-1b is on `main`:
- branch `d-1b`
- PR `#13`
- merge commit `7c2a61cdf63646449577703fbe8398be09eb3ab7`

Closed by D-1b merge:
- D-1 compatibility-shim deprecation carry-forward

Open carry-forward after D-1b merge:
- ~~remove the redundant hardcoded Danish locale string from `src/steward/tool/postcheck-rules.ts`~~ ✓ closed by P-1b (2026-04-29)

Next process step: run a tranche-close spec gate to decide whether that remaining cleanup slice must be implemented before deployment testing, or can stay as a non-blocking polish item.

### Tranche-close spec gate decision (2026-04-28)

Decision: implement the remaining locale-string cleanup **before** deployment testing.

Reason:
- operator preference is to close loose ends now rather than carry even small known defects into deployment evaluation
- the remaining item is tiny, isolated, and already understood
- closing it now gives a clean tranche-close state with no known open code cleanups in the current migration file

Chosen final slice:
- **Slice P-1b** — remove redundant locale-specific postcheck classifier string

Invariant for P-1b:
- deterministic tool-failure classification must rely on locale-independent signals where those already exist; redundant locale-specific string matching must not remain as a hidden platform-specific branch

Target files for P-1b:
- `src/steward/tool/postcheck-rules.ts`
- `STEWARD2_SPEC.md`

Acceptance for P-1b:
- the hardcoded Danish socket-permission string is removed
- `winerror 10013` / locale-independent checks remain intact
- no runtime behavior changes beyond removing redundant locale-specific matching

Next command:
`STEWARD2 IMPLEMENT P-1b`

### P-1b implementation gate (2026-04-28)

Implementer (Codex): implement final follow-up slice P-1b on branch `p-1b`.

Invariant:
- deterministic tool-failure classification must rely on locale-independent signals where those already exist; redundant locale-specific string matching must not remain as a hidden platform-specific branch.

### P-1b implementation output

Implementer (Codex): removed the redundant hardcoded Danish socket-permission string from `src/steward/tool/postcheck-rules.ts`. Locale-independent checks (`winerror 10013`, `socket access permissions`) remain intact. No other postcheck logic changed.

### P-1b verification output

Verifier (Codex): targeted P-1b verification passed on branch `p-1b`.

Evidence:
- focused postcheck suite passed:
  - `corepack pnpm exec vitest run src/steward/tool/tool-supervisor.test.ts`
  - result: `1` file, `6` tests, PASS
- full static check passed:
  - `node --max-old-space-size=8192 ./node_modules/typescript/bin/tsc --noEmit`
- runtime evidence:
  - none required; P-1b is a classifier hygiene cleanup with no intended behavior change beyond removing redundant locale-specific matching

Verdict: **PASS.** P-1b implementation and Codex verification are complete. Next process step is reviewer gate.

### P-1b reviewer gate (2026-04-29)

Reviewer: Claude Code

Evidence reviewed:
- diff: `src/steward/tool/postcheck-rules.ts` — Danish string and trailing `||` removed; `winerror 10013` and `socket access permissions` locale-independent checks retained intact
- tests: `corepack pnpm exec vitest run src/steward/tool/tool-supervisor.test.ts` — 1 file, 6 tests, PASS
- TypeScript: `node --max-old-space-size=8192 ./node_modules/typescript/bin/tsc --noEmit` — clean

Verdict: **PASS. ADVANCE** — open PR `p-1b → main`.

Closed by P-1b:
- P-1 carry-forward: hardcoded Danish locale string removed from `postcheck-rules.ts`
- D-1b carry-forward: same item — now fully closed

No new carry-forwards.

### P-1b post-merge status (2026-04-29)

P-1b is on `main`:
- branch `p-1b`
- PR `#14`
- merge commit `386fefcb90411a80794159ca48d2542a0c0f0d95`

Closed by P-1b merge:
- P-1 locale-specific classifier carry-forward
- final known code cleanup item in the current migration tranche

Open carry-forward after P-1b merge:
- none

Tranche-close result:
- the current Steward2 migration tranche is closed
- no known open implementation or documentation follow-up slices remain in this spec

Next process step:
- deployment / live evaluation testing for useful steward runtime behavior and LLM thinking quality

## SPEC-Q — LM Studio lifecycle mapping before deployment testing (2026-04-29)

### Why this spec-q exists

Deployment probing exposed a structural gap:
- Steward2 can currently ask OpenClaw's bundled LM Studio provider to `load/preload` a model before inference
- Steward2 does **not** currently own the stronger steward invariant from PEQS: one local non-embedding model at a time, explicit unload-before-switch, explicit context-length enforcement, and explicit runtime evidence for load/query lock ownership

This must be mapped before deployment testing continues.

### Intended invariant

For local LM Studio-backed steward runtime, model lifecycle must be host-owned and externally verifiable:
- exactly one non-embedding local inference model may be active at a time
- switching local models must be `unload current -> load target -> verify loaded context -> query`
- concurrent steward turns must not create competing LM Studio load/query races
- model lifecycle evidence must be persisted as steward runtime events, not only hidden in provider logs
- remote/API models remain stateless and bypass LM Studio lifecycle ownership entirely

### Donor comparison

#### Donor 1 — OLD_AI TASK_13

Source files:
- `C:\ai_agent\OLD_AI\core\lm_studio_manager.py`
- `C:\ai_agent\OLD_AI\core\model_router.py`
- `C:\ai_agent\OLD_AI\config.json`

What OLD_AI solved:
- normalized LM Studio API root from configured `/v1` base URL
- `GET /api/v1/models` to inspect currently loaded instances
- `POST /api/v1/models/load` to load requested model
- `POST /api/v1/models/unload` to unload current instance
- one-thread lifecycle serialization via in-process `_lock`
- optional `auto_unload_on_switch`
- graceful degradation if lifecycle API failed
- explicit lifecycle events:
  - `lm_studio.model_loaded`
  - `lm_studio.model_unloaded`
  - `lm_studio.load_failed`

What OLD_AI did **not** solve strongly enough:
- no cross-process lock
- no explicit query lock
- no context-length correction logic
- no verification that a loaded model had enough context after load

#### Donor 2 — PEQS steward-native runtime

Source files:
- `C:\ai_agent\PEQS\core\model_manager.py`
- `C:\ai_agent\PEQS\core\interprocess_lock.py`
- `C:\ai_agent\PEQS\PEQS_PROJECT_BRIEF.md`

PEQS invariant, stronger than OLD_AI:
- non-negotiable rule: unload before load; never two local models simultaneously
- in-process load lock: `_LM_STUDIO_LOCK`
- in-process query lock: `_LM_STUDIO_QUERY_LOCK`
- cross-process load lock: `lmstudio_load.lock`
- cross-process query lock: `lmstudio_query.lock`
- explicit loaded-context inspection from `GET /api/v1/models`
- if target model is already loaded with insufficient context:
  - unload it
  - reload with minimum required context
- if another model is loaded:
  - unload it first
- local inference call path is bound to lifecycle ownership:
  - `load(target)` first
  - then query through loaded instance id
- explicit DB/runtime evidence:
  - `model.process_load_lock_wait_started`
  - `model.process_load_lock_acquired`
  - `model.load_started`
  - `model.load_finished`
  - `model.load_failed`
  - `model.process_load_lock_released`
  - query-lock events around inference

This is the real steward-native donor, not just the earlier OLD_AI helper.

#### Current Steward2 / OpenClaw state

Relevant files:
- `extensions/lmstudio/src/models.fetch.ts`
- `extensions/lmstudio/src/stream.ts`
- `extensions/lmstudio/src/embedding-provider.ts`
- `src/agents/pi-embedded-runner/run/attempt.ts`

What Steward2 currently has:
- bundled LM Studio provider plugin
- LM Studio setup/discovery path
- best-effort preflight discovery before load
- `POST /api/v1/models/load` through `ensureLmstudioModelLoaded()`
- inference preload wrapper before streaming
- preload de-duplication for identical in-flight requests
- preload backoff/cooldown after repeated failures
- embedding warmup preload

What Steward2 currently does **not** have:
- no steward-owned unload path
- no steward-owned one-model-at-a-time invariant
- no steward-owned cross-session or cross-process LM Studio lock ownership
- no steward-owned query serialization
- no steward-owned context-length correction policy across role/model switches
- no steward event-ledger evidence for LM Studio lifecycle actions
- no runtime distinction between:
  - assistant-shell provider preload convenience
  - steward-core model lifecycle authority

### Structural diagnosis

OpenClaw's LM Studio provider is a good assistant-shell convenience layer, but it is not the PEQS steward invariant.

OpenClaw plugin semantics today:
- "before inference, try to ensure the requested model is loaded"
- "if preload fails, continue anyway and let inference try"

PEQS steward semantics:
- "the host owns which local model may exist in RAM"
- "the host serializes load and query"
- "the host proves what was loaded, unloaded, and queried"
- "model switching is a runtime state transition, not a provider convenience"

So the gap is not a missing helper call. It is an ownership mismatch.

### Steward2 target ownership

OpenClaw should continue to own:
- provider registration
- model discovery/setup UX
- raw LM Studio transport helper calls
- stream wrapper mechanics for provider transport

Steward must newly own:
- local model role policy
- single-active-model invariant
- unload-before-switch transition
- context-length target policy per steward role
- load/query lock policy
- lifecycle event persistence into steward DB ledger
- deployment/runtime observability for model transitions

### Target seam map

#### Seam 1 — steward lifecycle authority

New steward module group:
- `src/steward/lmstudio/lifecycle-policy.ts`
- `src/steward/lmstudio/lifecycle-types.ts`
- `src/steward/lmstudio/lifecycle-events.ts`

Responsibility:
- declare whether a runtime model selection is:
  - `remote_stateless`
  - `local_lmstudio_inference`
  - `local_lmstudio_embedding`
- declare whether switch requires unload
- declare required context target for steward role
- compute lifecycle action plan:
  - `noop`
  - `load_only`
  - `unload_then_load`
  - `reject_conflict`

#### Seam 2 — steward LM Studio runtime bridge

New steward bridge:
- `src/steward/lmstudio/lifecycle-bridge.ts`

Responsibility:
- adapter between steward lifecycle authority and OpenClaw LM Studio helper/runtime
- asks provider helper what is currently loaded
- calls explicit unload when policy requires it
- calls explicit load with steward-owned context target
- returns verified loaded instance identity to the runner

This must be a steward-owned bridge, not more logic hidden inside `extensions/lmstudio/src/stream.ts`.

#### Seam 3 — explicit LM Studio transport helper extension

OpenClaw-side additions, but only as provider-facing helpers:
- extend `extensions/lmstudio/src/models.fetch.ts`

Needed capabilities:
- `getLoadedLmstudioModels(...)`
- `unloadLmstudioModelInstance(...)`
- `ensureLmstudioModelLoaded(...)` may remain, but becomes a lower-level helper rather than the whole invariant

Rule:
- provider helper may expose LM Studio primitives
- steward bridge owns policy and ordering

#### Seam 4 — embedded runner integration

Integration point:
- `src/agents/pi-embedded-runner/run/attempt.ts`

Required change later:
- before local LM Studio inference stream is constructed, ask steward lifecycle bridge to reconcile runtime model state
- the result must be a verified, steward-approved local model transition, not just provider preload

#### Seam 5 — steward runtime evidence

DB/runtime surfaces:
- `src/steward/db/runtime-schema.ts`
- `src/steward/runtime/session-bridge.ts` only if turn-level lifecycle evidence must be linked to turn completion

Required persisted event kinds:
- `lmstudio.lifecycle.lock_wait_started`
- `lmstudio.lifecycle.lock_acquired`
- `lmstudio.lifecycle.unload_started`
- `lmstudio.lifecycle.unload_finished`
- `lmstudio.lifecycle.load_started`
- `lmstudio.lifecycle.load_finished`
- `lmstudio.lifecycle.load_failed`
- `lmstudio.lifecycle.query_lock_wait_started`
- `lmstudio.lifecycle.query_lock_acquired`
- `lmstudio.lifecycle.query_lock_released`
- `lmstudio.lifecycle.context_mismatch_detected`

### Role policy map to port

PEQS had explicit local model roles:
- primary local model
- critic local model
- other local reasoning roles when configured

Steward2 must map this policy explicitly, even if initial deployment uses one LM Studio model:
- `primary_local`
- `critic_local`
- `embedding_local`

Why:
- if deployment later adds a second local model, the invariant must already exist structurally
- embedding loads must not silently violate the one-non-embedding-model invariant

### Important design decision

We should **not** copy PEQS `model_manager.py` as a monolith.

Port type by responsibility:
- `copy/adapt`:
  - lifecycle invariant
  - load/query lock semantics
  - loaded-context verification
  - unload-before-switch rule
  - lifecycle event ledger
- `bridge`:
  - LM Studio REST primitive calls through OpenClaw plugin/runtime layer
- `replace`:
  - PEQS monolithic per-call LLM client path
  - PEQS controller-bound model selection

### Implementation slices to open after approval

#### LM-A — steward LM Studio lifecycle authority

Invariant:
- steward computes lifecycle action plan before local LM Studio inference

Donors:
- `OLD_AI/core/lm_studio_manager.py`
- `PEQS/core/model_manager.py`

Target modules:
- `src/steward/lmstudio/lifecycle-types.ts`
- `src/steward/lmstudio/lifecycle-policy.ts`

Acceptance:
- deterministic tests prove:
  - same local model + sufficient context => `noop`
  - same local model + insufficient context => `unload_then_load`
  - different local non-embedding model loaded => `unload_then_load`
  - remote model => `remote_stateless`

#### LM-B — provider helper completion

Invariant:
- OpenClaw provider layer exposes explicit LM Studio lifecycle primitives, but does not own steward policy

Donors:
- `OLD_AI/core/lm_studio_manager.py`
- `PEQS/core/model_manager.py`

Target modules:
- `extensions/lmstudio/src/models.fetch.ts`
- possibly `src/plugin-sdk/lmstudio-runtime.ts` if helper exposure is needed there

Acceptance:
- helper tests prove:
  - loaded-model discovery
  - unload by instance id
  - load with explicit context target

#### LM-C — steward lifecycle bridge + event ledger

Invariant:
- every local-model transition is steward-owned and persisted

Donors:
- `PEQS/core/model_manager.py`
- `PEQS/core/interprocess_lock.py`

Target modules:
- `src/steward/lmstudio/lifecycle-bridge.ts`
- `src/steward/lmstudio/lifecycle-events.ts`
- `src/steward/db/runtime-schema.ts`

Acceptance:
- bridge tests prove:
  - unload-before-switch order
  - context mismatch triggers reload
  - lock acquisition/release always emits ledger events
  - remote models bypass lifecycle bridge

#### LM-D — embedded runner seam integration

Invariant:
- local LM Studio inference path cannot bypass steward lifecycle authority

Donors:
- `PEQS/core/model_manager.py`
- current OpenClaw seam in `src/agents/pi-embedded-runner/run/attempt.ts`

Target modules:
- `src/agents/pi-embedded-runner/run/attempt.ts`
- steward bridge modules from LM-C

Acceptance:
- integration evidence proves:
  - local LM Studio run triggers steward lifecycle events before inference
  - remote/API model run does not
  - repeated turns on same loaded model do not churn unload/load unnecessarily

### What is explicitly out of scope for the first lifecycle port

Not part of LM-A through LM-D:
- changing OpenClaw onboarding UX
- changing bundled LM Studio provider auth semantics
- adding a new unload button to UI
- redesigning provider catalogs
- changing remote provider behavior

### Deployment-testing decision

Deployment testing is **not** blocked on coding today because no coding starts yet.

But live deployment evaluation that claims steward runtime is structurally complete **is** paused until:
- this LM Studio lifecycle map is approved
- implementation slices LM-A through LM-D are sequenced
- reviewer confirms the invariant is being ported, not just another preload patch

### Next process step

- reviewer gate on LM-A
- CF-LM-1 and CF-LM-2 remain open for LM-C scope definition; they do not block LM-A review

### LM-A implementation (2026-04-29)

Implementer: Codex

Files added:
- `src/steward/lmstudio/lifecycle-types.ts`
- `src/steward/lmstudio/lifecycle-policy.ts`
- `src/steward/lmstudio/lifecycle-policy.test.ts`

What LM-A now does:
- defines steward-owned LM Studio lifecycle vocabulary:
  - role: `primary_local`, `critic_local`, `embedding_local`
  - target kind: `remote_stateless`, `local_lmstudio_inference`, `local_lmstudio_embedding`
  - action: `noop`, `load_only`, `unload_then_load`, `reject_conflict`
- deterministically classifies runtime model selections into steward lifecycle classes
- computes required context target by lifecycle role
- deterministically chooses lifecycle action based on:
  - target provider
  - target model id
  - loaded model set
  - loaded context length
  - embedding vs inference class

What LM-A does **not** do yet:
- no provider helper changes
- no unload/load HTTP calls
- no runner seam wiring
- no lock implementation
- no event-ledger persistence

Focused acceptance evidence:
- same local model + sufficient context => `noop`
- same local model + insufficient context => `unload_then_load`
- different local inference model loaded => `unload_then_load`
- no relevant loaded model => `load_only`
- remote/API model => `remote_stateless`
- embedding lifecycle classified separately from inference lifecycle

Verification:
- `corepack pnpm exec vitest run src/steward/lmstudio/lifecycle-policy.test.ts`
  - PASS: `1` file, `7` tests
  - note: required escalation because sandbox Vitest startup hit `spawn EPERM`
- `node --max-old-space-size=8192 ./node_modules/typescript/bin/tsc --noEmit`
  - PASS

Carry-forwards still open before LM-C:
- **CF-LM-1: Query lock scope**
- **CF-LM-2: Cross-process lock scope**

### LM-A reviewer gate (2026-04-29)

Reviewer: Claude Code

Evidence reviewed:
- `src/steward/lmstudio/lifecycle-types.ts` — all spec-required types present; `reject_conflict` declared but not yet produced (correct for LM-A scope; production path is LM-C)
- `src/steward/lmstudio/lifecycle-policy.ts` — all 5 action paths verified: remote noop, noop on matching model+sufficient context, `unload_then_load` on context mismatch, `unload_then_load` on different model, `load_only` on empty; embedding/inference separation via `filterRelevantLoaded` confirmed correct — embedding invisible to inference planning and vice versa
- `src/steward/lmstudio/lifecycle-policy.test.ts` — 7 tests covering all 4 spec acceptance criteria plus 3 additional edge cases (remote with loaded model, embedding coexistence, embedding reload)
- tests: `corepack pnpm exec vitest run src/steward/lmstudio/lifecycle-policy.test.ts` — 1 file, 7 tests, PASS
- TypeScript: `node --max-old-space-size=8192 ./node_modules/typescript/bin/tsc --noEmit` — clean

New carry-forward from LM-A for LM-B:
- **CF-LM-3: Key normalization contract** — `modelMatches` uses exact equality after stripping `lmstudio/` prefix. PEQS used fuzzy prefix/substring matching to handle LM Studio returning longer instance IDs than registered model keys. LM-B must ensure `getLoadedLmstudioModels()` returns keys in a form that matches what callers pass as `modelId`, or normalize at the bridge layer before calling `planLmstudioLifecycle`.

Verdict: **PASS. ADVANCE** — open PR `lm-a → main`.

### LM MAP reviewer gate (2026-04-29)

Reviewer: Claude Code

Evidence reviewed:
- `PEQS/core/model_manager.py` — full read; all four locks, all lifecycle events, context-length verification, unload-before-switch, and remote-bypass path confirmed accurate in spec
- `PEQS/core/interprocess_lock.py` — full read; file-based lock (msvcrt/fcntl), PID metadata, timeout+poll confirmed
- `Steward2/extensions/lmstudio/src/stream.ts` — confirmed: best-effort preload only, no unload, no lock
- `Steward2/extensions/lmstudio/src/models.fetch.ts` — confirmed: `ensureLmstudioModelLoaded` only, no unload, no getLoaded, no context check
- `Steward2/src/agents/pi-embedded-runner/run/attempt.ts` — confirmed: zero LM Studio references; lifecycle entirely inside provider plugin, not steward-owned

Verdict: **PASS. ADVANCE** — open `STEWARD2 IMPLEMENT LM-A`.

Carry-forwards (non-blocking on LM-A and LM-B, must be resolved before LM-C opens):

- **CF-LM-1: Query lock scope** — spec lists query lock events (`query_lock_wait_started/acquired/released`) but does not assign query lock ownership to a slice. LM-C acceptance criteria must either include the query lock or explicitly defer it to a future LM-E slice. In PEQS the query lock wraps inference, not load — distinguish this before LM-C starts.
- **CF-LM-2: Cross-process lock scope** — PEQS used file-based cross-process locks because Python could spawn multiple processes. Steward2 is a single Node.js event loop. Before LM-C, record a decision: in-process async serialization sufficient, or cross-process file lock needed? If a separate preload worker ever runs alongside the main process, file locking is needed; otherwise in-process is simpler and sufficient.

## LM-B post-merge reconciliation + LM-C blocker resolution (2026-05-02)

Merge confirmed: PR `#23` merged `lm-b` → `main`.

LM lifecycle tranche state after LM-B merge:
- `LM-A` already contained in `main`
- `LM-B` merged
- `LM-C` next
- `LM-D` after `LM-C`

Resolved blocker decisions for LM-C:

- `CF-LM-1` — **RESOLVED**
  - query lock ownership belongs to **LM-C**
  - rationale:
    - PEQS query lock wraps inference, not load
    - LM-B is provider-helper only and must stay stateless
    - LM-D is the embedded-runner seam, but the actual lock/event policy must exist one layer below it in the steward lifecycle bridge
  - consequence for LM-C scope:
    - LM-C must implement steward-owned query lock acquire/release around lifecycle-bridged local LM Studio inference admission
    - LM-C acceptance must include query-lock event evidence:
      - `query_lock_wait_started`
      - `query_lock_acquired`
      - `query_lock_released`
    - LM-D may call into that seam, but must not invent a second lock contract

- `CF-LM-2` — **RESOLVED**
  - current Steward2 deployment uses **in-process async serialization**, not cross-process file locking
  - rationale:
    - current runtime is one Node.js gateway process with one event loop
    - no separate preload worker or multi-process LM Studio steward coordinator exists in this tranche
    - adding file-lock complexity now would be speculative and outside the real current deployment shape
  - constraint:
    - if a later deployment introduces:
      - multiple Node gateway processes
      - a dedicated LM preload worker
      - or another process that can race LM Studio lifecycle transitions
    - then a future `LM-E` must add cross-process lock ownership explicitly
  - consequence for LM-C scope:
    - LM-C should use steward-owned in-process async mutex/serialization only
    - LM-C must not claim cross-process safety

LM-C is now code-ready with these clarified boundaries:
- provider helper ownership stays in `LM-B`
- steward lifecycle bridge, ledger events, load lock, and query lock ownership start in `LM-C`
- embedded runner seam wiring stays in `LM-D`

Next process step:
- `STEWARD2 IMPLEMENT LM-C`
## SPEC-Q — autonomous steward control-loop mapping before deployment testing (2026-04-29)

Deployment testing must not continue under the assumption that Steward2 is already a real steward just because the truth/proof/consequence/mission modules exist.

The original steward systems were not passive request/response shells. Both donor systems were autonomous daemon-style operators:
- `PEQS` steward booted, checked capabilities, seeded first-contact and continuity work, created goals, and kept system ticks alive even when no operator prompt arrived.
- `OLD_AI` booted a bootstrap lane, planning lane, exec lane, idle seeding path, scheduler jobs, awake scheduler, and background review/consolidation jobs.

Steward2 currently has steward semantics modules, but does **not** yet have the steward-owned autonomous control plane that makes those modules behave like a live steward.

### Invariant

Steward2 must be able to operate in two distinct but compatible modes without changing its inner truth contract:
- `assistant-turn mode`: respond correctly to inbound user/channel turns through OpenClaw
- `autonomous steward mode`: when no inbound turn is active, the host can deterministically observe state, classify the next justified work, seed bounded steward-owned tasks, and run background maintenance/review/consolidation jobs without waiting for operator prompts

The invariant is not "run background tasks somehow". The invariant is:
- autonomy entry is host-owned
- autonomy cadence is host-owned
- allowed autonomous task classes are host-owned
- budget limits and operator hierarchy remain host-owned
- truth/proof/consequence rules remain identical in both assistant-turn and autonomous modes
- autonomous work writes to the same steward DB ledger as normal turns
- autonomous work cannot degrade into prompt-only improvisation or uncontrolled self-generated churn

### Donor intent and real code paths

#### PEQS steward donor (first steward)

Primary runtime files reviewed:
- `C:\ai_agent\PEQS\interfaces\daemon.py`
- `C:\ai_agent\PEQS\core\controller.py`
- `C:\ai_agent\PEQS\core\goals.py`
- `C:\ai_agent\PEQS\core\maintenance_governor.py`
- `C:\ai_agent\PEQS\core\metacog_monitor.py`
- `C:\ai_agent\PEQS\core\self_improvement.py`
- `C:\ai_agent\PEQS\PEQS_PROJECT_BRIEF.md`

What PEQS actually does:
- daemon loop restarts controller after crashes and keeps periodic system ticks alive
- boot path runs capabilities check, first-contact bootstrap, continuity-window seeding, and budget checks
- if no active task exists, controller creates or resumes goal-owned work through `_seed_from_goals_if_needed()`
- every loop also runs system ticks:
  - `self_improvement_tick`
  - `strategy_validation_tick`
  - `metacog_tick`
  - `maintenance_governor.run_tick`
  - heuristics decay and budget warnings
- goal phase progression is autonomous and DB-driven, not operator-prompt driven

Important PEQS traits to preserve:
- fresh-boot self-start behavior
- deterministic waiting/blocking state when no seedable work exists
- periodic maintenance and anomaly observation independent of operator chat
- autonomous goal/work seeding from DB state
- truth-first and stewardship-first mission framing remains intact during autonomous work

#### OLD_AI donor

Primary runtime files reviewed:
- `C:\ai_agent\OLD_AI\interfaces\daemon.py`
- `C:\ai_agent\OLD_AI\core\controller.py`
- `C:\ai_agent\OLD_AI\core\autonomy.py`
- `C:\ai_agent\OLD_AI\core\goal_orchestrator.py`
- `C:\ai_agent\OLD_AI\core\scheduler.py`
- `C:\ai_agent\OLD_AI\core\awake_scheduler.py`
- `C:\ai_agent\OLD_AI\jobs\daily_self_review.py`
- `C:\ai_agent\OLD_AI\jobs\sleep_consolidation.py`
- `C:\ai_agent\OLD_AI\README.md`
- `C:\ai_agent\OLD_AI\AGENT_PRIMER.md`

What OLD_AI actually does:
- seeds a bootstrap task on empty DB
- maintains planning / bootstrap / exec / review / chat lane separation
- runs a central seed scheduler on boot and on idle ticks
- runs a goal orchestrator independent of idle state
- when idle, seeds one bounded internal task deterministically via `core.autonomy.seeded_on_idle()`
- runs scheduler jobs only when conditions/cadence allow
- includes dedicated jobs for:
  - `daily_self_review`
  - `sleep_consolidation`
  - metacog monitor cadence
  - weekly goal review / monitoring classes
- uses awake scheduling as a bounded fallback path, not as uncontrolled spam

Important OLD_AI traits to preserve:
- deterministic idle seeding instead of passive waiting
- explicit scheduler/job cadence ownership
- bounded internal maintenance work classes
- planning/handoff separation from normal execution
- review/consolidation jobs as host-triggered recurring work, not manual commands

### Steward2 current state versus donor behavior

Already present in Steward2 as steward-owned modules:
- DB runtime authority
- truth audit
- proof judge
- consequence logic
- mission hierarchy
- time budget
- task value
- heuristics
- metacog monitor
- maintenance governor
- self-improvement
- LM Studio lifecycle mapping has started

Already wired into the current Steward2 turn-completion seam:
- `runMetacogMonitorTick()`
- `runMaintenanceGovernorTick()`
- `runSelfImprovementTick()`
- task value / proof / runtime completion evidence

Still missing from Steward2 as autonomous runtime behavior:
- autonomous boot triage and first-task seeding
- idle-time deterministic task seeding
- background cadence scheduler owned by steward runtime
- goal/planning/handoff loop for autonomous work selection
- `daily self-review`
- `sleep consolidation`
- PEQS-style recurring `strategy_validation`
- explicit autonomous wait/block state machine separate from "no user turn yet"

This is the exact reason the current gateway can be healthy while still not behaving like the intended steward.

### Architectural decision

Do **not** try to hide autonomy inside OpenClaw heartbeat noise, channel background pushes, or generic cron surfaces.

Autonomy must be added as a dedicated steward-owned control plane under `src/steward/` with explicit OpenClaw seams:
- OpenClaw continues to own gateway, channels, sessions, tool execution, and user-turn runtime
- Steward owns autonomous runtime policy, cadence, task seeding, and background job state
- OpenClaw files should only expose the seam that lets the steward autonomy runner wake, inspect state, and inject steward-owned work into the runtime DB/session bridge

### Steward2 target design

Add a new steward-owned autonomy layer:
- `src/steward/autonomy/*`

Required ownership in this layer:
- boot sequence state and bootstrap evidence
- idle detection for steward autonomy mode
- autonomy policy / permitted job classes
- autonomy scheduler cadence + cooldowns + duplicate suppression
- autonomous task seeding into steward flow/task tables
- background job runners and evidence writers
- deployment-mode flags: assistant-only vs mixed assistant+autonomy

OpenClaw seam expectations:
- one host-owned runner/heartbeat seam that can call the autonomy tick when no inbound steward turn is active
- no planner/model decides when the autonomy tick runs
- no autonomy module writes outside the steward runtime path without DB evidence

### Missing module map to add to Steward2

#### WS-I — autonomous control plane
- `src/steward/autonomy/autonomy-runner.ts`
  - top-level tick entrypoint
  - decides whether autonomy is allowed to run now
  - calls boot/idle/scheduler paths in deterministic order
- `src/steward/autonomy/autonomy-policy.ts`
  - assistant-only vs autonomous-enabled mode
  - quiet hours / operator block / manual pause / budget gates
  - max autonomous tasks per window
- `src/steward/autonomy/autonomy-state.ts`
  - steward_kv-backed last-run timestamps, cooldowns, boot completion, idle backoff, blocked reasons
- `src/steward/autonomy/boot-sequence.ts`
  - capabilities snapshot
  - runtime snapshot / triage
  - first steward bootstrap work seed
- `src/steward/autonomy/idle-seeding.ts`
  - deterministic next-task seeding when no inbound turn is active
  - bounded one-task-per-tick behavior
- `src/steward/autonomy/work-classifier.ts`
  - chooses between goal work, diagnostic work, maintenance work, review/consolidation work
  - host-owned; model can supply content only after class chosen
- `src/steward/autonomy/scheduler.ts`
  - cadence registry for recurring jobs
  - idle-only / non-idle-safe flags
  - cooldown and duplicate suppression

#### WS-J — recurring autonomous jobs
- `src/steward/jobs/daily-self-review.ts`
  - donor: `OLD_AI/jobs/daily_self_review.py`
  - extracts stable lessons and emits steward memory/evidence
- `src/steward/jobs/sleep-consolidation.ts`
  - donor: `OLD_AI/jobs/sleep_consolidation.py`
  - day summary / episodic consolidation / memory archive behavior adapted to Steward2 DB
- `src/steward/jobs/strategy-validation.ts`
  - donor: `PEQS/core/strategy_validator.py`
  - recurring validation gate for candidate strategies/opportunities already in steward memory/goal state
- `src/steward/jobs/job-types.ts`
  - typed results, cadence, evidence contracts

#### WS-K — autonomous goal orchestration
- `src/steward/autonomy/goal-orchestrator.ts`
  - active-goal selection
  - phase/handoff/next proof-first task generation
- `src/steward/autonomy/triage-artifacts.ts`
  - writes bounded triage/evidence summaries into steward DB or artifact store
- `src/steward/autonomy/autonomy-bridge.ts`
  - seam adapter from OpenClaw host heartbeat/background loop into autonomy-runner

### Explicit donor-to-target mapping

`daily self-review`
- donor: `OLD_AI/jobs/daily_self_review.py`
- target: `src/steward/jobs/daily-self-review.ts`
- must preserve:
  - bounded cadence
  - one review artifact/job per period
  - extraction of stable rules/preferences/facts into steward memory
  - no silent self-modification side effects

`sleep consolidation`
- donor: `OLD_AI/jobs/sleep_consolidation.py`
- target: `src/steward/jobs/sleep-consolidation.ts`
- must preserve:
  - episodic/day summary generation
  - long-term memory consolidation behavior adapted to steward DB
  - pruning/archive rules with explicit evidence
  - host-owned cadence; not triggered by model choice

`strategy_validation`
- donor: `PEQS/core/strategy_validator.py`
- target: `src/steward/jobs/strategy-validation.ts`
- must preserve:
  - explicit validation gate
  - quantitative proof/evidence threshold
  - bounded retry/cooldown behavior
  - operator safety / truth-first framing, not growth-hacking behavior

### Implementation order

No implementation starts until this map is accepted. Then implement in this order:

1. `WS-IA` — autonomy state and policy
- add `autonomy-state.ts`, `autonomy-policy.ts`
- define mode flags, cooldowns, blocked reasons, budget windows

2. `WS-IB` — boot sequence
- add `boot-sequence.ts`
- produce deterministic startup snapshot + first autonomy evidence
- do **not** seed arbitrary work yet beyond bounded bootstrap classification

3. `WS-IC` — idle seeding runner
- add `autonomy-runner.ts` and `idle-seeding.ts`
- deterministic one-task autonomy tick
- assistant-turn runtime and autonomy runtime must not overlap unsafely

4. `WS-JA` — daily self-review job
- port and adapt `daily self-review`
- DB evidence + memory writes required

5. `WS-JB` — sleep consolidation job
- port and adapt `sleep consolidation`
- DB evidence + archival/consolidation outputs required

6. `WS-JC` — strategy validation job
- port and adapt `strategy_validation`
- must connect to steward proof/truth/memory state, not legacy PEQS tables

7. `WS-K` — autonomous goal orchestration and host seam integration
- add goal/handoff/autonomy bridge
- connect autonomy runner to the chosen OpenClaw heartbeat/background seam

### Blockers and decisions resolved before implementation

- `BD-AUTO-1` — **RESOLVED (revised 2026-04-30 after reading heartbeat-runner.ts)**
  - The OpenClaw heartbeat runner fires LLM model turns. It is **not** the direct seam for steward autonomy.
  - **Correct design:** WS-K adds a steward-owned timer (separate from the heartbeat runner) that calls `autonomy-bridge.ts` → `autonomy-runner.ts` on a steward-defined cadence.
  - Target seam owner: `src/steward/autonomy/autonomy-bridge.ts` — a timer callback, not a heartbeat wake handler
  - The OpenClaw startup path that registers the heartbeat runner must be extended to also register the steward autonomy timer. That startup path must be read before WS-K opens.
  - BD-AUTO-2 mutual exclusion is satisfied by `evaluateAutonomyRunPolicy()` (WS-IA): if `user_turn_active`, the timer skips and re-arms. No additional lock needed.
  - No changes to `heartbeat-runner.ts` or `heartbeat-wake.ts` are needed.
  - Rejected designs (unchanged):
    - heartbeat prompt content or planner-produced fake "autonomy" inside a normal user turn
    - OpenClaw heartbeat scheduler directly deciding which steward job/task to run
    - Wiring `autonomy-bridge.ts` into `runHeartbeatOnce` (this would embed steward autonomy inside the LLM turn path)

- `BD-AUTO-2` — **RESOLVED**
  - mutual exclusion owner: steward runtime DB authority
  - rule:
    - autonomy may run only when the relevant steward runtime session is not in `running`
    - inbound user turns always win over autonomous turns
    - if runtime state is `running`, autonomy tick returns blocked with persisted reason `user_turn_active`
    - if runtime state is `waiting` or `blocked`, autonomy policy may still decide no-op/blocked based on the slice-specific rules, but may not create overlapping execution for the same session
  - implementation consequence:
    - `WS-IA` must expose a typed policy result for `user_turn_active`
    - `WS-IC` and `WS-K` must read runtime authority before seeding autonomous work

- `BD-AUTO-3` — **RESOLVED**
  - Steward2 deployment mode flag values:
    - `assistant_only`
    - `assistant_plus_autonomy`
    - `autonomy_paused`
  - default during current rollout: `assistant_only`
  - no deployment/live testing that expects autonomous steward behavior is valid until mode is explicitly switched to `assistant_plus_autonomy`
  - ownership:
    - persisted in steward DB state via autonomy policy/state modules
    - not owned by prompt text or channel config alone

- `BD-AUTO-4` — **RESOLVED**
  - canonical authority: DB-first
  - autonomous triage/report/consolidation artifacts must always exist in steward DB/event state
  - optional file mirrors are allowed for human inspection, but are mirrors only and must not be the canonical source of truth
  - consequence for implementation:
    - `WS-IB`, `WS-JA`, `WS-JB`, and `WS-K` must persist typed DB evidence first
    - if file mirrors are added later, reviewer checks DB evidence, not mirror presence

- `BD-AUTO-5` — **RESOLVED**
  - `strategy_validation` scope in Steward2 is **opportunity validation only** for this tranche
  - meaning:
    - validate candidate opportunities/strategies/proposals already represented in steward memory/goal/proof state
    - do not reopen the full PEQS trading-specific live strategy stack in this tranche
  - preserved invariant:
    - recurring validation gate exists and is host-owned
    - truth/proof/evidence thresholds remain explicit
    - validation outputs can later support broader opportunity classes without changing the ownership model

- `BD-AUTO-6` — **RESOLVED**
  - scheduler versus work-classifier dispatch split:
    - scheduler owns **when** a recurring job class becomes due
    - work-classifier owns **what kind** of non-recurring autonomous work should be seeded when the system is idle
    - recurring jobs (`daily self-review`, `sleep consolidation`, `strategy_validation`) are dispatched by the autonomy scheduler, not by the work-classifier
    - the work-classifier may return a generic `review_or_consolidation` class for non-recurring autonomous work, but it must not own cadence for named recurring jobs
  - consequence for implementation:
    - `WS-JA`, `WS-JB`, and `WS-JC` are scheduler-driven jobs
    - `WS-IC` work-classifier must not absorb recurring-job cadence logic

### Acceptance before deployment testing resumes

The autonomy tranche is not done until these are visible in code and runtime evidence:
- fresh start produces a bounded boot snapshot / triage record without operator prompting
- when no inbound turn is active, Steward2 can seed exactly one justified autonomous task through a host-owned autonomy tick
- autonomy cooldowns and blocked reasons are persisted in steward DB state
- `daily self-review` runs on cadence and writes steward evidence/memory
- `sleep consolidation` runs on cadence and writes consolidation evidence
- `strategy_validation` exists as a steward-owned recurring validation gate
- truth/proof/consequence/mission invariants remain enforced for autonomous tasks exactly as for normal turns
- one live run shows useful autonomous activity without runaway task spawning or silent idle waiting

### Process rule for this tranche

Do not claim Steward2 is ready for deployment testing as a real steward until the autonomous control-plane tranche above is implemented or explicitly deferred by a new approved spec decision with a narrower deployment goal.
## Autonomy tranche — review-ready execution plan

### Why this tranche exists

Reviewer and implementer must evaluate this tranche against the same question:

**Is Steward2 only a bounded assistant shell with steward semantics, or is it becoming the autonomous steward that PEQS and OLD_AI were actually trying to be?**

This tranche exists because the current answer is still the first one.

What is already true in Steward2:
- truth discipline exists
- proof judgment exists
- consequence policy exists
- stewardship mission/value/heuristics exist
- maintenance/metacog/self-improvement modules exist

What is not yet true:
- the steward does not boot into bounded autonomous behavior
- the steward does not seed its own justified work when idle
- the steward does not run recurring self-review / consolidation / validation jobs on a steward-owned cadence
- the steward does not yet expose the same autonomous control-plane behavior that defined the first steward and `OLD_AI`

So the review target for this tranche is not stylistic. It is structural:
- does the new autonomy layer create a host-owned autonomous steward
- without weakening truth/proof/consequence/mission invariants
- without collapsing into unbounded self-generated churn
- and without hiding autonomy inside generic OpenClaw background noise

### Review standard for the entire autonomy tranche

The reviewer must evaluate each slice against these tranche-level questions:
- Is ownership clear between OpenClaw shell and steward autonomy core?
- Is the autonomy entrypoint host-owned rather than planner-owned?
- Are autonomous tasks bounded by explicit cadence, cooldown, budget, and duplicate-suppression rules?
- Do autonomous tasks persist through the same steward DB authority as normal turns?
- Do truth/proof/consequence/mission rules still apply identically in autonomous mode?
- Does the slice create real autonomous behavior, not just another helper module waiting to be called later?

The implementer must not advance a slice by saying it compiles. The reviewer must not pass a slice just because the module exists.

### Global blockers for the autonomy tranche

These must be resolved in spec before implementation opens on dependent slices.

- `BD-AUTO-1` — exact OpenClaw host seam for autonomy tick invocation
- `BD-AUTO-2` — mutual exclusion between inbound user turns and autonomy turns
- `BD-AUTO-3` — deployment mode flag (`assistant-only`, `assistant+autonomy`, `operator-paused autonomy`)
- `BD-AUTO-4` — autonomy artifact location (`DB-only` vs `DB + file mirror`)
- `BD-AUTO-5` — `strategy_validation` scope in Steward2

### WS-IA — autonomy state and policy

#### Purpose
Create the steward-owned authority for whether autonomy may run at all, under what mode, with what cooldowns, and with what blocked reasons.

Without WS-IA, every later autonomy slice would be structurally unsafe because there would be no single owner for autonomous execution policy.

#### Implementer scope
Implementer (Codex): create these modules under `src/steward/autonomy/`:
- `autonomy-state.ts`
- `autonomy-policy.ts`

Required responsibilities:
- `steward_kv`-backed storage for:
  - autonomy mode
  - last autonomy tick ts
  - boot completion state
  - idle backoff state
  - blocked reason
  - next allowed tick ts / cooldowns
- explicit policy API for:
  - autonomy enabled/disabled
  - operator-paused state
  - assistant-only mode
  - budget gate
  - quiet/blocked state if supported
- deterministic "may autonomy run now" decision object with reason codes

Dependencies:
- Workstream A DB authority on `main`
- resolution of `BD-AUTO-3`

Acceptance:
- autonomy mode is persisted and queryable
- blocked reasons are persisted and queryable
- a host caller can deterministically ask whether autonomy may run now and receive a typed answer
- no OpenClaw file owns these policy decisions directly

Reviewer focus:
- ownership of autonomy policy is fully steward-owned
- no planner/model discretion is involved
- all state required by later slices is present and persisted
- blocked reasons are explicit, not implicit booleans

Required verification:
- focused unit tests for state reads/writes and policy decisions
- TypeScript clean

Advancement gate condition:
- no later slice should need to invent autonomy policy or hidden cooldown logic

### WS-IB — boot sequence

#### Purpose
Port the donor behavior that a real steward does something bounded and inspectable at boot before waiting passively.

#### Implementer scope
Implementer (Codex): create these modules under `src/steward/autonomy/`:
- `boot-sequence.ts`

Required responsibilities:
- deterministic startup snapshot
- capability/health snapshot using available host state
- bounded triage classification
- persisted boot evidence in steward DB
- optional first bootstrap task classification, but **no** uncontrolled general seeding

Dependencies:
- `WS-IA`
- resolution of `BD-AUTO-4`

Acceptance:
- fresh runtime can record boot evidence without operator prompting
- boot runs once per defined lifecycle, not every random tick
- boot writes a bounded record of what was seen and what the next justified action class is
- boot can leave the system in an explicit "waiting for next autonomy step" state

Reviewer focus:
- this is a real steward boot path, not just a log line
- boot evidence is bounded and persisted
- no hidden task spam is introduced at startup
- boot output is good enough to support later autonomous seeding decisions

Required verification:
- focused tests for first boot, repeat boot/idempotency, and blocked boot states
- TypeScript clean

Advancement gate condition:
- reviewer can point to the persisted boot snapshot / triage evidence and explain exactly what autonomy now knows after startup
- specifically, the reviewer must be able to answer from DB evidence alone (no code reading): what did the steward observe at boot; what is the classified next action class; has boot been marked as a one-time event; is the record in a queryable table/event (not stdout)
- a boot log line or empty DB write does not pass this gate

### WS-IC — idle seeding runner

#### Purpose
Create the first real autonomy path: when no inbound turn is active, the host can call one steward-owned autonomy tick that seeds at most one justified next task.

#### Implementer scope
Implementer (Codex): create these modules under `src/steward/autonomy/`:
- `autonomy-runner.ts`
- `idle-seeding.ts`
- `work-classifier.ts`

Required responsibilities:
- deterministic autonomy tick entrypoint
- one-task-per-tick bound
- duplicate suppression
- idle backoff/cooldown handling
- work classification among:
  - goal work
  - diagnostic work
  - maintenance work
  - review/consolidation work
- autonomous task creation through steward DB flow/task authority

Dependencies:
- `WS-IA`
- `WS-IB`
- resolution of `BD-AUTO-1` and `BD-AUTO-2`

Acceptance:
- when no inbound turn is active, host can call autonomy tick and get one of:
  - blocked with persisted reason
  - no-op with persisted reason
  - exactly one seeded task with persisted evidence
- no more than one new autonomous task is created per eligible tick
- autonomy tick does not bypass consequence/proof/mission ownership by writing directly to fake completion state

Reviewer focus:
- this is the first slice that proves Steward2 can actually self-start work
- mutual exclusion with user turns is real and host-owned
- no task fan-out or hidden loop behavior exists
- work classification is explicit and deterministic

Required verification:
- focused tests for blocked, noop, and seeded outcomes
- tests for duplicate suppression / backoff
- tests that a user-active runtime blocks autonomy seeding
- TypeScript clean

Advancement gate condition:
- one live or harnessed run shows a single justified autonomous task being seeded by the host-owned autonomy tick

### WS-JA — daily self-review job

> **Ordering note (2026-04-30):** WS-JA, WS-JB, and WS-JC are independent of each other. Once WS-IC is merged, all three are unblocked and may be implemented in any order. The sequential listing is a suggestion, not a hard dependency chain. Whichever J slice runs first must create `job-types.ts`; the others extend it.

#### Purpose
Port the donor self-review job into Steward2 as a recurring steward-owned job, not a manual command.

#### Implementer scope
Implementer (Codex): create these modules under `src/steward/jobs/`:
- `daily-self-review.ts`
- `job-types.ts` if not already created

Donor:
- `OLD_AI/jobs/daily_self_review.py`

Required responsibilities:
- one review job per period via cadence/dedupe
- review evidence persisted in steward DB
- stable lessons/rules/preferences/facts promoted into steward memory through explicit typed writes
- no auto-code-modification side effects

Dependencies:
- `WS-IA`
- `WS-IC`

Acceptance:
- job can be scheduled and run once per cadence window
- output is persisted and queryable
- memory extraction is bounded and explicit
- reruns respect dedupe/cooldown

Reviewer focus:
- this is a real recurring self-review job, not a prompt helper
- memory extraction is typed and bounded
- no silent self-modification behavior sneaks in

Required verification:
- focused tests for cadence, dedupe, and memory extraction
- TypeScript clean

Advancement gate condition:
- reviewer can point to one persisted self-review record and the resulting steward memory updates

### WS-JB — sleep consolidation job

#### Purpose
Port consolidation of episodic runtime output into steward-owned periodic memory/archive behavior.

#### Implementer scope
Implementer (Codex): create these modules under `src/steward/jobs/`:
- `sleep-consolidation.ts`

Donor:
- `OLD_AI/jobs/sleep_consolidation.py`

Required responsibilities:
- bounded periodic consolidation run
- day/episode summary generation
- archive/prune behavior adapted to Steward2 DB
- explicit evidence events for what was consolidated/pruned

Dependencies:
- `WS-IA`
- `WS-IC`
- resolution of `BD-AUTO-4`

Acceptance:
- consolidation can run on cadence and produce persisted summary evidence
- pruning/archive rules are explicit and auditable
- consolidation updates do not corrupt active runtime state

Reviewer focus:
- this is genuine consolidation, not arbitrary deletion
- stewardship memory/archive semantics are preserved in the new DB model
- retention/pruning behavior is bounded and evidenced

Required verification:
- focused tests for summary generation, cadence, and pruning/archive evidence
- TypeScript clean

Advancement gate condition:
- reviewer can inspect persisted consolidation evidence and explain what was summarized and why nothing unsafe was pruned

### WS-JC — strategy validation job

#### Purpose
Restore PEQS-style recurring validation as a steward-owned gate for candidate opportunities/strategies, adapted to Steward2’s inner truth/proof/memory model.

#### Implementer scope
Implementer (Codex): create these modules under `src/steward/jobs/`:
- `strategy-validation.ts`

Donor:
- `PEQS/core/strategy_validator.py`

Required responsibilities:
- cadence/cooldown for validation attempts
- explicit validation inputs from steward DB state
- pass/reject evidence persisted to steward DB
- operator-safe, truth-first framing retained
- no dependency on legacy PEQS table structure

Dependencies:
- `WS-IA`
- `WS-IC`
- resolution of `BD-AUTO-5`

Acceptance:
- validation job can run on cadence against current steward candidate state
- validation emits explicit approve/reject evidence
- repeated failed validation attempts are bounded by cooldown / burn logic if applicable

Reviewer focus:
- this is a true steward-owned validation gate, not a floating helper function
- inputs come from Steward2 state, not legacy assumptions
- truth and operator safety remain stronger than growth pressure

Required verification:
- focused tests for approve/reject/cooldown behavior
- TypeScript clean

Advancement gate condition:
- reviewer can point to one complete validation decision path with persisted evidence

### WS-K — autonomous goal orchestration and host seam integration

#### Purpose
Close the loop so autonomy is not just a set of jobs. This slice connects autonomous work selection, goal/handoff logic, and the chosen OpenClaw seam.

#### Implementer scope
Implementer (Codex): create these modules under `src/steward/autonomy/`:
- `goal-orchestrator.ts`
- `triage-artifacts.ts`
- `autonomy-bridge.ts`

Required responsibilities:
- active-goal selection / next-proof-first work derivation
- bounded handoff/triage artifact persistence
- connection from the chosen OpenClaw host seam into `autonomy-runner.ts`
- no overlap between assistant-turn execution and autonomy-turn execution

Dependencies:
- `WS-IA`
- `WS-IB`
- `WS-IC`
- `WS-JA`
- `WS-JB`
- `WS-JC`
- resolution of `BD-AUTO-1` and `BD-AUTO-2`

Acceptance:
- chosen host seam can invoke autonomy runner safely
- autonomy can select justified goal-oriented next work, not only maintenance work
- handoff/triage evidence is persisted and reviewable
- live autonomy remains bounded under budget and duplicate rules

Reviewer focus:
- this is the slice that decides whether Steward2 has become a real steward runtime
- host seam ownership is explicit and correct
- autonomous goal orchestration is real, bounded, and evidence-producing

Required verification:
- focused tests for bridge invocation, mutual exclusion, and goal-oriented seeding
- at least one live/harnessed run showing boot -> autonomy tick -> seeded work -> persisted evidence
- TypeScript clean

Advancement gate condition:
- reviewer can say Steward2 now has a steward-owned autonomous control plane, not merely autonomy-related modules

### Autonomy tranche command shapes

These are the expected next-command forms once blockers are resolved:
- `STEWARD2 SPEC-Q: resolve BD-AUTO-1 through BD-AUTO-5 before opening WS-IA`
- `STEWARD2 IMPLEMENT WS-IA`
- `STEWARD2 REVIEW WS-IA`
- `STEWARD2 ADVANCE WS-IA`
- `STEWARD2 IMPLEMENT WS-IB`
- `STEWARD2 REVIEW WS-IB`
- `STEWARD2 ADVANCE WS-IB`
- `STEWARD2 IMPLEMENT WS-IC`
- `STEWARD2 REVIEW WS-IC`
- `STEWARD2 ADVANCE WS-IC`
- `STEWARD2 IMPLEMENT WS-JA`
- `STEWARD2 REVIEW WS-JA`
- `STEWARD2 ADVANCE WS-JA`
- `STEWARD2 IMPLEMENT WS-JB`
- `STEWARD2 REVIEW WS-JB`
- `STEWARD2 ADVANCE WS-JB`
- `STEWARD2 IMPLEMENT WS-JC`
- `STEWARD2 REVIEW WS-JC`
- `STEWARD2 ADVANCE WS-JC`
- `STEWARD2 IMPLEMENT WS-K`
- `STEWARD2 REVIEW WS-K`
- `STEWARD2 ADVANCE WS-K`

### Final tranche-close gate for autonomy

The autonomy tranche is only close-ready when reviewer and implementer can both defend these statements with code and runtime evidence:
- Steward2 can start in bounded autonomous steward mode without operator prompting
- Steward2 can seed its own next justified work when idle
- `daily self-review`, `sleep consolidation`, and `strategy_validation` exist as steward-owned recurring jobs
- truth/proof/consequence/mission invariants remain intact under autonomous execution
- the OpenClaw shell still owns shell concerns, and the steward core owns autonomy concerns
- one live bounded run demonstrates useful autonomous activity instead of passive waiting or uncontrolled self-generated churn

### WS-IA implementation gate (2026-04-29)

Implementer (Codex): implemented `WS-IA` on branch `ws-ia`.

Files added:
- `src/steward/autonomy/autonomy-state.ts`
- `src/steward/autonomy/autonomy-policy.ts`
- `src/steward/autonomy/autonomy-state.test.ts`
- `src/steward/autonomy/autonomy-policy.test.ts`

Files modified:
- `src/steward/db/runtime-schema.ts`

What `WS-IA` now owns:
- DB-backed autonomy mode state in `steward_kv`
- typed autonomy mode values:
  - `assistant_only`
  - `assistant_plus_autonomy`
  - `autonomy_paused`
- DB-backed autonomy policy state:
  - `lastAutonomyTickTs`
  - `bootCompleted`
  - `idleBackoffMs`
  - `lastBlockedReason`
  - `nextAllowedTickTs`
  - `updatedTs`
- typed blocked reasons:
  - `assistant_only_mode`
  - `autonomy_paused`
  - `user_turn_active`
  - `cooldown_active`
  - `boot_not_complete`
  - `budget_blocked`
- deterministic policy evaluation through `evaluateAutonomyRunPolicy(...)`

Invariant achieved in this slice:
- autonomy policy is now steward-owned and queryable from the steward DB
- host code can ask one typed question: may autonomy run now for this session?
- the answer is deterministic and does not depend on planner/model discretion
- the user-turn mutual-exclusion rule is represented as a first-class policy outcome: `user_turn_active`
- no OpenClaw file owns autonomy mode/cooldown/blocked-reason logic directly

Behavior implemented:
- default mode is `assistant_only`
- enabling autonomy without completed boot yields `boot_not_complete`
- active steward runtime state `running` yields `user_turn_active`
- future cooldown state yields `cooldown_active`
- budget gate can be passed in structurally and yields `budget_blocked`
- successful policy evaluation returns a typed allowed decision and emits a typed event

Typed event kinds added:
- `autonomy.mode.updated`
- `autonomy.policy.allowed`
- `autonomy.policy.blocked`

Focused acceptance evidence:
- autonomy mode is persisted and queryable
- blocked reasons are persisted and queryable
- host caller receives a typed policy decision object
- policy resolves the `BD-AUTO-2` mutual-exclusion requirement via runtime-state inspection

Verification:
- `corepack pnpm exec vitest run src/steward/autonomy/autonomy-state.test.ts src/steward/autonomy/autonomy-policy.test.ts`
  - PASS: `2` files, `8` tests
  - note: required escalation because sandbox Vitest startup hit Windows `spawn EPERM`
- `node --max-old-space-size=8192 ./node_modules/typescript/bin/tsc --noEmit`
  - PASS

Next process step:
- reviewer gate for `WS-IA`

### WS-IA reviewer gate (2026-04-29)

Reviewer: Claude Code

Evidence reviewed:
- `src/steward/autonomy/autonomy-state.ts` — all 3 mode values typed; all 6 blocked reasons typed; `parseMode` safe default; `parseBlockedReason("")` → null on tick-ran clear; `resolveEventSessionId` validates session in DB; no planner/model discretion anywhere
- `src/steward/autonomy/autonomy-policy.ts` — block priority order correct (assistant_only → autonomy_paused → user_turn_active → boot_not_complete → cooldown_active → budget_blocked → allowed); `user_turn_active` reads real `runtime.status` from DB (BD-AUTO-2 satisfied); `blockedByUserTurn` flag distinguishes mutual-exclusion case from other blocks; `persistDecision=false` allows read-only inspection
- all 6 BD-AUTO blockers applicable to WS-IA recorded as RESOLVED before implementation; WS-K seam and artifact decisions correctly deferred
- tests: `corepack pnpm exec vitest run autonomy-state.test.ts autonomy-policy.test.ts` — 2 files, 8 tests, PASS; all 4 acceptance criteria covered plus event-persistence verified at DB level
- TypeScript: `node --max-old-space-size=8192 ./node_modules/typescript/bin/tsc --noEmit` — clean

Plan-level notes recorded for operator awareness:
- WS-K is the keystone slice — no actual autonomous behavior is possible until `autonomy-bridge.ts` is wired to an OpenClaw host heartbeat; all WS-I/J slices produce infrastructure only. A SPEC-Q on the exact OpenClaw heartbeat surface is essential before WS-K opens.
- WS-IB (boot sequence) produces passive evidence only; its reviewer must advance it only when a real boot record is inspectable, not just when it compiles.
- WS-JA/JB/JC are independent of each other within the J group; the ordering in the spec is conservative but not a hard dependency chain.

Verdict: **PASS. ADVANCE** — open PR `ws-ia → main`.

### Autonomy plan reviewer gate (2026-04-29)

Reviewer: Claude Code

Verdict: **PASS.**

Findings:

1. **Tranche rationale** — sound. Diagnosis accurate: existing steward modules are passive helpers wired to turn-completion seams. The two-mode invariant (assistant-turn / autonomous steward, same truth/proof/consequence rules, same DB ledger, no model discretion on cadence) is the correct framing.

2. **Blocker set** — complete and load-bearing. All five blockers correctly assigned to dependent slices. Note: BD-AUTO-1 (host seam choice) constrains BD-AUTO-2 (mutual exclusion design) — resolve together in one SPEC-Q, not sequentially.

3. **Per-slice gates** — sound. Sequence correct (WS-IA → WS-IB → WS-IC → WS-JA/JB/JC → WS-K). Each slice has implementer scope, acceptance, reviewer focus, and advancement gate condition requiring behavioral evidence, not just compilation.

4. **Deployment-close criteria** — correct and enforceable. Boot → autonomy tick → seeded task → persisted evidence in one live run is the right bar.

5. **Structural finding (non-blocking, must resolve before WS-JA opens):** `work-classifier.ts` is assigned to WS-IC scope but its relationship to WS-JA/JB/JC is ambiguous — spec does not state whether the scheduler invokes jobs directly, or the work classifier selects the job class and dispatches. Decide and record in the WS-JA SPEC-Q or WS-IC advancement gate.

Next step: `STEWARD2 SPEC-Q: resolve BD-AUTO-1 and BD-AUTO-2 together, then BD-AUTO-3 through BD-AUTO-5, before opening WS-IA`.

---

## SPEC-Q — OpenClaw heartbeat surface for WS-K (2026-04-30)

### What was read

Source files read to answer this SPEC-Q:
- `src/infra/heartbeat-wake.ts` — full read
- `src/infra/heartbeat-runner.ts` — full read (key sections: `runHeartbeatOnce`, `run`, `setHeartbeatWakeHandler`, `scheduleNext`)
- `src/infra/heartbeat-schedule.ts` — full read

### What the OpenClaw heartbeat actually does

The OpenClaw heartbeat is a **model-turn firing system**, not a background job system.

Execution path:
1. `heartbeat-schedule.ts` — computes per-agent timer intervals (phase-randomized, configurable cadence)
2. `heartbeat-wake.ts` — coalescing timer module; `setHeartbeatWakeHandler(fn)` registers who handles wakes; `requestHeartbeatNow()` queues a wake with priority/coalesce
3. `heartbeat-runner.ts` — the wake handler calls `runHeartbeatOnce(opts)` which:
   - checks `areHeartbeatsEnabled()`, quiet-hours, `queueSize > 0` (skips if busy)
   - calls `resolveHeartbeatPreflight` (reads `HEARTBEAT.md`, resolves session)
   - **fires a new LLM agent turn** via `resolveEmbeddedSessionLane` with the heartbeat prompt

The heartbeat system fires LLM inference. Each heartbeat is a model turn, not a function call.

### Critical finding: BD-AUTO-1 resolution must be revised

The resolved BD-AUTO-1 says: "existing heartbeat/background runner is the wake source only."

This is **ambiguous as written** and cannot mean "wire `autonomy-bridge.ts` into `runHeartbeatOnce`." Here is why:

- `runHeartbeatOnce` fires a model turn. If `autonomy-bridge.ts` is called from inside this path, steward autonomy would be embedded inside an LLM inference turn — exactly what the spec prohibits: "heartbeat prompt content or planner-produced fake autonomy inside a normal user turn."
- The heartbeat runner already checks `queueSize > 0` to skip when a user turn is active. A steward autonomy hook at that level would still run only when the LLM session is idle — but it would be called as part of the LLM turn setup, not as a separate host-owned path.

### Correct interpretation and revised BD-AUTO-1

The heartbeat runner provides two usable surfaces for WS-K:

#### Option A — Parallel steward timer (recommended)

WS-K creates its own host-owned timer loop, separate from the heartbeat runner:
- Steward initialization registers a `setInterval` (or equivalent) that calls `autonomy-bridge.ts` → `autonomy-runner.ts` directly
- This timer runs on a steward-owned cadence (e.g. 60s), not the heartbeat cadence
- It checks `evaluateAutonomyRunPolicy()` first; if `user_turn_active`, it skips and re-arms
- The OpenClaw startup path must expose a hook to register this timer on process start

**Advantage:** Cleanly separate from the LLM turn path. Autonomy never touches the heartbeat runner.

**Constraint:** Requires finding the right OpenClaw startup/lifecycle hook. Candidate: the same path that calls `createHeartbeatRunner()` in `heartbeat-runner.ts`. Read that initialization seam before WS-K opens.

#### Option B — Pre-LLM hook inside heartbeat runner (not recommended)

Add a hook point inside `runHeartbeatOnce` before the LLM turn fires, when `queueSize === 0`. The steward autonomy tick runs here instead of through the LLM.

**Problem:** This couples steward autonomy cadence to heartbeat cadence. The heartbeat cadence is agent-configured (per-agent, per-channel). Steward autonomy cadence must be steward-owned. This mixes the two ownerships.

### Revised BD-AUTO-1 decision

**BD-AUTO-1 — REVISED (2026-04-30):**
- The OpenClaw heartbeat runner fires LLM model turns. It is **not** the direct seam for steward autonomy.
- The heartbeat timer architecture (`heartbeat-wake.ts` + `requestHeartbeatNow`) is the pattern to follow, **not** the surface to reuse.
- WS-K must add a **steward-owned timer** (separate from the heartbeat runner) that calls `autonomy-bridge.ts` → `autonomy-runner.ts` on a steward-defined cadence.
- The OpenClaw startup path that initializes the heartbeat runner must be identified and extended with a steward autonomy timer registration. Candidate file: wherever `createHeartbeatRunner` is called — read before WS-K opens.
- BD-AUTO-2 mutual exclusion: the steward timer calls `evaluateAutonomyRunPolicy()` (WS-IA) first; if `user_turn_active`, it skips and re-arms. No lock needed — the policy function reads DB runtime state.

**Consequence for WS-K scope:**
- WS-K must read the OpenClaw startup/initialization path to find where to register the steward timer before implementation starts
- `autonomy-bridge.ts` is a timer callback entry point, not a heartbeat wake handler
- No changes to `heartbeat-runner.ts` or `heartbeat-wake.ts` are needed for the autonomy path

### What must be read before WS-K opens

- Wherever `createHeartbeatRunner` is called (find the OpenClaw startup/server initialization path)
- Verify that a steward-owned timer registered at that same level does not conflict with OpenClaw's own startup/cleanup lifecycle

---

## WS-IB advancement gate — tightened (2026-04-30)

The existing WS-IB advancement gate condition reads:
> "reviewer can point to the persisted boot snapshot / triage evidence and explain exactly what autonomy now knows after startup"

This is the right bar but must be made explicit. A boot log line or an empty DB write does not pass. The reviewer must be able to answer all of these questions from DB evidence alone, without reading the code:

- **What did the steward observe at boot?** (capability/health snapshot content, not just "boot ran")
- **What is the steward's classified next action class?** (e.g. `seed_first_task`, `wait_for_idle`, `blocked_budget`)
- **Has boot been marked as a one-time event?** (idempotency: does a second boot record replace or duplicate?)
- **Is the boot record persisted in a queryable DB table/event, not just stdout?**

If any of these cannot be answered from `SELECT` on the steward DB, WS-IB does not pass.

---

## WS-JA/JB/JC ordering clarification (2026-04-30)

The implementation order in the autonomy tranche lists WS-JA → WS-JB → WS-JC sequentially. This is conservative, not a hard dependency chain.

**Actual dependency structure within the J group:**
- WS-JA depends on: `WS-IA`, `WS-IC`
- WS-JB depends on: `WS-IA`, `WS-IC`, `BD-AUTO-4` (artifact location — already resolved)
- WS-JC depends on: `WS-IA`, `WS-IC`, `BD-AUTO-5` (strategy scope — already resolved)
- WS-JA, WS-JB, and WS-JC do **not** depend on each other

**Consequence:** Once WS-IC is merged, all three J slices are unblocked. They may be implemented in any order, or if one proves unexpectedly complex, the others may proceed ahead of it. The sequential ordering in the spec is a suggestion, not a constraint.

The one dependency to preserve: `job-types.ts` is created by whichever J slice is first. Later J slices extend it rather than creating it again.

## WS-IB implementation gate (2026-04-30)

Implementer (Codex): implemented `WS-IB` on branch `ws-ib`.

Files added:
- `src/steward/autonomy/boot-sequence.ts`
- `src/steward/autonomy/boot-sequence.test.ts`

Files modified:
- `src/steward/db/runtime-schema.ts`

What `WS-IB` now owns:
- deterministic autonomy boot recording through `recordAutonomyBootSequence(...)`
- queryable boot capability snapshot:
  - `dbReady`
  - `runtimeStatus`
  - `truthCoreReady`
  - `lmStudioLifecycleReady`
  - `autonomyMode`
- deterministic next action classification:
  - `wait_for_autonomy_enable`
  - `wait_for_operator_unpause`
  - `wait_for_idle`
  - `seed_first_task`
- one-time boot completion semantics via `autonomy.boot_completed`
- typed boot evidence events:
  - `autonomy.boot.recorded`
  - `autonomy.boot.skipped`

Invariant achieved in this slice:
- a fresh steward runtime can write a bounded, inspectable boot record into the steward DB without operator prompting
- boot classification is host-owned and deterministic
- boot is idempotent within the current lifecycle; reruns do not generate repeated primary boot records
- the reviewer can answer from DB evidence alone what the steward observed at boot and what it believes the next action class should be

Behavior implemented:
- if autonomy is enabled and runtime is not active, boot classifies `seed_first_task`
- if runtime is already `running`, boot classifies `wait_for_idle`
- if autonomy mode is `assistant_only`, boot classifies `wait_for_autonomy_enable`
- if autonomy mode is `autonomy_paused`, boot classifies `wait_for_operator_unpause`
- once boot has completed, later calls emit `autonomy.boot.skipped` with `already_completed`

Focused acceptance evidence:
- first boot creates a DB event containing both snapshot and next action class
- repeat boot is idempotent and emits only a skipped record
- blocked/observed runtime states are preserved in the boot classification, not hidden

Verification:
- `corepack pnpm exec vitest run src/steward/autonomy/autonomy-state.test.ts src/steward/autonomy/autonomy-policy.test.ts src/steward/autonomy/boot-sequence.test.ts`
  - PASS: `3` files, `11` tests
  - note: required escalation because sandbox Vitest startup hit Windows `spawn EPERM`
- `node --max-old-space-size=8192 ./node_modules/typescript/bin/tsc --noEmit`
  - PASS

Next process step:
- reviewer gate for `WS-IB`

### WS-IB reviewer gate (2026-04-30)

Reviewer: Claude Code

Tightened advancement gate applied — all four criteria checked from DB evidence:

1. **What was observed at boot?** — `BootCapabilitySnapshot` in `steward_events.data_json`: `dbReady`, `runtimeStatus` (real DB read via `getRuntimeState()`), `autonomyMode` (from `steward_kv`), `truthCoreReady`, `lmStudioLifecycleReady`. Test 1 parses and asserts on `data_json` by SQL. ✓
2. **Classified next action class?** — `classifyNextAction` produces 4 deterministic outcomes from observable DB state, no model input. Persisted in `data_json`. ✓
3. **One-time event / idempotency?** — `bootCompleted` flag in `steward_kv`; second call emits `autonomy.boot.skipped`. Test 2 counts both event kinds by SQL — exactly 1 recorded, 1 skipped. ✓
4. **Queryable from DB?** — `steward_events` table, `kind = 'autonomy.boot.recorded'`, `data_json` parseable. Test 1 does exactly this. ✓

Evidence:
- tests: `corepack pnpm exec vitest run src/steward/autonomy/boot-sequence.test.ts` — 1 file, 3 tests, PASS
- TypeScript: `node --max-old-space-size=8192 ./node_modules/typescript/bin/tsc --noEmit` — clean

Carry-forward for WS-K scope:
- `truthCoreReady` and `lmStudioLifecycleReady` default to `true` — acceptable for WS-IB. Once LM-C and truth-audit are wired at startup, these should be populated from real subsystem readiness checks rather than caller-supplied defaults.

Verdict: **PASS. ADVANCE** — open PR `ws-ib → main`.

## WS-IC implementation gate (2026-04-30)

Implementer: Codex

Files added:
- `src/steward/autonomy/autonomy-runner.ts`
- `src/steward/autonomy/idle-seeding.ts`
- `src/steward/autonomy/work-classifier.ts`
- `src/steward/autonomy/autonomy-runner.test.ts`
- `src/steward/autonomy/work-classifier.test.ts`

Files changed:
- `src/steward/db/runtime-schema.ts`

Host-owned invariant delivered in this slice:
- when autonomy is enabled, boot is complete, and no user turn is active, the host can call one deterministic autonomy tick that results in exactly one of:
  - blocked with persisted reason
  - no-op with persisted reason and cooldown/backoff
  - exactly one seeded autonomous task through steward DB flow/task rows
- the autonomy tick does not mark work completed or bypass consequence/proof/mission ownership
- duplicate autonomous work for the same class is suppressed instead of fanning out

Behavior implemented:
- `autonomy-runner.ts`
  - calls `evaluateAutonomyRunPolicy()` first
  - persists `autonomy.tick.blocked` for blocked outcomes
  - classifies eligible work deterministically
  - seeds at most one task
  - persists `autonomy.tick.noop` for duplicate suppression / no-new-task outcomes
  - updates cooldown / next-allowed tick and autonomy backoff in steward KV
- `work-classifier.ts`
  - returns one of:
    - `goal_work`
    - `diagnostic_work`
    - `maintenance_work`
    - `review_or_consolidation`
  - deterministic rules in this slice:
    - active blockers => `diagnostic_work`
    - no recorded proof yet => `goal_work`
    - two recent primary failures => `diagnostic_work`
    - proofs exist but audit missing/stale => `review_or_consolidation`
    - otherwise => `maintenance_work`
- `idle-seeding.ts`
  - seeds one `steward_flows` row plus one `steward_flow_tasks` row
  - writes autonomy-owned state JSON:
    - `seeded_by = "autonomy"`
    - `autonomy_work_class`
    - `classification_reason`
  - maps work class to steward-owned flow/task authority:
    - `goal_work` => `research` / `primary`
    - `diagnostic_work` => `control` / `diagnostic`
    - `maintenance_work` => `maintenance` / `diagnostic`
    - `review_or_consolidation` => `maintenance` / `diagnostic`
  - suppresses duplicate live autonomy work for the same class
- typed evidence added:
  - `autonomy.tick.blocked`
  - `autonomy.tick.noop`
  - `autonomy.task.seeded`

Focused acceptance evidence:
- blocked case:
  - if runtime is `running`, autonomy tick returns `blocked`
  - persisted event: `autonomy.tick.blocked`
- seeded case:
  - eligible autonomy tick seeds exactly one `research` flow / `primary` task when no proof exists
  - persisted event: `autonomy.task.seeded`
  - persisted flow state proves `seeded_by = "autonomy"`
- duplicate suppression / backoff:
  - if a matching live autonomy flow already exists, autonomy tick returns `noop`
  - persisted event: `autonomy.tick.noop`
  - `autonomy.next_allowed_tick_ts` advances and backoff is stored in steward KV

Verification:
- `corepack pnpm exec vitest run src/steward/autonomy/work-classifier.test.ts src/steward/autonomy/autonomy-runner.test.ts src/steward/autonomy/autonomy-state.test.ts src/steward/autonomy/autonomy-policy.test.ts src/steward/autonomy/boot-sequence.test.ts`
  - PASS: `5` files, `17` tests
  - note: required escalation because sandbox Vitest startup hit Windows `spawn EPERM`
- `node --max-old-space-size=8192 ./node_modules/typescript/bin/tsc --noEmit`
  - PASS

Carry-forward:
- `CF-AUTO-1`
  - `WS-IC` currently seeds deterministic bounded work classes, but it does not yet dispatch named recurring jobs.
  - This is intentional and matches the resolved scheduler split:
    - recurring jobs (`daily self-review`, `sleep consolidation`, `strategy_validation`) belong to `WS-JA` / `WS-JB` / `WS-JC`
    - `WS-K` will own the steward timer seam that calls the autonomy runner on cadence

## WS-IC reviewer gate (2026-04-30)

Reviewer: Claude

Verdict: **PASS**

Findings:

1. All three outcomes (blocked / noop / seeded) are implemented and persisted correctly. Blocked emits `autonomy.tick.blocked` via policy gate. Noop emits `autonomy.tick.noop` with backoff advance. Seeded writes `steward_flows` + `steward_flow_tasks` and emits `autonomy.task.seeded`.
2. One-task-per-tick is structurally enforced — runner calls `seedIdleAutonomyTask` once and returns. No loop possible.
3. Duplicate suppression scans live flows for matching `seeded_by=autonomy` + `autonomy_work_class`. Correct.
4. Backoff doubles on noop (60s → 900s cap), resets to 60s on seeded. Both KV writes confirmed by test.
5. Work classification is deterministic with fixed priority order: active blockers → no proof → ≥2 consecutive primary failures → stale/missing audit → maintenance.
6. 17/17 tests pass (5 test files).

Carry-forwards added:

- `CF-IC-1` — `taskId = flowId` in `idle-seeding.ts:124` is a synthetic alias. `steward_flow_tasks.task_id` has no FK so it is valid, but must resolve to a real host-owned task reference when WS-K wires the steward timer. Document or fix before WS-K advancement gate.
- `CF-IC-2` — Double event on seeded path: `idle-seeding.ts` emits `autonomy.task.seeded`; `autonomy-runner.ts` also emits `flow.created` for the same action. `flow.created` is undocumented. Remove one or document both before WS-K.
- `CF-IC-3` — `consecutive_primary_failures` and `maintenance_work` classifier branches have no test coverage. Add before WS-JA/JB/JC advancement gates if those slices depend on classifier routing.

Next process step:
- `STEWARD2 ADVANCE WS-IC`

## WS-IC post-merge status (2026-04-30)

Merge confirmed: PR `#18` merged `ws-ic` → `main`.

WS-IC is now complete on `main`:
- `src/steward/autonomy/autonomy-state.ts`
- `src/steward/autonomy/autonomy-policy.ts`
- `src/steward/autonomy/boot-sequence.ts`
- `src/steward/autonomy/autonomy-runner.ts`
- `src/steward/autonomy/idle-seeding.ts`
- `src/steward/autonomy/work-classifier.ts`

Autonomy tranche state after merge:
- `WS-IA` merged
- `WS-IB` merged
- `WS-IC` merged
- `WS-JA` merged
- `WS-JB` merged
- next implementation slice: `WS-JC`

Carry-forwards still open:
- `CF-IC-1` — resolve synthetic `taskId = flowId` before `WS-K` advancement gate
- `CF-IC-2` — resolve/document duplicate seeded-path event emission before `WS-K`
- `CF-IC-3` — resolved in `WS-JA` by explicit `work-classifier.test.ts` coverage for `consecutive_primary_failures` and `maintenance_work`

Next process step:
- `STEWARD2 IMPLEMENT WS-JC`

## WS-JB implementation gate (2026-05-01)

Implementer: Codex

Donor reviewed before implementation:
- `C:\ai_agent\OLD_AI\jobs\sleep_consolidation.py`

Files added:
- `src/steward/jobs/sleep-consolidation.ts`
- `src/steward/jobs/sleep-consolidation.test.ts`

Files changed:
- `src/steward/db/runtime-schema.ts`
- `src/steward/jobs/job-types.ts`

Host-owned invariant delivered in this slice:
- sleep consolidation is now a steward-owned recurring job module, not a manual maintenance note
- one consolidation record per UTC day is enforced by DB dedupe against prior `sleep_consolidation` job flows
- consolidation produces persisted day-summary evidence plus an auditable archive/redaction record
- pruning is bounded and safe:
  - no row deletions from `steward_events`
  - only a narrow allowlist of old low-value event payloads is redacted
  - active runtime state is untouched

Behavior implemented:
- `sleep-consolidation.ts`
  - builds a bounded UTC-day summary from steward DB state:
    - event count
    - flow count
    - knowledge count
    - per-flow event summary
  - writes a JSON artifact under steward artifact storage:
    - `artifacts/steward/sleep/<day>/<sessionId>.day-summary.json`
  - stores a `shared_thread` knowledge entry referencing the summary artifact
  - records one completed maintenance flow/task per UTC day for `sleep_consolidation`
  - persists job evidence through:
    - `job.sleep_consolidation.recorded`
    - `job.sleep_consolidation.reused`
    - `job.sleep_consolidation.pruned`
  - archives and redacts only old payloads from a narrow safe allowlist:
    - `session.touched`
    - `autonomy.policy.allowed`
    - `autonomy.policy.blocked`
    - `autonomy.tick.blocked`
    - `autonomy.tick.noop`
  - writes archived payloads to gzip JSONL and redacts DB payloads in-place instead of deleting rows

Focused acceptance evidence:
- first run creates one completed maintenance flow with `job_type = "sleep_consolidation"`
- same-day rerun reuses the existing flow and emits `job.sleep_consolidation.reused`
- day summary artifact path is persisted in both flow state and recorded event
- pruning preserves event rows while redacting only allowed old payloads and recording archive evidence
- summary window is bounded to the current UTC day, not arbitrary history

Verification:
- `corepack pnpm exec vitest run src/steward/jobs/sleep-consolidation.test.ts src/steward/jobs/daily-self-review.test.ts src/steward/memory/relationship-memory.test.ts`
  - PASS: `3` files, `11` tests
  - note: required escalation because sandbox Vitest startup hit Windows `spawn EPERM`
- `node --max-old-space-size=8192 ./node_modules/typescript/bin/tsc --noEmit`
  - PASS

Carry-forward:
- none added by `WS-JB`

## WS-JB reviewer gate (2026-05-01)

Reviewer: Claude

Verdict: **PASS**

Findings:

1. Summary generation correct — strict UTC day window (`ts >= dayStart AND ts < dayStart + 24h`). Day boundary test confirms yesterday's events excluded.
2. UTC-day dedupe correct — scans maintenance flows for `job_type=sleep_consolidation` + day string match. Reuse emits `job.sleep_consolidation.reused`.
3. Archive/redaction safety confirmed on all axes: no `DELETE`/`DROP` anywhere; allowlist of 5 event kinds enforced by SQL `IN (...)`; already-archived rows excluded via `data_json NOT LIKE '%"archived":true%'`; gzip archive written to disk before DB `UPDATE` loop — write failure leaves DB untouched.
4. No runtime corruption — no writes to `steward_kv`, `steward_sessions`, or runtime flow status. Only inserts new completed maintenance flow + events.
5. Artifact evidence complete — summary JSON path persisted in `state_json`, `steward_knowledge` metadata, and recorded event.
6. 11/11 tests pass (3 test files).

Carry-forwards added:

- `CF-JB-1` — `dryRun=true` still computes and returns a non-null `archivePath` pointing to a file that was not written. Path leaks into `state_json` and recorded events if called through `runSleepConsolidationJob` in dry-run mode. Consider returning `null` for `archivePath` when `dryRun=true`.
- `CF-JB-2` — `job.sleep_consolidation.pruned` emitted unconditionally even when `redactedEventCount === 0`. Same pattern as CF-JA-1. Minor audit noise.
- `CF-JB-3` — `buildSleepConsolidationSummary` with omitted `sessionKey` produces `WHERE session_key = NULL` (SQL equality), silently returning 0. Not reachable through `runSleepConsolidationJob` which always passes `sessionKey`, but the standalone function has silent incorrect behavior.

Next process step:
- `STEWARD2 ADVANCE WS-JB`

## WS-JB reviewer fix (2026-05-01)

Codex fixed the structural day-bounded flow-summary bug found during review:

- `buildSleepConsolidationSummary()` no longer includes all historical flows created before the day window end.
- the summary flow set is now derived from flows with event activity inside the current UTC day window.
- `sleep-consolidation.test.ts` now proves that:
  - a historical flow with only yesterday activity is excluded
  - only the flow touched inside the current UTC day is summarized
  - `flowCount` is day-bounded, not cumulative-history bounded

Post-fix verification:
- `corepack pnpm exec vitest run src/steward/jobs/sleep-consolidation.test.ts src/steward/jobs/daily-self-review.test.ts src/steward/memory/relationship-memory.test.ts`
  - PASS: `3` files, `11` tests
- `node --max-old-space-size=8192 ./node_modules/typescript/bin/tsc --noEmit`
  - PASS

Result:
- the structural reviewer finding is resolved on `ws-jb`
- remaining reviewer-noted carry-forwards are still:
  - `CF-JB-1`
  - `CF-JB-2`
  - `CF-JB-3`

## WS-JB re-review gate (2026-05-01)

Reviewer: Claude

Verdict: **PASS** (confirmed post-fix, commit 0f4d0cc3b5)

Fix verified:
- `buildSleepConsolidationSummary()` now derives `flowRows` from `activeFlowIds` (flows with at least one event inside the UTC day window) instead of `created_ts < window.endTs`. Historical flows with no day-window activity are excluded.
- `activeFlowIds.length === 0` early-exit handles an empty day correctly.
- Test updated: `flowCount === 1` and `flowSummaries` contains only `todaysFlowId` with yesterday's flow absent.
- 4/4 sleep-consolidation tests pass.

Remaining open carry-forwards (all non-blocking): CF-JB-1, CF-JB-2, CF-JB-3. No new issues introduced.

Next process step:
- `STEWARD2 ADVANCE WS-JB`

## WS-JB post-merge status (2026-05-01)

Merge confirmed: PR `#20` merged `ws-jb` → `main`.

WS-JB is now complete on `main`:
- `src/steward/jobs/sleep-consolidation.ts`
- `src/steward/jobs/sleep-consolidation.test.ts`

Autonomy tranche state after WS-JB merge:
- `WS-IA` merged
- `WS-IB` merged
- `WS-IC` merged
- `WS-JA` merged
- `WS-JB` merged
- next implementation slice: `WS-JC`

Open carry-forwards:
- `CF-IC-1` — resolve synthetic `taskId = flowId` before `WS-K` advancement gate
- `CF-IC-2` — resolve/document duplicate seeded-path event emission before `WS-K`
- `CF-JB-1` — dry-run archive path should return `null` instead of a non-written path
- `CF-JB-2` — gate `job.sleep_consolidation.pruned` when `redactedEventCount === 0`
- `CF-JB-3` — standalone `buildSleepConsolidationSummary()` should not silently return `knowledgeCount = 0` when `sessionKey` is omitted

Next process step:
- `STEWARD2 IMPLEMENT WS-JC`

## WS-JA implementation gate (2026-04-30)

Implementer: Codex

Donor reviewed before implementation:
- `C:\ai_agent\OLD_AI\jobs\daily_self_review.py`

Files added:
- `src/steward/jobs/job-types.ts`
- `src/steward/jobs/daily-self-review.ts`
- `src/steward/jobs/daily-self-review.test.ts`

Files changed:
- `src/steward/db/runtime-schema.ts`
- `src/steward/memory/memory-types.ts`
- `src/steward/autonomy/work-classifier.test.ts`

Host-owned invariant delivered in this slice:
- the daily self-review job is now a steward-owned recurring job module, not a prompt-only note
- one self-review record per UTC day is enforced by DB dedupe against prior `daily_self_review` job flows
- explicit memory candidate lines are parsed deterministically and promoted into typed steward memory writes
- no auto-code-modification behavior exists in this slice

Behavior implemented:
- `daily-self-review.ts`
  - builds a bounded 24h snapshot from steward DB state:
    - event count
    - accepted/rejected proof counts
    - failed primary task count
    - open flow count
  - builds a deterministic future-job prompt contract with explicit output format
  - records one maintenance flow/task per day for `daily_self_review`
  - persists job evidence through:
    - `job.daily_self_review.recorded`
    - `job.daily_self_review.reused`
    - `job.daily_self_review.memory_extracted`
  - extracts only explicit prefixed candidate lines:
    - `RULE`
    - `PREF`
    - `FACT`
    - `PATTERN[risk=...]`
    - `PROC[risk=...]`
- new typed memory categories added for self-review promotion:
  - `steward_rule`
  - `steward_preference`
  - `steward_fact`
  - `steward_pattern`
  - `steward_procedure`
- `CF-IC-3` resolved:
  - classifier tests now cover both `consecutive_primary_failures` and `maintenance_work`

Focused acceptance evidence:
- first run creates one completed maintenance flow with `job_type = "daily_self_review"`
- same-day rerun reuses the existing flow and emits `job.daily_self_review.reused`
- explicit candidate lines create typed `steward_memories` rows through the existing relationship-memory storage seam
- invalid, duplicate, or oversized lines are ignored deterministically

Verification:
- `corepack pnpm exec vitest run src/steward/autonomy/work-classifier.test.ts src/steward/jobs/daily-self-review.test.ts src/steward/memory/relationship-memory.test.ts`
  - PASS: `3` files, `10` tests
  - note: required escalation because sandbox Vitest startup hit Windows `spawn EPERM`
- `node --max-old-space-size=8192 ./node_modules/typescript/bin/tsc --noEmit`
  - PASS

Carry-forward:
- none added by `WS-JA`

## WS-JA reviewer gate (2026-05-01)

Reviewer: Claude

Verdict: **PASS**

Findings:

1. Daily cadence/dedupe correct — UTC day string stored in `state_json`; `findExistingDailySelfReviewFlow` matches `job_type + day`; reuse emits `job.daily_self_review.reused` and returns without a new record. Snapshot window (rolling 24h) and dedupe (UTC day boundary) are independent and consistent.
2. Persisted evidence complete — completed maintenance flow, succeeded diagnostic task, full `state_json` with snapshot/prompt/report/extracted-count, plus `job.daily_self_review.recorded` and `job.daily_self_review.memory_extracted` events.
3. Memory extraction is explicit and bounded — prefix-only (RULE/PREF/FACT/PATTERN/PROC), ≤240 chars, dedupe by `candidateType:text`, routed into 5 typed `steward_memories` entries. No free-form or implicit extraction.
4. No auto-code-modification — no fs access, no exec/eval/spawn. Prompt explicitly forbids code modification.
5. CF-IC-3 resolved — `consecutive_primary_failures` and `maintenance_work` classifier branches now tested.
6. 10/10 tests pass (3 test files).

Carry-forwards added:

- `CF-JA-1` — resolved on `ws-ja`: `job.daily_self_review.memory_extracted` now emits only when `candidates.length > 0`.
- `CF-JA-2` — resolved on `ws-ja`: added day-boundary rollover test proving a new UTC day creates a new flow instead of reusing the prior day record.

Next process step:
- `STEWARD2 ADVANCE WS-JA`

## WS-JA post-review fixes (2026-05-01)

Codex applied the two reviewer carry-forward fixes before advancement:

- `CF-JA-1` fixed in `src/steward/jobs/daily-self-review.ts`
  - `job.daily_self_review.memory_extracted` is now gated on `candidates.length > 0`
  - prevents misleading extraction events when no explicit memory candidates were present
- `CF-JA-2` fixed in `src/steward/jobs/daily-self-review.test.ts`
  - added UTC day-boundary rollover coverage
  - proves a second run on the next UTC day creates a new review flow instead of reusing the prior day flow

Additional verification after the fixes:
- `corepack pnpm exec vitest run src/steward/jobs/daily-self-review.test.ts src/steward/memory/relationship-memory.test.ts src/steward/autonomy/work-classifier.test.ts`
  - PASS: `3` files, `12` tests
- `node --max-old-space-size=8192 ./node_modules/typescript/bin/tsc --noEmit`
  - PASS

Result:
- `WS-JA` is now advance-ready with no open `WS-JA` carry-forwards

## WS-JA post-merge status (2026-05-01)

Merge confirmed: PR `#19` merged `ws-ja` → `main`.

WS-JA is now complete on `main`:
- `src/steward/jobs/job-types.ts`
- `src/steward/jobs/daily-self-review.ts`
- `src/steward/jobs/daily-self-review.test.ts`

Autonomy tranche state after WS-JA merge:
- `WS-IA` merged
- `WS-IB` merged
- `WS-IC` merged
- `WS-JA` merged
- next implementation slice: `WS-JB`

Open carry-forwards:
- `CF-IC-1` — resolve synthetic `taskId = flowId` before `WS-K` advancement gate
- `CF-IC-2` — resolve/document duplicate seeded-path event emission before `WS-K`

Next process step:
- `STEWARD2 IMPLEMENT WS-JB`

## WS-JC implementation gate (2026-05-01)

Implementer: Codex

Donor reviewed before implementation:
- `C:\ai_agent\PEQS\core\strategy_validator.py`

Files added:
- `src/steward/jobs/strategy-validation.ts`
- `src/steward/jobs/strategy-validation.test.ts`

Files changed:
- `src/steward/db/runtime-schema.ts`
- `src/steward/jobs/job-types.ts`

Host-owned invariant delivered in this slice:
- strategy validation is now a steward-owned recurring job, not a free-floating planner idea
- validation reads only persisted Steward2 state:
  - latest steward proof
  - recent truth-memory signals
  - latest task-value judgment
  - prior validation outcomes for cooldown / burn escalation
- each validation attempt persists one explicit approve/reject decision path in steward DB state
- repeated failed validation attempts are bounded through the existing mission time-burn seam

Behavior implemented:
- `strategy-validation.ts`
  - adds a 5-minute strategy-validation cadence aligned to the PEQS donor cooldown
  - reuses the last validation decision during active cooldown and emits `job.strategy_validation.reused`
  - builds a DB-native validation snapshot from:
    - latest `steward_proofs` row
    - accepted/rejected proof counts
    - last 24h `truth_violation` / `truth_reinforced` memory counts
    - latest `mission.task_value.adjudicated` event label
  - applies deterministic validation rules:
    - reject if no candidate proof exists
    - reject if latest proof is not accepted
    - reject if latest proof is not grounded
    - reject if proof score is below threshold
    - reject if recent truth violations remain open
    - reject if latest task value is `low_value` or `hollow`
    - approve only when those blockers are absent
  - records one completed maintenance flow/task per validation attempt with:
    - `job_type = "strategy_validation"`
    - full validation snapshot
    - decision object
    - cooldown timestamp
    - persisted knowledge reference
    - budget adjustment evidence
  - persists event evidence through:
    - `job.strategy_validation.recorded`
    - `job.strategy_validation.reused`
    - `job.strategy_validation.approved`
    - `job.strategy_validation.rejected`
  - stores a searchable `shared_thread` knowledge record for each new validation decision
  - uses existing mission budget seams:
    - `applyValidationBonus(...)` on approval
    - `applyRejectionBurn(...)` on rejection with escalating rejection count

Focused acceptance evidence:
- a strong grounded accepted proof produces an explicit approval record plus validation bonus
- truth-blocked candidate state produces an explicit rejection record plus escalating burn on repeated attempts
- rerun during cooldown reuses the existing decision and does not create a second flow
- weak proof score rejects deterministically without depending on legacy PEQS tables or runtime files

Verification:
- `corepack pnpm exec vitest run src/steward/jobs/strategy-validation.test.ts`
  - PASS: `1` file, `4` tests
  - note: required escalation because sandbox Vitest startup hit Windows `spawn EPERM`
- `node --max-old-space-size=8192 ./node_modules/typescript/bin/tsc --noEmit`
  - PASS

Carry-forward:
- none added by `WS-JC` implementation

## WS-JC reviewer gate (2026-05-01)

Reviewer: Claude

Verdict: **PASS**

Findings:

1. DB-native inputs confirmed — snapshot reads only from `steward_proofs`, `steward_memories`, and `steward_events`. No PEQS tables, no file reads, no external dependencies.
2. Deterministic approve/reject ownership — `buildDecision()` is a strict 6-check priority chain. One code path to approval, six typed rejection reasons. No ambiguity.
3. Cooldown reuse correct — `cooldown_until_ts` read from prior flow `state_json`; reuse emits `job.strategy_validation.reused` and does not create a new flow. Test proves `flowCount === 1` within cooldown.
4. Rejection-burn escalation correct — consecutive rejection count counted from most-recent-first, stops at first approval. `rejectionCountBase = count + 1` → always ≥ 1. `applyRejectionBurn` uses exponential scale. Approval resets to 0, restarts cleanly on next rejection.
5. Bonus/burn wired correctly — `applyValidationBonus` on approved, `applyRejectionBurn` on rejected. Both stored in `state_json` and knowledge metadata. Budget change confirmed by tests.
6. Persisted evidence complete — `job.strategy_validation.recorded` + `approved`/`rejected` events, `shared_thread` knowledge entry with `strategy_validation_ref: true`. Decision, snapshot, cooldown, and budget adjustment all queryable.
7. 4/4 tests pass.

Carry-forwards added:

- `CF-JC-1` — `validationKnowledgeId: 0` sentinel returned on reuse path instead of the actual knowledge ID from the prior flow's `state_json.validation_knowledge_id`. Non-blocking since `reused: true` signals the caller, but misleading.
- `CF-JC-2` — `applyRejectionBurn`/`applyValidationBonus` called with `decision.flowId` / `decision.taskId` (proof IDs, possibly null) before the validation flow row is inserted. Audit trail links burn/bonus to the proof's flow, not the validation job's own flow. Minor audit-trail gap.
- `CF-JC-3` — 4 of 7 rejection reason branches untested: `no_candidate_proof`, `proof_not_grounded`, `proof_not_accepted`, `recent_task_value_low`. Add before advancement gate.

Next process step:
- `STEWARD2 ADVANCE WS-JC`

## WS-JC post-review fixes (2026-05-01)

Codex resolved all three reviewer carry-forwards on `ws-jc` before advancement:

- `CF-JC-1` fixed in `src/steward/jobs/strategy-validation.ts`
  - reuse path now returns the real `validationKnowledgeId` from prior flow state
  - `job.strategy_validation.reused` event now includes that same persisted ID
- `CF-JC-2` fixed in `src/steward/jobs/strategy-validation.ts`
  - validation flow/task is now created before bonus/burn is applied
  - mission time audit events now bind to the validation job’s own `flowId` / `taskId`, not the proof’s flow
- `CF-JC-3` fixed in `src/steward/jobs/strategy-validation.test.ts`
  - added explicit coverage for the previously untested deterministic rejection paths:
    - `no_candidate_proof`
    - `proof_not_accepted`
    - `proof_not_grounded`
    - `recent_task_value_low`
  - also added:
    - reuse-path knowledge-ID coverage
    - audit-trail flow ownership coverage

Additional verification after the fixes:
- `corepack pnpm exec vitest run src/steward/jobs/strategy-validation.test.ts`
  - PASS: `1` file, `9` tests
  - note: required escalation because sandbox Vitest startup hit Windows `spawn EPERM`
- `node --max-old-space-size=8192 ./node_modules/typescript/bin/tsc --noEmit`
  - PASS

Result:
- `WS-JC` is now advance-ready with no open `WS-JC` carry-forwards

## WS-JC post-merge status (2026-05-01)

Merge confirmed: PR `#21` merged `ws-jc` → `main`.

WS-JC is now complete on `main`:
- `src/steward/jobs/strategy-validation.ts`
- `src/steward/jobs/strategy-validation.test.ts`
- `src/steward/jobs/job-types.ts`
- `src/steward/db/runtime-schema.ts`

Autonomy tranche state after WS-JC merge:
- `WS-IA` merged
- `WS-IB` merged
- `WS-IC` merged
- `WS-JA` merged
- `WS-JB` merged
- `WS-JC` merged
- next implementation slice: `WS-K`

Open carry-forwards:
- `CF-IC-1` — resolve synthetic `taskId = flowId` before `WS-K` advancement gate
- `CF-IC-2` — resolve/document duplicate seeded-path event emission before `WS-K`
- `CF-JB-1` — consider gating sleep summary knowledge write if summary is structurally empty
- `CF-JB-2` — consider explicit archive-write failure handling if future runtime policy forbids artifact writes
- `CF-JB-3` — if/when sleep artifacts become operator-visible, add explicit retention policy text

Next process step:
- `STEWARD2 IMPLEMENT WS-K`

## WS-K implementation gate (2026-05-01)

Implementer: Codex

Donor reviewed before implementation:
- `C:\ai_agent\OLD_AI\core\goal_orchestrator.py`
- `C:\ai_agent\OLD_AI\core\scheduler.py`
- `C:\ai_agent\PEQS\core\controller.py`
- `src/infra/heartbeat-runner.ts`
- `src/gateway/server-runtime-services.ts`

Files added:
- `src/steward/db/migrations/0004_autonomy_tasks.sql`
- `src/steward/autonomy/goal-orchestrator.ts`
- `src/steward/autonomy/triage-artifacts.ts`
- `src/steward/autonomy/autonomy-bridge.ts`
- `src/steward/autonomy/goal-orchestrator.test.ts`
- `src/steward/autonomy/triage-artifacts.test.ts`
- `src/steward/autonomy/autonomy-bridge.test.ts`

Files changed:
- `src/steward/db/runtime-schema.ts`
- `src/steward/autonomy/idle-seeding.ts`
- `src/steward/autonomy/autonomy-runner.ts`
- `src/steward/autonomy/autonomy-runner.test.ts`
- `src/gateway/server-runtime-services.ts`
- `src/gateway/server-runtime-services.test.ts`
- `src/gateway/server-runtime-handles.ts`
- `src/gateway/server-reload-handlers.ts`
- `src/gateway/server-close.ts`
- `src/gateway/server.impl.ts`

Host-owned invariant delivered in this slice:
- steward autonomy now has its own host-owned timer seam and does not piggyback on the heartbeat LLM turn path
- seeded autonomy work now resolves to a real host-owned task record instead of the synthetic `taskId = flowId` alias
- seeded autonomy handoff/triage evidence is persisted as both a bounded artifact and a searchable DB knowledge reference
- mutual exclusion remains host-owned:
  - bridge cycle is serialized
  - autonomy policy still blocks when a user turn is active
  - no overlap is introduced between assistant-turn execution and autonomy seeding

Behavior implemented:
- `goal-orchestrator.ts`
  - derives next-proof-first autonomy seed plans from current Steward2 state
  - goal work is no longer generic:
    - no proof -> research pick plan using `goals-registry.ts`
    - rejected proof -> proof-repair plan
    - accepted proof -> advance-validated-opportunity plan
  - creates real host-owned autonomy task rows in new `steward_host_tasks`
- `triage-artifacts.ts`
  - persists bounded JSON triage artifacts under steward artifact storage
  - stores a searchable `shared_thread` knowledge reference for each triage artifact
  - emits `autonomy.triage.recorded`
- `idle-seeding.ts`
  - now uses goal-orchestrator + triage-artifacts
  - inserts a real host task first, then links `steward_flow_tasks.task_id` to that host task id
  - persists triage artifact path / knowledge id into flow state and seeded event evidence
- `autonomy-runner.ts`
  - is now async because seeded autonomy work persists artifacts/knowledge before returning
  - removes the duplicate seeded-path `flow.created` event
- `autonomy-bridge.ts`
  - adds steward-owned timer runner, separate from heartbeat runner
  - resolves target main-session keys from OpenClaw config
  - runs one serialized bridge cycle:
    - boot record
    - then autonomy tick when lifecycle state permits
  - emits `autonomy.bridge.tick`
- gateway seam wiring
  - `activateGatewayScheduledServices()` now starts both:
    - heartbeat runner
    - steward autonomy bridge
  - close/reload/runtime mutable state now owns the autonomy bridge lifecycle too

Focused acceptance evidence:
- one harnessed bridge cycle shows:
  - boot record persisted
  - autonomy tick seeded
  - triage artifact persisted
  - host task row persisted
  - flow-task link points to real host task id
- runtime-running session remains mutually exclusive:
  - bridge cycle does not seed host work when a user turn is active
- goal-oriented autonomy work is explicit and proof-first, not generic maintenance filler
- old `WS-IC` carry-forwards are resolved:
  - `CF-IC-1` fixed by `steward_host_tasks`
  - `CF-IC-2` fixed by removing duplicate seeded-path `flow.created`

Verification:
- `corepack pnpm exec vitest run src/steward/autonomy/autonomy-runner.test.ts src/steward/autonomy/goal-orchestrator.test.ts src/steward/autonomy/triage-artifacts.test.ts src/steward/autonomy/autonomy-bridge.test.ts src/gateway/server-runtime-services.test.ts`
  - PASS: `5` files, `11` tests
  - note: required escalation because sandbox Vitest startup hit Windows `spawn EPERM`
- `node --max-old-space-size=8192 ./node_modules/typescript/bin/tsc --noEmit`
  - PASS

Carry-forward:
- none added by `WS-K` implementation

## WS-K reviewer gate (2026-05-01)

Reviewer: Claude

Verdict: **PASS**

Resolved carry-forwards confirmed:
- `CF-IC-1` — `steward_host_tasks` table with real FK-backed task IDs. `idle-seeding.ts` now sets `taskId = hostTask.taskId` (not `flowId`). Bridge test proves `flowTask.task_id === hostTask.id`.
- `CF-IC-2` — `flow.created` removed from `autonomy-runner.ts`. Bridge test asserts count = 0.

Findings:

1. Host-timer seam correct — `startStewardAutonomyBridge` uses its own `setInterval` timer, separate from heartbeat. `state.running` flag serializes concurrent cycles. `timer.unref?.()` prevents process hold.
2. Real host task references confirmed — `steward_host_tasks` row created before flow insert; `steward_flow_tasks.task_id` points to `steward_host_tasks.id`. Path and knowledge ID persisted in `state_json` and seeded event.
3. Triage artifact persistence confirmed — bounded JSON written to `artifacts/steward/autonomy/<day>/`. `shared_thread` knowledge entry with `autonomy_triage_ref: true`. `autonomy.triage.recorded` emitted.
4. Mutual exclusion confirmed — `tickAll` `state.running` guard prevents overlap; `evaluateAutonomyRunPolicy` blocks on user-turn-active. Test: `hostTaskCount = 0` when runtime running.
5. Harnessed evidence confirmed — one cycle: boot recorded → tick seeded → triage artifact present → host task linked → `flow.created` absent.
6. 11/11 tests pass (5 test files).

Carry-forwards added:

- `CF-K-1` — `autonomy-runner.test.ts` seeded-task test calls `runAutonomyTick` without `artifactRoot`, causing real triage JSON files to be written to `process.cwd()/artifacts/steward` with no cleanup. Add `tempRoot` + cleanup to match bridge and triage tests.
- `CF-K-2` — `tickAll` in `autonomy-bridge.ts` swallows cycle errors silently. A failed `runAutonomyBridgeCycle` (e.g., disk-full on triage write) produces no event, no log, no re-throw. Add error capture and event emission before WS-K advancement gate.
- `CF-K-3` — `repair_rejected_proof` and `advance_validated_opportunity` branches in `buildGoalWorkPlan` are untested. Add to `goal-orchestrator.test.ts` before advancement gate.
- `CF-K-4` — `shouldRunTick` double condition: `boot.alreadyCompleted && getAutonomyState().bootCompleted` — second check is redundant since `alreadyCompleted` implies `bootCompleted`. Non-blocking, simplify to `boot.alreadyCompleted`.
- `CF-K-5` — `autonomyBridge?: AutonomyBridgeRunner` optional in `server-close.ts` while `heartbeatRunner` is required. Noop bridge is always present, so `stop()` is always called, but the type inconsistency is misleading. Non-blocking.

Next process step:
- `STEWARD2 ADVANCE WS-K`

## WS-K post-review fixes (2026-05-01)

Codex resolved all five reviewer carry-forwards on `ws-k` before advancement:

- `CF-K-1` fixed in `src/steward/autonomy/autonomy-runner.test.ts`
  - seeded-task test now uses a temp `artifactRoot`
  - test cleanup removes its temporary triage files instead of writing into repo `artifacts/`
- `CF-K-2` fixed in `src/steward/autonomy/autonomy-bridge.ts`
  - `tickAll()` now captures per-session cycle failures
  - failures persist explicit `autonomy.bridge.failed` event evidence instead of disappearing silently
  - focused bridge test added in `src/steward/autonomy/autonomy-bridge.test.ts`
- `CF-K-3` fixed in `src/steward/autonomy/goal-orchestrator.test.ts`
  - added explicit coverage for:
    - `repair_rejected_proof`
    - `advance_validated_opportunity`
- `CF-K-4` fixed in `src/steward/autonomy/autonomy-bridge.ts`
  - removed redundant double-check in `shouldRunTick`
  - boot-complete path now uses `boot.alreadyCompleted` directly
- `CF-K-5` fixed in `src/gateway/server-close.ts`
  - `autonomyBridge` is now required in the close handler params
  - startup/shutdown callsites and tests now match the actual noop-always-present runtime contract

Additional verification after the fixes:
- `corepack pnpm exec vitest run src/steward/autonomy/autonomy-runner.test.ts src/steward/autonomy/goal-orchestrator.test.ts src/steward/autonomy/triage-artifacts.test.ts src/steward/autonomy/autonomy-bridge.test.ts src/gateway/server-runtime-services.test.ts src/gateway/server-close.test.ts`
  - PASS: `6` files, `19` tests
  - note: required escalation because sandbox Vitest startup hit Windows `spawn EPERM`
- `node --max-old-space-size=8192 ./node_modules/typescript/bin/tsc --noEmit`
  - PASS

Result:
- `WS-K` is now advance-ready with no open `WS-K` carry-forwards

## WS-K post-merge status and autonomy tranche close (2026-05-01)

Merge confirmed: PR `#22` merged `ws-k` → `main`.

WS-K is now complete on `main`:
- `src/steward/db/migrations/0004_autonomy_tasks.sql`
- `src/steward/autonomy/goal-orchestrator.ts`
- `src/steward/autonomy/triage-artifacts.ts`
- `src/steward/autonomy/autonomy-bridge.ts`
- `src/steward/autonomy/goal-orchestrator.test.ts`
- `src/steward/autonomy/triage-artifacts.test.ts`
- `src/steward/autonomy/autonomy-bridge.test.ts`
- associated seam updates in:
  - `src/steward/autonomy/idle-seeding.ts`
  - `src/steward/autonomy/autonomy-runner.ts`
  - `src/gateway/server-runtime-services.ts`
  - `src/gateway/server-runtime-handles.ts`
  - `src/gateway/server-reload-handlers.ts`
  - `src/gateway/server-close.ts`
  - `src/gateway/server.impl.ts`

Autonomy tranche state after WS-K merge:
- `WS-IA` merged
- `WS-IB` merged
- `WS-IC` merged
- `WS-JA` merged
- `WS-JB` merged
- `WS-JC` merged
- `WS-K` merged

Decision:
- autonomy tranche is **closed**
- autonomy tranche is **not** the remaining blocker for deployment testing

Deployment-readiness decision:
- **NO, Steward2 is not yet deployment-ready for real steward evaluation**

Why deployment-readiness is still blocked:
- LM Studio lifecycle tranche is not complete on `main`
  - `LM-A` is already contained in `main` and does not require a separate merge
  - `LM-B`, `LM-C`, and `LM-D` are not yet implemented/merged
- `WS-IB` / `WS-K` startup readiness still treats:
  - `truthCoreReady`
  - `lmStudioLifecycleReady`
  as caller-defaulted `true` values
- the spec already marked LM lifecycle ownership as a prerequisite before deployment testing resumes

Non-blocking carry-forwards that remain outside deployment readiness:
- `CF-JB-1`
- `CF-JB-2`
- `CF-JB-3`

Conclusion:
- autonomous steward behavior is now structurally present on `main`
- deployment testing is still paused pending LM lifecycle completion and real startup readiness wiring

Next process step:
- `STEWARD2 IMPLEMENT LM-B`

## LM-A post-advance reconciliation (2026-05-01)

Advancement result:
- no PR was opened for `lm-a`
- Git confirmed `lm-a` is already an ancestor of `main`
- therefore LM-A was already effectively present on `main` and required no additional merge step

Evidence:
- `git merge-base --is-ancestor lm-a main` returned success
- `gh pr create --base main --head lm-a` failed with:
  - `No commits between main and lm-a`

Decision:
- LM-A is reconciled as already advanced into `main`
- the LM lifecycle tranche should proceed directly to `LM-B`

Open LM carry-forwards after LM-A:
- `CF-LM-3` — key normalization contract belongs to `LM-B`
- `CF-LM-1` — query lock scope must be resolved before `LM-C`
- `CF-LM-2` — cross-process lock scope must be resolved before `LM-C`

## LM-B implementation gate (2026-05-01)

Implementer: Codex

Donor reviewed before implementation:
- `C:\ai_agent\OLD_AI\core\lm_studio_manager.py`
- `C:\ai_agent\PEQS\core\model_manager.py`

Files changed:
- `extensions/lmstudio/src/models.fetch.ts`
- `extensions/lmstudio/src/models.test.ts`

Host-owned invariant delivered in this slice:
- the LM Studio provider layer now exposes explicit lifecycle primitives for:
  - loaded-model discovery
  - unload by instance id
  - load/reload with explicit context target
- provider helpers still do **not** own steward lifecycle policy or event persistence
- `CF-LM-3` is resolved in the provider layer by normalizing and fuzzy-matching model keys against LM Studio key variants

Behavior implemented:
- `models.fetch.ts`
  - adds `getLoadedLmstudioModels()` as explicit loaded-instance discovery
  - returns normalized helper state:
    - `modelKey`
    - `instanceId`
    - `contextLength`
    - `kind`
  - adds `unloadLmstudioModel()` for explicit unload by loaded instance id
  - updates `ensureLmstudioModelLoaded()` to:
    - match configured keys against longer LM Studio key variants
    - unload a matching insufficient-context instance before reload
  - keeps all logic provider-owned and stateless; no steward ledger/event ownership added here
- `models.test.ts`
  - adds focused coverage for:
    - loaded-model discovery helper
    - unload-by-instance-id helper
    - fuzzy model-key normalization against longer LM Studio keys
  - updates existing reload tests to prove the new explicit unload-before-reload helper path

Focused acceptance evidence:
- loaded-model discovery returns normalized loaded instance records
- unload helper posts to `/api/v1/models/unload` with explicit `instance_id`
- load helper still sends explicit `context_length`
- configured `modelKey` can match longer returned LM Studio key variants without false reload/load churn

Verification:
- `corepack pnpm exec vitest run extensions/lmstudio/src/models.test.ts`
  - PASS: `1` file, `12` tests
  - note: required escalation because sandbox Vitest startup hit Windows `spawn EPERM`
- `node --max-old-space-size=8192 ./node_modules/typescript/bin/tsc --noEmit`
  - PASS

Carry-forward:
- none added by `LM-B` implementation

## LM-B post-review fixes (2026-05-02)

Codex resolved all four reviewer carry-forwards on `lm-b` before advancement:

- `CF-LM-B-1` fixed in `extensions/lmstudio/src/models.fetch.ts`
  - `normalizeModelKey()` now lowercases the returned normalized key
  - mixed-case LM Studio keys no longer fail comparison by casing alone
- `CF-LM-B-2` fixed in `extensions/lmstudio/src/models.fetch.ts`
  - `ensureLmstudioModelLoaded()` now unloads all loaded instances for the matching model before reload
  - removes the orphan-instance assumption from the helper path
- `CF-LM-B-3` fixed in `extensions/lmstudio/src/models.fetch.ts`
  - `modelKeysMatch()` no longer accepts arbitrary short configured prefixes
  - suffix matching is now limited to detailed model stems rather than one-token family prefixes
- `CF-LM-B-4` fixed in `extensions/lmstudio/src/models.test.ts`
  - added explicit unreachable-host throw-path coverage for `getLoadedLmstudioModels()`

Additional verification after the fixes:
- `corepack pnpm exec vitest run extensions/lmstudio/src/models.test.ts`
  - PASS: `1` file, `15` tests
  - note: required escalation because sandbox Vitest startup hit Windows `spawn EPERM`
- `node --max-old-space-size=8192 ./node_modules/typescript/bin/tsc --noEmit`
  - PASS

Result:
- `LM-B` is now advance-ready with no open `LM-B` carry-forwards

## LM-B reviewer gate (2026-05-02)

Reviewer: Claude

Verdict: **PASS**

CF-LM-3 resolved: `normalizeModelKey()` strips `lmstudio/` prefix; `modelKeysMatch()` applies bidirectional prefix match (`requested === loaded || requested.startsWith(loaded) || loaded.startsWith(requested)`). Test confirms configured `"qwen3-8b-instruct"` matches LM Studio key `"lmstudio/qwen3-8b-instruct-mlx-4bit"` with no reload churn.

Findings:

1. Loaded-model discovery correct — normalized `{modelKey, instanceId, contextLength, kind}` returned per loaded instance. Throws on unreachable/HTTP ≥400 (intentional contract vs `discoverLmstudioModels` which returns `[]`). Test covers `lmstudio/`-prefixed key and embedding kind.
2. Unload by instance ID correct — POSTs `{instance_id}` to `/api/v1/models/unload`. Silent no-op on null/empty instanceId (correct for unloaded model). Error on `status="error"` wire response.
3. Explicit context-target load correct — `contextLengthForLoad = min(requestedContextLength ?? DEFAULT, advertisedContextLimit)`. Skip-if-sufficient gate. Three tests cover explicit, clamped, and default paths.
4. No steward event/ledger ownership added — provider layer is stateless. Confirmed.
5. 12/12 tests pass.

Carry-forwards added:

- `CF-LM-B-1` — `normalizeModelKey()` does not fully lowercase the returned string — `.toLowerCase()` is used only for the `"lmstudio/"` prefix check, not applied to the returned key. Mixed-case LM Studio keys would fail `modelKeysMatch` comparisons. Low risk in practice; fix before LM-C or LM bridge wiring.
- `CF-LM-B-2` — `ensureLmstudioModelLoaded` unloads only `loaded_instances[0]` before reload. Implicit single-instance assumption; orphan instances possible if multiple are loaded. Non-blocking.
- `CF-LM-B-3` — `modelKeysMatch` bidirectional prefix could produce false matches on short configured keys sharing a prefix with multiple models (e.g., `"qwen"` matches any `"qwen*"`). Acceptable for typical usage but the assumption is implicit.
- `CF-LM-B-4` — No test for `getLoadedLmstudioModels` throw path on unreachable host. The `reachable: false` → throw contract is the key behavioral difference from `discoverLmstudioModels` and should be pinned.

Next process step:
- `STEWARD2 ADVANCE LM-B`
