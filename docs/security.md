# Security

## Implemented Controls

### Read-only enforcement

Every governed query is parsed for its dialect, must have a `select` AST root, and must contain only one statement. A lexical fail-closed check rejects mutation, DDL, grants, revokes, copy, SQLite attachment/pragma, vacuum, and related commands even when parser behavior varies. The AST is also traversed to reject PostgreSQL `SELECT INTO` table creation.

SQLite opens in read-only mode, enables `query_only`, disables trusted schema, and runs in a terminable worker. PostgreSQL runs inside `BEGIN READ ONLY`, sets a transaction-local timeout, and always rolls back. Production deployments should additionally use a database role with only the minimum `SELECT` grants.

### SQL injection and parameters

Row-policy values and adapter parameters are passed separately from SQL. Identifiers originate from validated semantic definitions, not request values. The deterministic compiler supports only registered query shapes. New dynamic filters must retain parameter binding and identifier allowlists.

### Query limits and timeouts

An outer query wrapper caps returned rows even if generated SQL specifies a higher limit. SQLite work is terminated with its worker when the timeout expires. PostgreSQL uses `statement_timeout` inside the read-only transaction. These controls limit result volume and wall time, but they do not replace database workload management or statement-cost policies.

### Schema and sensitive columns

Privacy policies classify fields, omit forbidden fields from model-visible schemas, and never include sample values in introspection results. The sample policy marks email as PII and hides birth date while withholding salary. A reusable parameterized row-policy abstraction fails closed when its required context is missing.

The project does not include user authentication or workspace identity. A deployer must bind row-policy context to verified server-side identity before treating it as tenant isolation.

### Output grounding

Chart fields must exist in the returned column set. Every numeric token in an executive narrative must match query data or deterministic analytics within a narrow tolerance. Qualitative causal interpretation remains explicitly separated from facts.

### Credentials, logs, and errors

Credentials are runtime configuration only. Audit redaction recursively masks secret-bearing keys, bearer tokens, and credentialed PostgreSQL URLs. Errors are sanitized and length-bounded before storage. Do not log raw request headers, connection strings, or database driver objects.

### Sandbox boundary

The upstream repository exposed general bash tooling inside Vercel Sandbox for semantic exploration. The governed Avrixo path does not expose arbitrary shell execution. It uses structured YAML loading and a path-confined semantic reader. The inherited sandbox module remains outside the deterministic path and must be treated as trusted-development functionality.

## Threats and Residual Risk

- SQL parsers can have dialect gaps. Keep the forbidden-operation check, parser, database read-only role, timeouts, and row caps as independent layers.
- A row cap does not prevent an expensive inner scan. Production PostgreSQL should use workload controls; large SQLite datasets should use isolated resources.
- Numeric grounding does not prove that a metric definition is correct. Metric owners must review formulas and versions.
- Local JSONL is not tamper-evident, distributed, or durable in serverless deployments.
- The optional AI SDK route requires provider-specific security review and rate limiting before Internet exposure.
- Schema filtering is not encryption and does not enforce access inside the database.

## Deployment Responsibilities

Deployers must provide least-privilege database users, TLS, secret management, authentication, authorization, tenant-context binding, retention rules, tamper-resistant audit storage, monitoring, dependency patching, and incident response. The repository does not claim GDPR, HIPAA, SOC 2, or other compliance certification.
