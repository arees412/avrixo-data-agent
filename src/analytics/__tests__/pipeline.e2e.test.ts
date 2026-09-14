import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { InMemoryAuditStore } from "@/audit/audit";
import { SQLiteAdapter } from "@/governance/adapters/sqlite";
import { loadSemanticLayer, MetricRegistry } from "@/semantic/semantic-layer";
import { runGovernedAnalysis } from "../pipeline";

let directory: string;
let databasePath: string;

beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), "avrixo-e2e-"));
  databasePath = join(directory, "e2e.db");
  const database = new Database(databasePath);
  database.exec(`
    CREATE TABLE accounts (
      id INTEGER PRIMARY KEY,
      monthly_value REAL NOT NULL,
      contract_start_date TEXT NOT NULL,
      status TEXT NOT NULL,
      account_type TEXT NOT NULL
    );
    INSERT INTO accounts VALUES
      (1, 100, '2026-01-10', 'Active', 'Starter'),
      (2, 150, '2026-01-15', 'Active', 'Business'),
      (3, 300, '2026-02-01', 'Active', 'Enterprise');
  `);
  database.close();
});

afterAll(() => rmSync(directory, { recursive: true, force: true }));

describe("deterministic governed E2E", () => {
  it("runs question through semantic resolution, SQL, analytics, chart, insight, and audit", async () => {
    const semanticLayer = await loadSemanticLayer(
      join(process.cwd(), "src", "semantic"),
    );
    const auditStore = new InMemoryAuditStore();
    const result = await runGovernedAnalysis({
      question: "Show monthly revenue trend",
      adapter: new SQLiteAdapter(databasePath),
      semanticLayer,
      registry: new MetricRegistry(semanticLayer.metrics),
      auditStore,
    });
    expect(result.plan.metrics).toEqual(["monthly_recurring_revenue"]);
    expect(result.query.rows).toEqual([
      { month: "2026-01", revenue: 250 },
      { month: "2026-02", revenue: 300 },
    ]);
    expect(result.chart).toMatchObject({
      type: "line",
      x: "month",
      y: ["revenue"],
    });
    expect(result.insight.grounding.grounded).toBe(true);
    expect(await auditStore.list()).toHaveLength(1);
  });

  it("never executes an unsafe delete request and records the rejection", async () => {
    const semanticLayer = await loadSemanticLayer(
      join(process.cwd(), "src", "semantic"),
    );
    const auditStore = new InMemoryAuditStore();
    await expect(
      runGovernedAnalysis({
        question: "Delete all customers",
        adapter: new SQLiteAdapter(databasePath),
        semanticLayer,
        registry: new MetricRegistry(semanticLayer.metrics),
        auditStore,
      }),
    ).rejects.toThrow(/mutation/i);
    const database = new Database(databasePath, { readonly: true });
    expect(
      (
        database.prepare("SELECT COUNT(*) AS count FROM accounts").get() as {
          count: number;
        }
      ).count,
    ).toBe(3);
    database.close();
    expect((await auditStore.list())[0]).toMatchObject({
      validation: "rejected",
      success: false,
      rowCount: 0,
    });
  });
});
