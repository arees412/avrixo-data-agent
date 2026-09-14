import { z } from "zod";

export const ChartSpecSchema = z.object({
  type: z.enum(["bar", "line", "pie", "table", "scatter"]),
  title: z.string().min(1),
  x: z.string().min(1),
  y: z.array(z.string().min(1)).min(1),
  series: z.string().optional(),
  rationale: z.string().min(1),
});

export type ChartSpec = z.infer<typeof ChartSpecSchema>;

export function validateChartSpec(
  candidate: unknown,
  returnedColumns: string[],
): ChartSpec {
  const chart = ChartSpecSchema.parse(candidate);
  const referenced = [
    chart.x,
    ...chart.y,
    ...(chart.series ? [chart.series] : []),
  ];
  const missing = referenced.filter(
    (column) => !returnedColumns.includes(column),
  );
  if (missing.length > 0) {
    throw new Error(
      `Chart references columns not returned by the query: ${missing.join(", ")}`,
    );
  }
  return chart;
}

export function recommendChart(columns: string[]): ChartSpec {
  const x = columns.includes("month") ? "month" : columns[0];
  const y = columns.includes("revenue") ? "revenue" : columns[1];
  if (!x || !y)
    throw new Error("At least two result columns are required for a chart");
  return validateChartSpec(
    {
      type: x === "month" ? "line" : "bar",
      title: x === "month" ? "Monthly revenue trend" : `${y} by ${x}`,
      x,
      y: [y],
      rationale:
        x === "month"
          ? "A line chart preserves chronological movement."
          : "A bar chart compares ranked categories.",
    },
    columns,
  );
}
