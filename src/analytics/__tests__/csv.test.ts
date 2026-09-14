import { describe, expect, it } from "vitest";
import { queryResultToCsv } from "../csv";

describe("queryResultToCsv", () => {
  it("exports only declared columns in their validated order", () => {
    const csv = queryResultToCsv({
      columns: ["company", "revenue"],
      rows: [{ company: "Acme", revenue: 125, hidden: "not exported" }],
      rowCount: 1,
      durationMs: 1,
      sql: "SELECT company, revenue FROM accounts LIMIT 1",
      truncated: false,
    });

    expect(csv).toBe("company,revenue\r\nAcme,125\r\n");
    expect(csv).not.toContain("hidden");
  });

  it("escapes commas, quotes, and line breaks", () => {
    const csv = queryResultToCsv({
      columns: ["company"],
      rows: [{ company: 'A, "quoted"\ncompany' }],
      rowCount: 1,
      durationMs: 1,
      sql: "SELECT company FROM accounts LIMIT 1",
      truncated: false,
    });

    expect(csv).toContain('"A, ""quoted""\ncompany"');
  });

  it("neutralizes spreadsheet formula prefixes in string cells", () => {
    const csv = queryResultToCsv({
      columns: ["label", "amount"],
      rows: [{ label: '=HYPERLINK("unsafe")', amount: -12 }],
      rowCount: 1,
      durationMs: 1,
      sql: "SELECT label, amount FROM results LIMIT 1",
      truncated: false,
    });

    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain(",-12");
  });
});
