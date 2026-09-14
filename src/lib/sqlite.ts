import { join } from "node:path";
import { SQLiteAdapter } from "@/governance/adapters/sqlite";

export interface QueryResult {
  rows: Array<Record<string, unknown>>;
  columns: string[];
  rowCount: number;
  executionTime: number;
  sql: string;
}

function defaultAdapter(): SQLiteAdapter {
  return new SQLiteAdapter(join(process.cwd(), "data", "oss-data-analyst.db"));
}

export async function executeSQL(sql: string): Promise<QueryResult> {
  const result = await defaultAdapter().executeReadOnly(sql);
  return {
    rows: result.rows,
    columns: result.columns,
    rowCount: result.rowCount,
    executionTime: result.durationMs,
    sql: result.sql,
  };
}

export async function getSchema() {
  return defaultAdapter().introspectSchema();
}

export async function testConnection(): Promise<boolean> {
  return defaultAdapter().healthCheck();
}
