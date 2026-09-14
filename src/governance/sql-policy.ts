import sqlParser from "node-sql-parser";
import type { QueryLimits, SqlDialect } from "./types";
import { DEFAULT_QUERY_LIMITS } from "./types";

const { Parser } = sqlParser;
const parser = new Parser();
const FORBIDDEN_KEYWORDS = [
  "ALTER",
  "ATTACH",
  "COPY",
  "CREATE",
  "DELETE",
  "DETACH",
  "DROP",
  "GRANT",
  "INSERT",
  "PRAGMA",
  "REINDEX",
  "REPLACE",
  "REVOKE",
  "TRUNCATE",
  "UPDATE",
  "VACUUM",
];

export class SqlPolicyError extends Error {
  constructor(
    message: string,
    readonly code:
      | "EMPTY_SQL"
      | "MULTIPLE_STATEMENTS"
      | "FORBIDDEN_OPERATION"
      | "PARSE_ERROR"
      | "NOT_SELECT"
      | "INVALID_LIMIT",
  ) {
    super(message);
    this.name = "SqlPolicyError";
  }
}

export interface ValidatedSql {
  originalSql: string;
  executableSql: string;
  dialect: SqlDialect;
  limits: QueryLimits;
}

function stripCommentsAndLiterals(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\r\n]*/g, " ")
    .replace(/'(?:''|[^'])*'/g, "''")
    .replace(/"(?:""|[^"])*"/g, '""');
}

function normalizeSingleStatement(sql: string): string {
  const trimmed = sql.trim();
  if (!trimmed) {
    throw new SqlPolicyError("SQL cannot be empty", "EMPTY_SQL");
  }

  const withoutTrailingTerminator = trimmed.replace(/;\s*$/, "");
  if (stripCommentsAndLiterals(withoutTrailingTerminator).includes(";")) {
    throw new SqlPolicyError(
      "Only one SQL statement is permitted",
      "MULTIPLE_STATEMENTS",
    );
  }
  return withoutTrailingTerminator;
}

function parserDialect(dialect: SqlDialect): "SQLite" | "Postgresql" {
  return dialect === "sqlite" ? "SQLite" : "Postgresql";
}

function containsAstType(node: unknown, type: string): boolean {
  if (Array.isArray(node)) {
    return node.some((entry) => containsAstType(entry, type));
  }
  if (!node || typeof node !== "object") return false;
  if ((node as { type?: string }).type === type) return true;
  return Object.values(node).some((entry) => containsAstType(entry, type));
}

export function validateReadOnlySql(
  sql: string,
  dialect: SqlDialect,
  requestedLimits: Partial<QueryLimits> = {},
): ValidatedSql {
  const statement = normalizeSingleStatement(sql);
  const limits = { ...DEFAULT_QUERY_LIMITS, ...requestedLimits };

  if (!Number.isInteger(limits.maxRows) || limits.maxRows < 1) {
    throw new SqlPolicyError(
      "maxRows must be a positive integer",
      "INVALID_LIMIT",
    );
  }
  if (!Number.isFinite(limits.timeoutMs) || limits.timeoutMs < 1) {
    throw new SqlPolicyError("timeoutMs must be positive", "INVALID_LIMIT");
  }

  const searchable = stripCommentsAndLiterals(statement).toUpperCase();
  const forbidden = FORBIDDEN_KEYWORDS.find((keyword) =>
    new RegExp(`\\b${keyword}\\b`, "u").test(searchable),
  );
  if (forbidden) {
    throw new SqlPolicyError(
      `${forbidden} is not permitted in analytical queries`,
      "FORBIDDEN_OPERATION",
    );
  }

  let ast: unknown;
  try {
    ast = parser.astify(statement, { database: parserDialect(dialect) });
  } catch {
    throw new SqlPolicyError(
      `SQL could not be parsed for the ${dialect} dialect`,
      "PARSE_ERROR",
    );
  }

  if (Array.isArray(ast)) {
    throw new SqlPolicyError(
      "Only one SQL statement is permitted",
      "MULTIPLE_STATEMENTS",
    );
  }
  if (
    !ast ||
    typeof ast !== "object" ||
    (ast as { type?: string }).type !== "select"
  ) {
    throw new SqlPolicyError("Only SELECT queries are permitted", "NOT_SELECT");
  }
  if (containsAstType(ast, "into")) {
    throw new SqlPolicyError(
      "SELECT INTO is not permitted because it creates a table",
      "FORBIDDEN_OPERATION",
    );
  }

  const executableSql = `SELECT * FROM (${statement}) AS avrixo_read_only_query LIMIT ${limits.maxRows}`;
  return { originalSql: statement, executableSql, dialect, limits };
}
