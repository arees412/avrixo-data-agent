import { validateChartSpec } from "@/analytics/chart";
import { checkNumericalGrounding } from "@/analytics/grounding";
import { compileQueryPlan, createQueryPlan } from "@/governance/query-plan";
import { validateReadOnlySql } from "@/governance/sql-policy";
import type { MetricRegistry, SemanticLayer } from "@/semantic/semantic-layer";

export interface EvaluationResult {
  name: string;
  passed: boolean;
  detail: string;
}

function evaluate(
  name: string,
  assertion: () => boolean,
  detail: string,
): EvaluationResult {
  try {
    return { name, passed: assertion(), detail };
  } catch (error) {
    return {
      name,
      passed: false,
      detail: error instanceof Error ? error.message : "Evaluation failed",
    };
  }
}

export function runEvaluationSuite(
  semanticLayer: SemanticLayer,
  registry: MetricRegistry,
): EvaluationResult[] {
  const plan = createQueryPlan("Top 5 companies by revenue", registry);
  const sql = compileQueryPlan(plan, "sqlite", semanticLayer);
  return [
    evaluate(
      "semantic resolution",
      () => plan.entities.includes("Company"),
      "Company entity is required",
    ),
    evaluate(
      "metric selection",
      () => plan.metrics.includes("company_revenue"),
      "Approved company_revenue metric is selected",
    ),
    evaluate(
      "generated query structure",
      () =>
        /ORDER BY revenue DESC/iu.test(sql) &&
        plan.limit <= 5 &&
        /^SELECT/iu.test(sql),
      "Descending SELECT with limit <= 5",
    ),
    evaluate(
      "SQL safety",
      () => Boolean(validateReadOnlySql(sql, "sqlite", { maxRows: 5 })),
      "Generated SQL passes the programmatic read-only policy",
    ),
    evaluate(
      "chart validity",
      () =>
        Boolean(
          validateChartSpec(
            {
              type: "bar",
              title: "Top companies by revenue",
              x: "company",
              y: ["revenue"],
              rationale: "Ranked comparison",
            },
            ["company", "revenue"],
          ),
        ),
      "Chart references returned columns only",
    ),
    evaluate(
      "result grounding",
      () =>
        checkNumericalGrounding("2 rows contain revenue 10 and 20.", [
          { revenue: 10 },
          { revenue: 20 },
        ]).grounded,
      "Narrative numbers are present in deterministic results",
    ),
  ];
}
