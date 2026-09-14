import { describe, expect, it } from "vitest";
import { InMemoryAuditStore, redactSecrets, sanitizeError } from "../audit";

describe("audit safety", () => {
  it("creates a typed query audit event", async () => {
    const store = new InMemoryAuditStore();
    await store.append({
      id: "event-1",
      sessionId: "session-1",
      timestamp: new Date().toISOString(),
      question: "Show revenue",
      resolvedEntities: ["Company"],
      resolvedMetrics: ["company_revenue"],
      generatedSql: "SELECT revenue FROM companies",
      validation: "accepted",
      dataSource: "sqlite:local",
      durationMs: 4,
      rowCount: 1,
      provider: { name: "deterministic", model: "fixture" },
      success: true,
    });
    expect(await store.list()).toHaveLength(1);
  });

  it("redacts secret-bearing keys and connection strings", () => {
    const redacted = redactSecrets({
      authorization: "Bearer abc.def",
      nested: { databaseUrl: "postgresql://user:password@example.test/db" },
    });
    expect(JSON.stringify(redacted)).not.toContain("abc.def");
    expect(JSON.stringify(redacted)).not.toContain("user:password");
  });

  it("sanitizes and bounds errors", () => {
    const sanitized = sanitizeError(
      new Error(`Bearer super-secret-token ${"x".repeat(600)}`),
    );
    expect(sanitized).not.toContain("super-secret-token");
    expect(sanitized.length).toBeLessThanOrEqual(500);
  });
});
