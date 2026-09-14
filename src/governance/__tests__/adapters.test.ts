import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { SQLiteAdapter } from "../adapters/sqlite";
import {
  PostgreSQLAdapter,
  type PostgreSqlClient,
  type PostgreSqlPool,
} from "../adapters/postgresql";

const temporaryDirectories: string[] = [];

function fixtureDatabase(): string {
  const directory = mkdtempSync(join(tmpdir(), "avrixo-data-agent-"));
  temporaryDirectories.push(directory);
  const path = join(directory, "fixture.db");
  const database = new Database(path);
  database.exec(
    "CREATE TABLE companies(id INTEGER PRIMARY KEY, name TEXT); INSERT INTO companies VALUES (1, 'A'), (2, 'B'), (3, 'C');",
  );
  database.close();
  return path;
}

afterEach(() => {
  temporaryDirectories
    .splice(0)
    .forEach((directory) =>
      rmSync(directory, { recursive: true, force: true }),
    );
});

describe("SQLite adapter", () => {
  it("executes read-only SQL and enforces a row limit", async () => {
    const adapter = new SQLiteAdapter(fixtureDatabase());
    const result = await adapter.executeReadOnly(
      "SELECT * FROM companies ORDER BY id",
      {
        maxRows: 2,
      },
    );
    expect(result.rowCount).toBe(2);
    expect(result.truncated).toBe(true);
  });

  it("rejects a destructive query before execution", async () => {
    const path = fixtureDatabase();
    const adapter = new SQLiteAdapter(path);
    await expect(
      adapter.executeReadOnly("DELETE FROM companies"),
    ).rejects.toThrow();
    const database = new Database(path, { readonly: true });
    expect(
      (
        database.prepare("SELECT COUNT(*) AS count FROM companies").get() as {
          count: number;
        }
      ).count,
    ).toBe(3);
    database.close();
  });

  it("terminates work that exceeds the configured timeout", async () => {
    const adapter = new SQLiteAdapter(fixtureDatabase());
    await expect(
      adapter.executeReadOnly("SELECT * FROM companies", { timeoutMs: 1 }),
    ).rejects.toThrow(/timeout/i);
  });

  it("introspects a local schema without row samples", async () => {
    const adapter = new SQLiteAdapter(fixtureDatabase());
    const schema = await adapter.introspectSchema();
    expect(schema[0].columns.map((column) => column.name)).toEqual([
      "id",
      "name",
    ]);
    expect(JSON.stringify(schema)).not.toContain("'A'");
  });
});

describe("PostgreSQL adapter", () => {
  it("uses a read-only transaction, statement timeout, and rollback", async () => {
    const queries: Array<{ text: string; values?: unknown[] }> = [];
    let released = false;
    const client: PostgreSqlClient = {
      async query(text, values) {
        queries.push({ text, values });
        if (text.startsWith("SELECT * FROM")) {
          return {
            rows: [{ company: "A", revenue: 50 }],
            fields: [{ name: "company" }, { name: "revenue" }],
          };
        }
        return { rows: [] };
      },
      release() {
        released = true;
      },
    };
    const pool: PostgreSqlPool = {
      async connect() {
        return client;
      },
    };
    const result = await new PostgreSQLAdapter(pool).executeReadOnly(
      "SELECT name AS company, revenue FROM companies",
      { maxRows: 5, timeoutMs: 250 },
    );
    expect(queries.map((query) => query.text)).toEqual([
      "BEGIN READ ONLY",
      "SELECT set_config('statement_timeout', $1, true)",
      expect.stringContaining("LIMIT 5"),
      "ROLLBACK",
    ]);
    expect(result.columns).toEqual(["company", "revenue"]);
    expect(released).toBe(true);
  });

  it("rejects mutation before acquiring a database client", async () => {
    let connected = false;
    const pool: PostgreSqlPool = {
      async connect() {
        connected = true;
        throw new Error("must not connect");
      },
    };
    await expect(
      new PostgreSQLAdapter(pool).executeReadOnly(
        "UPDATE companies SET name='x'",
      ),
    ).rejects.toThrow();
    expect(connected).toBe(false);
  });
});
