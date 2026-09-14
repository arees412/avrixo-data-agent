import { describe, expect, it } from "vitest";
import { SqlPolicyError, validateReadOnlySql } from "../sql-policy";

describe("read-only SQL policy", () => {
  it("accepts a SELECT query and applies a row cap", () => {
    const result = validateReadOnlySql("SELECT id FROM companies", "sqlite", {
      maxRows: 25,
    });
    expect(result.executableSql).toContain("LIMIT 25");
  });

  it.each([
    "INSERT",
    "UPDATE",
    "DELETE",
    "DROP",
    "ALTER",
    "CREATE",
    "TRUNCATE",
    "GRANT",
    "REVOKE",
    "COPY",
  ])("rejects %s", (operation) => {
    const sql =
      operation === "INSERT"
        ? "INSERT INTO companies(name) VALUES ('x')"
        : operation === "UPDATE"
          ? "UPDATE companies SET name = 'x'"
          : operation === "DELETE"
            ? "DELETE FROM companies"
            : `${operation} TABLE companies`;
    expect(() => validateReadOnlySql(sql, "sqlite")).toThrow(SqlPolicyError);
  });

  it("rejects multiple statements", () => {
    expect(() => validateReadOnlySql("SELECT 1; SELECT 2", "sqlite")).toThrow(
      /one SQL statement/i,
    );
  });

  it("rejects PostgreSQL SELECT INTO table creation", () => {
    expect(() =>
      validateReadOnlySql("SELECT 1 INTO generated_table", "postgresql"),
    ).toThrow(/SELECT INTO/u);
  });

  it.each([
    "PRAGMA table_info(companies)",
    "ATTACH DATABASE 'other.db' AS other",
    "VACUUM",
  ])("rejects unsafe SQLite command %s", (sql) =>
    expect(() => validateReadOnlySql(sql, "sqlite")).toThrow(),
  );

  it("does not treat mutation words inside literals as operations", () => {
    expect(() =>
      validateReadOnlySql("SELECT 'delete' AS label", "sqlite"),
    ).not.toThrow();
  });
});
