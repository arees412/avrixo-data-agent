# Avrixo Fork Changes

This file lists implemented Avrixo-specific engineering only. Planned or deployment-dependent capabilities are excluded.

## Governed Planning and SQL

- Typed `QueryPlan` model with intent, entities, metrics, dimensions, filters, ordering, limit, confidence, and rationale
- Deterministic metric-first planner for the bundled sample questions
- Configurable high/medium confidence execution gate with fail-closed clarification behavior
- SQL parser validation for SQLite and PostgreSQL
- single-statement and SELECT-only enforcement
- explicit rejection of data mutation, DDL, access-control, copy, attachment, pragma, and maintenance commands
- outer result-limit wrapper applied independently of generated SQL

## Data Sources

- shared `DataSourceAdapter` interface for introspection, read-only execution, health checks, dialect, identity, and capabilities
- SQLite read-only adapter with `query_only`, disabled trusted schema, parameter binding, result limits, and a worker that is terminated on timeout
- PostgreSQL adapter with `BEGIN READ ONLY`, transaction-local statement timeout, parameter binding, result limits, unconditional rollback, and injected-client tests

## Semantic and Privacy Governance

- validated, versioned sample metric registry and resolver
- semantic checks for duplicate metric/measure names, unknown entities or dimensions, broken join fields, and unknown expression fields
- sample metric owner, source, allowed dimensions, synonyms, and version metadata
- privacy policy validation and model-visible schema filtering for PII/restricted fields
- parameterized row-policy predicate abstraction that fails closed when context is absent

## Analytics, Charts, and Insights

- deterministic descriptive statistics, ranking, percentage change, trends, and two-standard-deviation anomaly flags
- typed bar, line, pie, table, and scatter chart schema
- chart-column validation against returned query columns
- facts/observations/interpretation separation
- numerical grounding that rejects unsupported numeric claims
- validated-results-only CSV export with escaping, declared-column filtering, and formula-prefix neutralization

## Audit, Evaluation, UI, and Delivery

- typed audit events with query context, source, duration, row count, provider metadata, outcome, and sanitized errors
- recursive secret redaction plus in-memory and append-only JSONL stores
- lightweight per-analysis observability fields
- deterministic evaluation harness for semantic resolution, metric choice, SQL structure/safety, chart validity, and grounding
- deterministic safe and unsafe end-to-end flows
- governed analytics workspace and `/api/analyze` route that require no paid model
- fork-specific tests, CI, secret scanning, documentation-link checks, and semantic validation

## Explicit Non-Claims

- No production database or private dataset is bundled.
- No live PostgreSQL server is contacted by CI; protocol behavior is tested with an injected client.
- No enterprise authentication, workspace isolation, or full tenant enforcement is claimed.
- No distributed audit store, external observability backend, or compliance certification is claimed.
- No sophisticated machine-learning anomaly detection is claimed.
- The inherited Vercel Sandbox and general AI SDK foundation are not claimed as Avrixo work.
