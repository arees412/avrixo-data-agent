import { randomUUID } from "node:crypto";
import type { AuditEvent, AuditStore } from "@/audit/audit";
import { sanitizeError } from "@/audit/audit";
import type { DataSourceAdapter, QueryResult } from "@/governance/types";
import {
  compileQueryPlan,
  createQueryPlan,
  type QueryPlan,
} from "@/governance/query-plan";
import type { MetricRegistry, SemanticLayer } from "@/semantic/semantic-layer";
import {
  buildTrend,
  descriptiveStatistics,
  topN,
  type TrendPoint,
} from "./engine";
import { recommendChart, type ChartSpec } from "./chart";
import { checkNumericalGrounding, type GroundingResult } from "./grounding";

export interface ExecutiveInsight {
  facts: string[];
  observations: string[];
  interpretation: string[];
  narrative: string;
  grounding: GroundingResult;
}

export interface AnalysisSession {
  id: string;
  question: string;
  createdAt: string;
  status: "completed";
  plan: QueryPlan;
  query: QueryResult;
  analytics: {
    trend?: TrendPoint[];
    statistics?: ReturnType<typeof descriptiveStatistics>;
  };
  chart: ChartSpec;
  insight: ExecutiveInsight;
  observability: {
    analysisDurationMs: number;
    sqlDurationMs: number;
    dataSource: string;
    rowCount: number;
    validationFailures: number;
    provider: "deterministic";
  };
}

function buildInsight(
  result: QueryResult,
  analytics: AnalysisSession["analytics"],
): ExecutiveInsight {
  const statistics =
    analytics.statistics ??
    descriptiveStatistics(result.rows.map((row) => Number(row.revenue)));
  const facts = [
    `${result.rowCount} validated rows were returned.`,
    `Revenue ranged from ${statistics.min} to ${statistics.max}.`,
  ];
  const observations = analytics.trend
    ? [
        analytics.trend.some((point) => point.anomaly)
          ? "The documented two-standard-deviation rule flagged at least one point."
          : "The documented two-standard-deviation rule flagged no points.",
      ]
    : ["Results are ordered by the governed revenue metric."];
  const interpretation = [
    "Use the validated result set as evidence; business causality requires additional context.",
  ];
  const narrative = [...facts, ...observations, ...interpretation].join(" ");
  const grounding = checkNumericalGrounding(narrative, result.rows, [
    statistics,
  ]);
  if (!grounding.grounded) {
    throw new Error(
      `Insight contains unsupported numbers: ${grounding.unsupportedNumbers.join(", ")}`,
    );
  }
  return { facts, observations, interpretation, narrative, grounding };
}

function createAuditEvent(input: {
  id: string;
  question: string;
  plan: QueryPlan;
  dataSource: string;
  startedAt: number;
  result?: QueryResult;
  sql?: string;
  error?: unknown;
}): AuditEvent {
  return {
    id: randomUUID(),
    sessionId: input.id,
    timestamp: new Date().toISOString(),
    question: input.question,
    resolvedEntities: input.plan.entities,
    resolvedMetrics: input.plan.metrics,
    generatedSql: input.sql,
    validation:
      input.plan.intent === "analysis"
        ? input.error
          ? "rejected"
          : "accepted"
        : "rejected",
    dataSource: input.dataSource,
    durationMs: Math.round(performance.now() - input.startedAt),
    rowCount: input.result?.rowCount ?? 0,
    provider: { name: "deterministic", model: "avrixo-fixture-v1" },
    success: !input.error,
    error: input.error ? sanitizeError(input.error) : undefined,
  };
}

export async function runGovernedAnalysis(input: {
  question: string;
  adapter: DataSourceAdapter;
  semanticLayer: SemanticLayer;
  registry: MetricRegistry;
  auditStore: AuditStore;
}): Promise<AnalysisSession> {
  const id = randomUUID();
  const startedAt = performance.now();
  const plan = createQueryPlan(input.question, input.registry);
  let sql: string | undefined;
  let result: QueryResult | undefined;
  try {
    sql = compileQueryPlan(plan, input.adapter.dialect(), input.semanticLayer);
    result = await input.adapter.executeReadOnly(sql, {
      maxRows: plan.limit,
      timeoutMs: 5_000,
    });
    const values = result.rows.map((row) => Number(row.revenue));
    const statistics = descriptiveStatistics(values);
    const analytics = result.columns.includes("month")
      ? { trend: buildTrend(result.rows, "month", "revenue"), statistics }
      : { statistics, ranked: topN(result.rows, "revenue", plan.limit) };
    const chart = recommendChart(result.columns);
    const insight = buildInsight(result, analytics);
    const session: AnalysisSession = {
      id,
      question: input.question,
      createdAt: new Date().toISOString(),
      status: "completed",
      plan,
      query: result,
      analytics,
      chart,
      insight,
      observability: {
        analysisDurationMs: Math.round(performance.now() - startedAt),
        sqlDurationMs: result.durationMs,
        dataSource: input.adapter.identifier(),
        rowCount: result.rowCount,
        validationFailures: 0,
        provider: "deterministic",
      },
    };
    await input.auditStore.append(
      createAuditEvent({
        id,
        question: input.question,
        plan,
        dataSource: input.adapter.identifier(),
        startedAt,
        result,
        sql,
      }),
    );
    return session;
  } catch (error) {
    await input.auditStore.append(
      createAuditEvent({
        id,
        question: input.question,
        plan,
        dataSource: input.adapter.identifier(),
        startedAt,
        result,
        sql,
        error,
      }),
    );
    throw error;
  }
}
