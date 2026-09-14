# Upstream Record

## Audited Source

- Original project: `vercel-labs/oss-data-analyst`
- Original repository: https://github.com/vercel-labs/oss-data-analyst
- Default branch at audit: `main`
- Base revision: `af11371c872d79b7ad3d3d2e794fa339dd94e160`
- Base commit subject: `Update usage of bash tools and sandbox`
- License: MIT
- Inherited LICENSE SHA-256: `b44c87f36db2fb9515086cd4cda151287e3c36fc0a48650ec9554f22b3571d3e`
- Audit date: 2026-09-11
- Last browser revalidation: 2026-09-14 (default branch `main`, latest commit still `af11371`)

The MIT license permits use, modification, and redistribution while requiring preservation of its copyright and permission notice. `LICENSE` is intentionally unchanged in this fork.

## Audited Upstream Architecture

At the recorded revision, the repository used:

- Next.js 15.5.9 and React 18
- Vercel AI SDK 6.0.33
- Vercel Sandbox and `bash-tool` for semantic file exploration
- `better-sqlite3` with the bundled `data/oss-data-analyst.db`
- YAML entity definitions in `src/semantic`
- Node.js 20 and pnpm 8.15.0
- Vitest configuration, but no committed upstream test files or `test` package script
- no committed `.github/workflows` CI configuration
- `.env*` ignore rules and an environment example without production secrets

The package manifest also contained PostgreSQL and SQL-parser libraries plus an unwired Snowflake service. Their presence is inherited; it did not constitute an upstream governed adapter abstraction.

## Upstream Execution and Security Boundaries

The inherited agent prompt instructed the model to produce SQLite `SELECT` queries and use `LIMIT 1001`. The actual `src/lib/sqlite.ts` execution branch ran non-SELECT statements with `prepare(...).run()`. Therefore, the upstream read-only guarantee was prompt-level rather than a programmatic enforcement boundary.

The inherited sandbox separated remote shell work from the Next.js process, but the model-facing bash tool exposed general shell semantics for schema exploration. The Avrixo governed path replaces model-facing shell exploration with structured catalog access and keeps the upstream sandbox module as inherited code outside deterministic execution.

## Attribution Boundary

Vercel Labs and upstream contributors authored the original application, UI components, Vercel AI SDK integration, sandbox foundation, SQLite sample schema/database, and YAML entity catalog. Avrixo claims only the additions listed in [FORK_CHANGES.md](FORK_CHANGES.md).
