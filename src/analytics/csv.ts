import type { QueryResult } from "@/governance/types";

function csvCell(value: unknown): string {
  const raw = value == null ? "" : String(value);
  const text =
    typeof value === "string" && /^[=+\-@]/u.test(raw) ? `'${raw}` : raw;
  if (!/[",\r\n]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

/** Export only the bounded, policy-validated query result returned by an adapter. */
export function queryResultToCsv(result: QueryResult): string {
  const lines = [
    result.columns.map(csvCell).join(","),
    ...result.rows.map((row) =>
      result.columns.map((column) => csvCell(row[column])).join(","),
    ),
  ];
  return `${lines.join("\r\n")}\r\n`;
}
