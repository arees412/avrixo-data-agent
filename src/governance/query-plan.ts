import { z } from "zod";
import type { SqlDialect } from "./types";
import type { MetricRegistry, SemanticLayer } from "@/semantic/semantic-layer";

export const QueryPlanSchema = z.object({
  intent: z.enum(["analysis", "unsafe_mutation", "clarification"]),
  entities: z.array(z.string()),
  metrics: z.array(z.string()),
  dimensions: z.array(z.string()),
  filters: z.array(
    z.object({ field: z.string(), operator: z.string(), value: z.unknown() }),
  ),
  time_range: z
    .object({ preset: z.string(), timezone: z.string().default("UTC") })
    .optional(),
  ordering: z.array(
    z.object({ field: z.string(), direction: z.enum(["asc", "desc"]) }),
  ),
  limit: z.number().int().min(1).max(500),
  confidence: z.number().min(0).max(1),
  rationale: z.string().min(1),
});

export type QueryPlan = z.infer<typeof QueryPlanSchema>;

export interface ConfidenceThresholds {
  high: number;
  medium: number;
  executeMedium: boolean;
}

export const DEFAULT_CONFIDENCE_THRESHOLDS: ConfidenceThresholds = {
  high: 0.8,
  medium: 0.55,
  executeMedium: false,
};

const MUTATION_LANGUAGE =
  /\b(delete|drop|truncate|update|insert|alter|remove|erase|destroy)\b/iu;

export function createQueryPlan(
  question: string,
  registry: MetricRegistry,
): QueryPlan {
  const normalized = question.trim().toLowerCase();
  if (MUTATION_LANGUAGE.test(normalized)) {
    return QueryPlanSchema.parse({
      intent: "unsafe_mutation",
      entities: [],
      metrics: [],
      dimensions: [],
      filters: [],
      ordering: [],
      limit: 1,
      confidence: 1,
      rationale:
        "The request asks to mutate data, which the analytics path forbids.",
    });
  }

  const resolution = registry.resolve(question);
  if (resolution.metric?.name === "monthly_recurring_revenue") {
    return QueryPlanSchema.parse({
      intent: "analysis",
      entities: ["Accounts"],
      metrics: [resolution.metric.name],
      dimensions: ["month"],
      filters: [],
      ordering: [{ field: "month", direction: "asc" }],
      limit: 60,
      confidence: Math.max(0.9, resolution.score),
      rationale:
        "Resolved the governed sample MRR metric and monthly time dimension.",
    });
  }

  if (resolution.metric?.name === "company_revenue") {
    const requestedLimit = Number(
      normalized.match(/\btop\s+(\d+)\b/u)?.[1] ?? 10,
    );
    const limit = Math.min(100, Math.max(1, requestedLimit));
    return QueryPlanSchema.parse({
      intent: "analysis",
      entities: ["Company"],
      metrics: [resolution.metric.name],
      dimensions: ["company"],
      filters: [],
      ordering: [{ field: "revenue", direction: "desc" }],
      limit,
      confidence: Math.max(0.86, resolution.score),
      rationale:
        "Resolved the governed sample company revenue metric and ranking intent.",
    });
  }

  return QueryPlanSchema.parse({
    intent: "clarification",
    entities: [],
    metrics: [],
    dimensions: [],
    filters: [],
    ordering: [],
    limit: 100,
    confidence: 0.3,
    rationale: "No approved metric could be resolved deterministically.",
  });
}

export function assertExecutionAllowed(
  plan: QueryPlan,
  thresholds: ConfidenceThresholds = DEFAULT_CONFIDENCE_THRESHOLDS,
): void {
  if (plan.intent === "unsafe_mutation") {
    throw new Error("Unsafe data-mutation requests cannot execute");
  }
  if (plan.intent === "clarification" || plan.confidence < thresholds.medium) {
    throw new Error("Clarification is required before SQL generation");
  }
  if (plan.confidence < thresholds.high && !thresholds.executeMedium) {
    throw new Error("Medium-confidence plans require explicit configuration");
  }
}

export function compileQueryPlan(
  plan: QueryPlan,
  dialect: SqlDialect,
  semanticLayer: SemanticLayer,
): string {
  assertExecutionAllowed(plan);
  const metricName = plan.metrics[0];
  const metric = semanticLayer.metrics.find(
    (candidate) => candidate.name === metricName,
  );
  if (!metric) throw new Error(`Metric is not registered: ${metricName}`);
  const entity = semanticLayer.entities.find(
    (candidate) => candidate.name === metric.entity,
  );
  if (!entity)
    throw new Error(`Metric entity is not registered: ${metric.entity}`);

  if (metric.name === "monthly_recurring_revenue") {
    const monthExpression =
      dialect === "postgresql"
        ? "to_char(date_trunc('month', contract_start_date), 'YYYY-MM')"
        : "strftime('%Y-%m', contract_start_date)";
    return `SELECT ${monthExpression} AS month, ${metric.expression} AS revenue FROM ${entity.table} GROUP BY ${monthExpression} ORDER BY month ASC LIMIT ${plan.limit}`;
  }

  if (metric.name === "company_revenue") {
    return `SELECT name AS company, ${metric.expression} AS revenue FROM ${entity.table} GROUP BY name ORDER BY revenue DESC LIMIT ${plan.limit}`;
  }

  throw new Error(`No deterministic compiler is registered for ${metric.name}`);
}
