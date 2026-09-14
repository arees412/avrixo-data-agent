# Architecture

## Governed Analytics Pipeline

```mermaid
flowchart TD
  User[User] --> API[Analytics API and workspace]
  API --> Planner[Intent and typed query planner]
  Planner --> Resolver[Semantic resolver]
  Resolver --> Registry[Metric registry]
  Registry --> Generator[Dialect-aware SQL generator]
  Generator --> Safety[SQL safety layer]
  Safety --> Adapter[Data source adapter]
  Adapter --> SQLite[(SQLite)]
  Adapter --> PostgreSQL[(PostgreSQL)]
  SQLite --> Result[Result validator]
  PostgreSQL --> Result
  Result --> Analytics[Deterministic analytics engine]
  Analytics --> Chart[Chart validator and controlled renderer]
  Chart --> Insight[Grounded insight generator]
  Insight --> Response[Analysis response and history]
  Privacy[Privacy and row policies] -.-> Resolver
  Privacy -.-> Adapter
  Audit[Audit store] -.-> API
  Eval[Evaluation harness] -.-> Planner
  Observe[Observability] -.-> Response
```

## Components

The deterministic path begins at `POST /api/analyze`. A typed planner resolves a registered metric, emits a bounded plan, and requires sufficient confidence. The compiler supports only registered deterministic query shapes. This narrow surface is intentional: unsupported questions request clarification instead of creating uncontrolled SQL.

`validateReadOnlySql` parses the candidate for the selected dialect, rejects multiple statements and forbidden operations, requires a `select` AST root, and wraps the statement in an outer result cap. The adapters independently enforce database-side read-only behavior and time bounds.

The SQLite adapter opens the database read-only inside a worker, enables `query_only`, disables trusted-schema execution, and terminates the worker on timeout. The PostgreSQL adapter opens a read-only transaction, sets a transaction-local statement timeout, executes parameters separately, and always rolls back.

Result columns govern chart validity. The UI renders the accepted bar or line specification with the already validated rows. Deterministic analytics compute statistics and trends. The insight generator separates facts, observations, and interpretation, then checks every numeric token against result or computed evidence before returning it.

## Trust Boundaries

```mermaid
flowchart LR
  Question[Untrusted question] --> Plan[Constrained planner]
  Model[Optional model output] --> Policy[SQL policy]
  Plan --> Policy
  Policy -->|accepted SELECT only| DB[Read-only database session]
  DB --> Rows[Bounded result rows]
  Rows --> Ground[Chart and numeric grounding]
  Ground --> UI[Workspace]
  Secrets[Runtime secrets] -. never logged .-> DB
  PII[Restricted schema fields] -. filtered .-> Model
```

Questions and optional model output are untrusted. The SQL policy, not a prompt, is the authority boundary. Database roles remain a separate deployment control. Query results are bounded before they can enter analytics or model context. Credentials never enter plans or audit events.

## Persistence and History

The demo UI keeps a bounded client-session history. `JsonlAuditStore` provides an append-only local option with restrictive creation mode. Serverless and multi-node deployments must supply a durable centralized audit implementation. PostgreSQL is a query data source, not application persistence.

## Inherited Sandbox Trade-off

The upstream Vercel Sandbox module remains for attribution and trusted experiments. The Avrixo deterministic path does not expose general shell commands to user questions. Structured semantic catalog reads replace raw shell exploration. This reduces flexibility but creates a stronger, testable trust boundary.
