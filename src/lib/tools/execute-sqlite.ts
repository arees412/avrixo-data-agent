import { tool } from "ai";
import { z } from "zod";
import { executeSQL as executeSQLQuery } from "@/lib/sqlite";

/**
 * Execute a programmatically validated, read-only SQL query against SQLite.
 */
export const ExecuteSQL = tool({
  description:
    "Execute read-only SQL query against SQLite database. Returns rows and columns.",
  inputSchema: z.object({
    sql: z.string().min(1),
  }),
  execute: async ({ sql }) => {
    try {
      const result = await executeSQLQuery(sql);

      // Convert columns array to format expected by tools
      const columns = result.columns.map((col) => ({
        name: col,
        type: "TEXT", // SQLite is dynamically typed
      }));

      return {
        rows: result.rows,
        columns,
        rowCount: result.rowCount,
        executionTime: result.executionTime,
      };
    } catch (error: any) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Query rejected",
        rows: [],
        columns: [],
      };
    }
  },
});
