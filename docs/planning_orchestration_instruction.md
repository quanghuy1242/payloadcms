# Feature Planning and Orchestration Instruction

## Purpose

Use this instruction file when the task is to:

- plan a new feature
- plan a refactor
- plan a cross-repo integration
- produce a handoff document for a weaker implementation model
- orchestrate execution work across this repo and related repos

This instruction is for planning mode and execution-orchestration mode. It is intentionally strict. The goal is to prevent shallow plans, missed edge cases, bad repo assumptions, and vague handoffs.

## Primary Goal

Produce a plan and orchestration guide that a weak implementation model can follow with minimal guesswork and minimal room for architectural mistakes.

The plan must be:

- repo-grounded
- file-specific
- explicit about risks and edge cases
- explicit about ownership boundaries
- explicit about verification
- explicit about generated-file and migration discipline

## Repos and Cross-Domain Context

This project does not live alone.

Always remember:

- this repo is the CMS: `payloadcms`
- auth service lives in: `auther`
- blog consumer lives in: `next-blog`

If a feature crosses boundaries:

1. inspect the local repo first
2. inspect the sibling repo(s) directly if available in the workspace
3. if needed, use GitHub tools to inspect remote state or confirm cross-repo contracts
4. include recommendations or required changes for the other repo(s)

Do not write a plan as if this repo is isolated when the feature clearly spans domains.

## Hard Planning Rules

1. Never plan from memory when the codebase can be inspected.
2. Never assume a doc is current without comparing it to the actual code.
3. Never write a “generic architecture” plan detached from actual files.
4. Never leave cross-repo integration as “to be figured out later” if the dependency is obvious now.
5. Never hide uncertainty. If something is ambiguous, call it out explicitly.
6. Never omit migrations, generated files, access control, or verification if they are relevant.
7. Never recommend route handlers under `src/app/api/` for business logic when project rules require GraphQL extensions instead.
8. Never recommend direct browser calls to protected backend systems if the existing architecture already uses a safer proxy pattern.
9. Never ignore Turso/SQLite query-shape and index concerns for new collections or new hot-path queries.
10. Never end a plan with vague phrases like “then implement UI” or “add tests as needed.”

## Mandatory Pre-Planning Workflow

Before writing the plan, do the following in order.

### 1. Read the request carefully

Extract:

- exact scope
- what is explicitly in scope
- what is explicitly out of scope
- whether the user wants planning only or implementation too
- whether they want a handoff for a weaker model

### 2. Read repo instructions

Always review:

- `AGENTS.md`
- any user-provided instructions in the prompt
- skill instructions that are clearly relevant

### 3. Inspect actual code

At minimum:

- inspect the relevant collections
- inspect the relevant utils
- inspect GraphQL registration and adjacent resolvers
- inspect admin or frontend entry points
- inspect existing tests in the same area
- inspect generated-file and migration patterns if schema changes are likely

### 4. Identify the owning layers

Map the change to the correct layer(s):

- `src/collections/`
- `src/utils/`
- `src/graphql/`
- `src/components/admin/`
- `src/lib/`
- `next-blog/pages/`
- `next-blog/common/apis/`
- `next-blog/components/`
- `auther` if needed

State what belongs where, and what must not be touched.

### 5. Inspect neighboring implemented features

If similar features already exist, inspect them and reuse their patterns.

Examples:

- user-scoped collections
- existing GraphQL query/mutation structure
- same-origin blog API proxy routes
- auth forwarding patterns
- password-proof forwarding patterns
- admin button or moderation patterns

### 6. Identify cross-repo contracts

For any feature that touches:

- auth
- blog rendering
- preview
- gated content
- shared URLs
- token forwarding

You must identify:

- which repo owns the logic
- which repo consumes the output
- what request or response contract is needed
- what env vars or secrets are involved

### 7. Inspect performance-sensitive query paths

If the feature adds:

- a new collection
- a new filterable list
- a new moderation queue
- a new timeline or thread

Then you must analyze:

- likely hot-path filters
- likely sort order
- required field indexes
- likely compound indexes
- whether query shape is index-friendly

### 8. Inspect test surface

Find:

- closest existing integration test files
- closest frontend/component test files
- whether a new test file is needed
- whether targeted tests are enough or E2E is needed

## Skills to Load

Load relevant skills when applicable. At minimum, consider:

- `architecture-scout`
- `access-control-checker`
- `utility-extraction-adviser`
- `test-strategy-chooser`
- `migration-env-checker`
- `verification-gate`

Load additional domain-specific skills when the feature touches those areas.

## Required Output Standards for the Plan

The plan must not be a short summary. It must be an implementation-grade handoff.

Every serious plan must include these sections unless clearly not applicable.

### 1. Scope

Must include:

- goal
- in-scope behavior
- out-of-scope behavior

### 2. Current-State Findings

Must include:

- what already exists
- what patterns are already implemented
- where the original assumptions do not match the current code

### 3. Architecture Decision

Must include:

- chosen approach
- why this approach fits the current repo
- why obvious alternatives were rejected

### 4. Responsibility Split

Must include:

- which repo owns what
- which layer owns what
- what should not be implemented in the wrong place

### 5. Data Model Plan

For schema-related work, include:

- collection or field changes
- exact fields
- indexes
- access strategy
- hooks
- invariants
- migration implications

### 6. API / Contract Plan

If the feature touches GraphQL, API routes, or cross-repo calls, include:

- exact query or mutation names
- exact args
- exact return shapes
- exact HTTP route contract if applicable
- error mapping rules

### 7. Access / Auth Plan

Must include:

- who can read
- who can write
- who can moderate or administer
- what happens for anonymous users
- any role restrictions
- any grant inheritance behavior
- any token or cookie forwarding requirements

### 8. Performance / Database Plan

Must include where relevant:

- field indexes
- compound indexes
- hot-path query shape
- limits or pagination caps
- admin queue performance guidance
- query-plan verification expectations

### 9. Exact File Checklist

This is mandatory for handoffs to weaker models.

For every file to add or edit, include:

- exact path
- what must be added
- what it must export if relevant
- what it must not do

### 10. Phase Breakdown / WBS

Break the work into phases.

Each phase must have:

- deliverables
- tasks
- exit criteria

### 11. Edge Cases

List specific edge cases. Do not write “handle edge cases.”

Examples:

- auth lost between page load and submit
- target deleted
- password-protected resource
- invalid parent-child relationship
- duplicate or conflicting inputs
- rejected moderation state

### 12. Failure Modes

List likely implementation mistakes and how to correct them.

This is mandatory when the user wants a weak-model handoff.

### 13. Testing Plan

Must include:

- which repo(s) need tests
- exact file(s) to add or extend
- specific assertions to cover

### 14. Verification Commands

Must include exact commands for:

- type checking
- targeted tests
- full tests if appropriate
- generated files
- migration status

### 15. Definition of Done

Must explicitly state what must be true before the work is considered complete.

## Required Orchestration Standards

If the task is not only planning but also orchestrating execution, the orchestration guide must include:

- execution order
- dependencies between phases
- what can be parallelized
- what must wait for schema completion
- what must wait for API completion
- what must be verified before moving on

## Execution Sequencing Rules

Default sequencing for feature work:

1. alignment and repo survey
2. schema and utility foundation
3. API / GraphQL contract
4. migration and generated files
5. consumer-side adapter layer
6. UI integration
7. tests
8. verification

Do not start UI planning before the data and API contracts are stable.

## Dump-Model-Proofing Rules

If the user explicitly says the implementation model is weak or “dumb,” the plan must add:

1. `Non-Negotiables`
2. `Exact File Checklist`
3. pseudocode for critical resolvers or routes
4. explicit error mapping
5. explicit “must not do” bullets
6. explicit definition of done

## Planning for This Repo Specifically

When planning for this repo, always remember:

1. Shared logic belongs in `src/utils/`.
2. Collection files should stay thin.
3. Custom business logic should use GraphQL extensions, not ad hoc REST routes in the CMS.
4. Generated files must not be edited manually.
5. Environment access must go through the env layer.
6. Access rules must reuse existing helpers where possible.
7. Migration implications must be called out whenever schema changes are involved.
8. If admin component paths are added or moved, mention `pnpm generate:importmap`.
9. If schema changes occur, mention `pnpm generate:types`.
10. If Turso query paths are introduced, include index and query-plan guidance.

## Required Planning Template

Use this structure unless the task is truly trivial.

```md
# <Feature Name> Plan

## Scope
## Current-State Findings
## Architecture Decision
## Cross-Repo Responsibility Split
## Data Model Plan
## Access / Auth Plan
## API / Contract Plan
## Database and Performance Plan
## Exact File Checklist
## Work Breakdown Structure
## Edge Cases
## Failure Modes
## Testing Plan
## Verification Commands
## Definition of Done
## Pseudocode Appendix
```

## Required Depth Heuristic

Use this heuristic:

- if the change touches one file and no contracts: a short plan is fine
- if it touches schema, GraphQL, UI, auth, or another repo: write the full plan
- if the user explicitly wants a handoff: always write the full plan

## Orchestration Deliverable Format

If the user asks you to orchestrate execution for another model, include:

- the plan document
- the exact file checklist
- the ordered execution phases
- the likely failure modes
- the final verification block

## Anti-Patterns to Avoid in Plans

Do not write plans that:

- only describe intent without file paths
- say “follow existing patterns” without naming the pattern location
- omit tests
- omit migrations
- omit access rules
- omit generated files
- omit other repos affected by the change
- omit performance guidance on new collections
- leave the implementation model to choose architecture freely

## Minimum Verification for Planning-Only Work

If you only edited docs or instruction files, still run:

```bash
pnpm tsc --noEmit
```

If the planning task also changed schema or code, include the full verification set in the plan.

## Final Instruction

When asked to plan or orchestrate feature work, follow this file strictly.

The plan must reduce ambiguity, not summarize it.
