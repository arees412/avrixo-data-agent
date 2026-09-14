import Database from "better-sqlite3";
import { Worker } from "node:worker_threads";
import { resolve } from "node:path";
import { validateReadOnlySql } from "../sql-policy";
import type {
  DataSourceAdapter,
  DataSourceCapabilities,
  ExecuteReadOnlyOptions,
  QueryResult,
  SchemaTable,
} from "../types";
import { DEFAULT_QUERY_LIMITS } from "../types";

const WORKER_SOURCE = String.raw`
const { parentPort, workerData } = require("node:worker_threads");
const Database = require("better-sqlite3");
let database;
try {
  database = new Database(workerData.databasePath, {
    readonly: true,
    fileMustExist: true,
  });
  database.pragma("query_only = ON");
  database.pragma("trusted_schema = OFF");
  const statement = database.prepare(workerData.sql);
  const rows = statement.all(...workerData.parameters);
  const columns = statement.columns().map((column) => column.name);
  parentPort.postMessage({ ok: true, rows, columns });
} catch (error) {
  parentPort.postMessage({
    ok: false,
    error: error instanceof Error ? error.message : "SQLite query failed",
  });
} finally {
  if (database) database.close();
}
`;

interface WorkerSuccess {
  ok: true;
  rows: Array<Record<string, unknown>>;
  columns: string[];
}

interface WorkerFailure {
  ok: false;
  error: string;
}

function runWorker(
  databasePath: string,
  sql: string,
  parameters: unknown[],
  timeoutMs: number,
): Promise<WorkerSuccess> {
  return new Promise((resolveWorker, rejectWorker) => {
    const worker = new Worker(WORKER_SOURCE, {
      eval: true,
      workerData: { databasePath, sql, parameters },
    });
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      void worker.terminate();
      rejectWorker(new Error(`SQLite query exceeded ${timeoutMs}ms timeout`));
    }, timeoutMs);

    worker.once("message", (message: WorkerSuccess | WorkerFailure) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      void worker.terminate();
      if (message.ok) resolveWorker(message);
      else rejectWorker(new Error(`SQLite query failed: ${message.error}`));
    });
    worker.once("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      rejectWorker(error);
    });
  });
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

export class SQLiteAdapter implements DataSourceAdapter {
  private readonly databasePath: string;

  constructor(databasePath: string) {
    this.databasePath = resolve(databasePath);
  }

  identifier(): string {
    return "sqlite:local";
  }

  dialect(): "sqlite" {
    return "sqlite";
  }

  capabilities(): DataSourceCapabilities {
    return {
      readonlySql: true,
      queryTimeout: true,
      schemaIntrospection: true,
      parameterizedQueries: true,
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.executeReadOnly("SELECT 1 AS healthy", {
        maxRows: 1,
        timeoutMs: 1_000,
      });
      return true;
    } catch {
      return false;
    }
  }

  async introspectSchema(): Promise<SchemaTable[]> {
    const database = new Database(this.databasePath, {
      readonly: true,
      fileMustExist: true,
    });
    try {
      database.pragma("query_only = ON");
      database.pragma("trusted_schema = OFF");
      const tables = database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
        )
        .all() as Array<{ name: string }>;

      return tables.map(({ name }) => {
        const columns = database
          .prepare(`PRAGMA table_info(${quoteIdentifier(name)})`)
          .all() as Array<{
          name: string;
          type: string;
          notnull: 0 | 1;
        }>;
        return {
          name,
          schema: "main",
          columns: columns.map((column) => ({
            name: column.name,
            dataType: column.type || "unknown",
            nullable: column.notnull === 0,
          })),
        };
      });
    } finally {
      database.close();
    }
  }

  async executeReadOnly(
    sql: string,
    options: ExecuteReadOnlyOptions = {},
  ): Promise<QueryResult> {
    const validated = validateReadOnlySql(sql, "sqlite", {
      maxRows: options.maxRows ?? DEFAULT_QUERY_LIMITS.maxRows,
      timeoutMs: options.timeoutMs ?? DEFAULT_QUERY_LIMITS.timeoutMs,
    });
    const startedAt = performance.now();
    const result = await runWorker(
      this.databasePath,
      validated.executableSql,
      options.parameters ?? [],
      validated.limits.timeoutMs,
    );
    const durationMs = Math.round(performance.now() - startedAt);
    return {
      rows: result.rows,
      columns: result.columns,
      rowCount: result.rows.length,
      durationMs,
      sql: validated.executableSql,
      truncated: result.rows.length === validated.limits.maxRows,
    };
  }
}
