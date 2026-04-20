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

Current phase: **implement Workstream A**.

Keep all Steward2 work separate from the unstable legacy PEQS Phase `5.x` work.

Current decision:
- `Steward2` is OpenClaw-first, not PEQS-first
- OpenClaw is the product/gateway/session foundation
- Steward semantics are layered in deliberately as an inner control core

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
| B | Truth audit | `analyze` | `no` | depends on `A`, `G`; no local blocker beyond upstream readiness |
| C | Proof judge | `analyze` | `no` | `BD-4`; depends on `A`, `B`, `G` |
| D | Consequence logic | `analyze` | `no` | `BD-4`, `BD-6`, `BD-8`; depends on `A`, `F`, `G` |
| E | Stewardship mission / operator hierarchy | `analyze` | `no` | `BD-4` for LLM-scored parts; depends on `A`; `stewardship-core.ts` may start only after A is confirmed |
| F | Tool supervisor | `advance-ready` | `yes` | depends on `A`; no local blocker beyond upstream readiness |
| G | Relationship memory / knowledge store | `analyze` | `yes` | resolved: `BD-3`; depends on `A` (confirmed) |
| H | Maintenance governor / metacog monitor | `analyze` | `no` | depends on `A`, `E`, `G`; no local blocker beyond upstream readiness |

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
- `postcheck()` (result normalization) is not in WS-F scope; deferred to before WS-B or WS-D consumes normalized tool artifacts
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
- [core/relationship_memory.py](C:\ai_agent\PEQS\core\relationship_memory.py) — 8 memory types with salience weights: operator_boundary (1.0), operator_preference (0.95), truth_reinforced (0.9), truth_violation (0.8), shared_thread (0.8), household_routine (0.75), stewardship_ledger (0.7), operator_override (0.6); `recall()` returns salience-weighted entries (similarity × importance × recency × weight); `inject_current_context()` injects into prompts; `reinforce_truth()` adjusts confidence; first-contact bootstrap (5 initial memories)
- [core/knowledge.py](C:\ai_agent\PEQS\core\knowledge.py) — vector similarity search over knowledge entries; `store(text, metadata, db)` stores with embeddings; `search(query, db, top_k)` returns ranked results; used by relationship_memory, proof_knowledge, and goals
- [core/skills.py](C:\ai_agent\PEQS\core\skills.py) — `extract()` saves successful tool sequences as JSON per task; `match()` Jaccard similarity against saved sequences to surface best match for a new task title; `load_skills_for_task_type()` loads vault markdown skill files as prompt context; file-based storage becomes DB-backed via `steward_knowledge` table

OpenClaw target seams:
- `src/agents/memory-search.ts` — memory retrieval before context injection; truth-audited entries must be surfaced here
- session store write path — operator preferences and session continuity persisted here
- active-memory plugin structure

ii-agent donor references:
- [docs/database-design.md](C:\ai_agent\Steward2_ii_agent\docs\database-design.md)
- session-related modules under `src/ii_agent/sessions/` when implementation starts

ii-agent inspiration use:
- richer session/message/run schema expectations and durable runtime artifact storage shape

Steward2 target modules:
- `src/steward/memory/relationship-memory.ts` — 8-type memory store with salience scoring; `recall()`, `store()`, `inject()`, `reinforceTruth()`
- `src/steward/memory/memory-types.ts` — enum and weight constants for memory types
- `src/steward/memory/knowledge-store.ts` — vector store backed by `sqlite-vec`; `store(text, metadata, embedder?)`, `search(query, options?)`, `retrieveSimilar()`
- `src/steward/memory/embedder.ts` — injectable embedder interface `(text: string) => Promise<Float32Array>`; SHA-256 deterministic fallback (dim=768, tags `fallback_embed: true`); LMStudio-compatible real embedder via `STEWARD_EMBED_URL` env var
- `src/steward/memory/memory-schema.ts` — DB schema for `steward_knowledge` and `steward_memories` tables
- `src/steward/memory/skills.ts` — extract and store successful tool sequences (memory_type=skill_sequence in `steward_knowledge`); Jaccard match for new task titles; skill context loader for prompt assembly

Port shape:
- relationship_memory is a direct port with OpenClaw session key as the primary identity anchor
- vector store: `sqlite-vec` (resolved BD-3); embedder: injectable function with SHA-256 fallback default and LMStudio-compatible real embedder via `STEWARD_EMBED_URL`
- proof_knowledge.py (Workstream C) is a specialization of knowledge store — do not duplicate; share the knowledge-store.ts module

Responsibilities:
- store and retrieve operator preferences, boundaries, shared threads, stewardship ledger entries
- store and retrieve truth violations and truth reinforcements (feeds back into truth audit and stewardship audit)
- store and retrieve operator override events (feeds into time budget fatigue tracking)
- provide vector similarity search for proof examples, truth claims, and session context
- inject relevant memories into agent prompts at session start

Dependencies:
- Workstream A: DB schema; `steward_knowledge` and `steward_memories` tables
- must be in place before Workstream B (truth audit persistence), Workstream C (proof examples), and Workstream D (override event persistence)

Blocking decision:
- embedding strategy: resolved in BD-3 — `sqlite-vec` for storage; injectable embedder with SHA-256 deterministic fallback; real embedder via `STEWARD_EMBED_URL` (LMStudio `/v1/embeddings` compatible)

Acceptance:
- `recall(sessionKey, query, memoryType?)` returns salience-sorted entries from DB
- `store(sessionKey, text, memoryType, metadata)` persists to DB with embedding
- truth_violation and truth_reinforced entries are queryable by session, task, and time window
- proof examples are retrievable by task_type with similarity ranking
- memory injection produces a consistent, bounded context string for prompt assembly

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

Decision: **OPEN**

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

Decision: **OPEN**

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

Decision: **OPEN** — requires enumerating OpenClaw tool IDs from `src/acp/approval-classifier.ts` and `src/agents/`

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

## Current tasks

Current phase: **resolve BD-3 to open Workstream G**.

Immediate next tasks:
1. resolve `BD-3` (knowledge store / embedding strategy) so `WS-G` can enter `implement`
2. once `BD-3` is resolved, update the status board: `WS-G` → `implement`
3. resolve BD-4 before the first LLM-dependent steward module starts
4. resolve BD-8 before Workstream D starts; write `tool-taxonomy.ts` artifact

Not yet approved:
- direct code port of downstream workstreams beyond the active Workstream F slice
- `postcheck()` result normalization (from `tool_supervisor.py`): must be implemented as `src/steward/tool/postcheck-rules.ts` before Workstream B (truth audit) or Workstream D (consequence logic) consumes normalized tool output artifacts
- any LLM-dependent steward module before `BD-4` is resolved
- Workstream G before `BD-3` is resolved
- Workstream D before `BD-8` is resolved, and Workstream D acceptance before `BD-6` is resolved
