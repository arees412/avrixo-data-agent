import { Pool } from "pg";
import { validateReadOnlySql } from "../sql-policy";
import type {
  DataSourceAdapter,
  DataSourceCapabilities,
  ExecuteReadOnlyOptions,
  QueryResult,
  SchemaTable,
} from "../types";
import { DEFAULT_QUERY_LIMITS } from "../types";

export interface PostgreSqlQueryResult {
  rows: Array<Record<string, unknown>>;
  fields?: Array<{ name: string }>;
}

export interface PostgreSqlClient {
  query(text: string, values?: unknown[]): Promise<PostgreSqlQueryResult>;
  release(): void;
}

export interface PostgreSqlPool {
  connect(): Promise<PostgreSqlClient>;
  end?(): Promise<void>;
}

export class PostgreSQLAdapter implements DataSourceAdapter {
  private readonly pool: PostgreSqlPool;

  constructor(connectionStringOrPool: string | PostgreSqlPool) {
    this.pool =
      typeof connectionStringOrPool === "string"
        ? (new Pool({
            connectionString: connectionStringOrPool,
          }) as PostgreSqlPool)
        : connectionStringOrPool;
  }

  identifier(): string {
    return "postgresql:configured";
  }

  dialect(): "postgresql" {
    return "postgresql";
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
    const client = await this.pool.connect();
    try {
      await client.query("SELECT 1 AS healthy");
      return true;
    } catch {
      return false;
    } finally {
      client.release();
    }
  }

  async introspectSchema(): Promise<SchemaTable[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT table_schema, table_name, column_name, data_type, is_nullable
         FROM information_schema.columns
         WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
         ORDER BY table_schema, table_name, ordinal_position`,
      );
      const tables = new Map<string, SchemaTable>();
      for (const row of result.rows) {
        const schema = String(row.table_schema);
        const name = String(row.table_name);
        const key = `${schema}.${name}`;
        const table = tables.get(key) ?? { schema, name, columns: [] };
        table.columns.push({
          name: String(row.column_name),
          dataType: String(row.data_type),
          nullable: row.is_nullable === "YES",
        });
        tables.set(key, table);
      }
      return [...tables.values()];
    } finally {
      client.release();
    }
  }

  async executeReadOnly(
    sql: string,
    options: ExecuteReadOnlyOptions = {},
  ): Promise<QueryResult> {
    const validated = validateReadOnlySql(sql, "postgresql", {
      maxRows: options.maxRows ?? DEFAULT_QUERY_LIMITS.maxRows,
      timeoutMs: options.timeoutMs ?? DEFAULT_QUERY_LIMITS.timeoutMs,
    });
    const startedAt = performance.now();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN READ ONLY");
      await client.query("SELECT set_config('statement_timeout', $1, true)", [
        String(validated.limits.timeoutMs),
      ]);
      const result = await client.query(
        validated.executableSql,
        options.parameters ?? [],
      );
      const durationMs = Math.round(performance.now() - startedAt);
      return {
        rows: result.rows,
        columns:
          result.fields?.map((field) => field.name) ??
          Object.keys(result.rows[0] ?? {}),
        rowCount: result.rows.length,
        durationMs,
        sql: validated.executableSql,
        truncated: result.rows.length === validated.limits.maxRows,
      };
    } finally {
      try {
        await client.query("ROLLBACK");
      } finally {
        client.release();
      }
    }
  }

  async close(): Promise<void> {
    await this.pool.end?.();
  }
}
