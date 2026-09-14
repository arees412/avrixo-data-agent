export type SqlDialect = "sqlite" | "postgresql";

export interface DataSourceCapabilities {
  readonlySql: true;
  queryTimeout: boolean;
  schemaIntrospection: boolean;
  parameterizedQueries: boolean;
}

export interface SchemaColumn {
  name: string;
  dataType: string;
  nullable: boolean;
  description?: string;
  classification?: "public" | "internal" | "pii" | "restricted";
  exposeToModel?: boolean;
}

export interface SchemaTable {
  name: string;
  schema?: string;
  columns: SchemaColumn[];
}

export interface QueryLimits {
  maxRows: number;
  timeoutMs: number;
}

export interface ExecuteReadOnlyOptions extends Partial<QueryLimits> {
  parameters?: unknown[];
}

export interface QueryResult {
  rows: Array<Record<string, unknown>>;
  columns: string[];
  rowCount: number;
  durationMs: number;
  sql: string;
  truncated: boolean;
}

export interface DataSourceAdapter {
  introspectSchema(): Promise<SchemaTable[]>;
  executeReadOnly(
    sql: string,
    options?: ExecuteReadOnlyOptions,
  ): Promise<QueryResult>;
  healthCheck(): Promise<boolean>;
  dialect(): SqlDialect;
  capabilities(): DataSourceCapabilities;
  identifier(): string;
}

export const DEFAULT_QUERY_LIMITS: QueryLimits = {
  maxRows: 500,
  timeoutMs: 5_000,
};
