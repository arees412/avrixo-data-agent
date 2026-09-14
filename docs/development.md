# Development

## Prerequisites

- Node.js 20.x, matching `.nvmrc`
- pnpm 8.15.0, matching `packageManager`
- No paid AI provider is required for tests, evaluation, E2E, or the deterministic workspace

## Install and Run

```bash
pnpm install
pnpm initDatabase
pnpm dev
```

The sample initializer creates `data/oss-data-analyst.db`. The committed database and all generated records are demonstration data.

## Environment

Copy `env.local.example` to `.env.local` only when optional runtime configuration is needed. Do not commit `.env`, `.env.local`, credentials, authorization headers, or production connection strings.

The deterministic SQLite path needs no credentials. A real PostgreSQL deployment supplies `POSTGRES_URL` through its secret manager. The automated PostgreSQL adapter test injects a fake client and does not open a network connection.

## Semantic Layer

Entity YAML lives in `src/semantic/entities`. Governed sample metrics live in `src/semantic/metrics.yml`; privacy rules live in `src/semantic/privacy.yml`.

Each metric requires a stable snake-case name, label, description, entity, SQL expression, format, allowed dimensions, owner, source, semantic version, and explicit `sample` marker. Validate changes with:

```bash
pnpm validate:semantic
```

Validation fails on duplicate metrics, unknown entities or dimensions, broken join fields, and unknown expression fields.

## SQLite

Use `SQLiteAdapter` with an existing database path. The adapter does not create or migrate databases. Query execution happens in a read-only worker with a hard timeout and outer row cap.

## PostgreSQL

Use `PostgreSQLAdapter` with a connection string or injected pool. The adapter wraps every analytical statement in a read-only transaction and rolls it back. Configure a least-privilege production role even though the adapter also enforces read-only behavior.

## Deterministic Provider and Evaluation

The governed `/api/analyze` path uses deterministic planning and narrative construction for bundled sample questions. This is the CI-safe fake-provider role: no remote model is called.

```bash
pnpm evaluate
pnpm e2e
```

The evaluation suite checks semantic resolution, metric choice, SQL structure and safety, chart columns, and numeric grounding. The E2E script executes the safe monthly revenue flow and proves the unsafe delete flow is rejected before execution.

## Tests and Full Validation

Formatting checks cover the Avrixo-maintained surfaces listed in `package.json`. The inherited UI library is intentionally left byte-for-byte unchanged outside targeted integration files so the fork diff remains attributable and reviewable.

```bash
pnpm format
pnpm lint
pnpm type-check
pnpm test
pnpm validate:semantic
pnpm evaluate
pnpm e2e
pnpm build
pnpm scan:secrets
pnpm validate:docs
```

Tests use temporary local SQLite files and an injected PostgreSQL client. They do not use production databases, private data, paid APIs, or external services.

## Troubleshooting

- Native SQLite install failure: confirm Node 20 and reinstall dependencies for the current platform.
- SQL parse rejection: confirm the query is a single dialect-valid `SELECT`; do not weaken the policy to accept a mutation.
- Semantic validation failure: inspect the reported entity, field, join, or metric name.
- PostgreSQL timeout: tune the bounded application setting and database workload policy rather than disabling the timeout.
- Build requests a provider key: the deterministic path should not; check that build-time code does not call the optional AI route.
