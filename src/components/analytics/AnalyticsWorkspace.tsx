"use client";

import { FormEvent, useState } from "react";
import { queryResultToCsv } from "@/analytics/csv";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface AnalysisResponse {
  id: string;
  question: string;
  createdAt: string;
  status: "completed";
  plan: {
    entities: string[];
    metrics: string[];
    dimensions: string[];
    confidence: number;
    rationale: string;
  };
  query: {
    sql: string;
    columns: string[];
    rows: Array<Record<string, unknown>>;
    rowCount: number;
    durationMs: number;
    truncated: boolean;
  };
  chart: {
    type: "bar" | "line" | "pie" | "table" | "scatter";
    title: string;
    x: string;
    y: string[];
    series?: string;
    rationale: string;
  };
  insight: {
    facts: string[];
    observations: string[];
    interpretation: string[];
  };
  observability: { analysisDurationMs: number; dataSource: string };
}

const samples = ["Show monthly revenue trend", "Top 5 companies by revenue"];

export default function AnalyticsWorkspace() {
  const [question, setQuestion] = useState(samples[0]);
  const [analysis, setAnalysis] = useState<AnalysisResponse>();
  const [history, setHistory] = useState<AnalysisResponse[]>([]);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(undefined);
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const payload = (await response.json()) as
        { ok: true; session: AnalysisResponse } | { ok: false; error: string };
      if (!payload.ok) throw new Error(payload.error);
      setAnalysis(payload.session);
      setHistory((items) => [payload.session, ...items].slice(0, 5));
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Analysis failed",
      );
    } finally {
      setLoading(false);
    }
  }

  function exportCsv() {
    if (!analysis) return;
    const blob = new Blob([queryResultToCsv(analysis.query)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `avrixo-analysis-${analysis.id}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl px-5 py-8 lg:px-8">
        <header className="mb-8 border-b border-slate-800 pb-7">
          <div className="mb-3 flex flex-wrap items-center gap-3 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">
            <span>Avrixo DataAgent</span>
            <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-emerald-300">
              Read-only governed path
            </span>
          </div>
          <h1 className="max-w-4xl text-3xl font-semibold tracking-tight sm:text-5xl">
            Governed AI Analytics &amp; BI Platform
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-400 sm:text-base">
            Natural-language questions resolve through approved sample metrics,
            parsed SELECT-only SQL, bounded execution, validated charts,
            grounded insights, and an audit event.
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-[1.45fr_0.55fr]">
          <section className="space-y-6">
            <form
              onSubmit={submit}
              className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-2xl shadow-cyan-950/20"
            >
              <label
                htmlFor="question"
                className="text-sm font-medium text-slate-200"
              >
                Ask Data
              </label>
              <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                <input
                  id="question"
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none ring-cyan-400 transition focus:ring-2"
                />
                <button
                  disabled={loading}
                  className="rounded-xl bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:opacity-60"
                >
                  {loading ? "Validating..." : "Run governed analysis"}
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {samples.map((sample) => (
                  <button
                    type="button"
                    key={sample}
                    onClick={() => setQuestion(sample)}
                    className="rounded-full border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:border-cyan-500 hover:text-cyan-200"
                  >
                    {sample}
                  </button>
                ))}
              </div>
              {error && (
                <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
                  Rejected: {error}
                </p>
              )}
            </form>

            {analysis ? (
              <>
                <div className="grid gap-4 md:grid-cols-3">
                  <Summary
                    label="Plan confidence"
                    value={`${Math.round(analysis.plan.confidence * 100)}%`}
                  />
                  <Summary
                    label="Validated rows"
                    value={String(analysis.query.rowCount)}
                  />
                  <Summary
                    label="Analysis latency"
                    value={`${analysis.observability.analysisDurationMs} ms`}
                  />
                </div>
                <Panel title="Query Plan">
                  <dl className="grid gap-3 text-sm sm:grid-cols-3">
                    <Fact
                      label="Metric"
                      value={analysis.plan.metrics.join(", ")}
                    />
                    <Fact
                      label="Entity"
                      value={analysis.plan.entities.join(", ")}
                    />
                    <Fact
                      label="Dimension"
                      value={analysis.plan.dimensions.join(", ")}
                    />
                  </dl>
                  <p className="mt-4 text-sm text-slate-400">
                    {analysis.plan.rationale}
                  </p>
                </Panel>
                <Panel title="Generated SQL">
                  <pre className="overflow-x-auto rounded-xl bg-slate-950 p-4 text-xs leading-6 text-cyan-200">
                    {analysis.query.sql}
                  </pre>
                </Panel>
                <Panel title="Validated Results">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
                    <span>
                      Only bounded adapter output is available for export.
                    </span>
                    <button
                      type="button"
                      onClick={exportCsv}
                      className="rounded-lg border border-cyan-500/50 px-3 py-1.5 font-semibold text-cyan-200 hover:bg-cyan-500/10"
                    >
                      Export validated CSV
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="text-slate-400">
                        <tr>
                          {analysis.query.columns.map((column) => (
                            <th
                              className="border-b border-slate-800 px-3 py-2"
                              key={column}
                            >
                              {column}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {analysis.query.rows.slice(0, 8).map((row, index) => (
                          <tr key={index}>
                            {analysis.query.columns.map((column) => (
                              <td
                                className="border-b border-slate-900 px-3 py-2"
                                key={column}
                              >
                                {String(row[column])}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Panel>
                <Panel title={`Validated Chart · ${analysis.chart.title}`}>
                  <p className="mb-4 text-xs text-slate-400">
                    {analysis.chart.rationale}
                  </p>
                  <ValidatedChart analysis={analysis} />
                </Panel>
                <Panel title="Grounded Executive Insight">
                  <InsightGroup title="Facts" items={analysis.insight.facts} />
                  <InsightGroup
                    title="Observations"
                    items={analysis.insight.observations}
                  />
                  <InsightGroup
                    title="Interpretation"
                    items={analysis.insight.interpretation}
                  />
                </Panel>
              </>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-800 p-10 text-center text-sm text-slate-500">
                Run a bundled deterministic question to inspect every governed
                stage.
              </div>
            )}
          </section>

          <aside className="space-y-6">
            <Panel title="Control Plane">
              <ul className="space-y-3 text-sm text-slate-300">
                {[
                  "Approved semantic metric",
                  "AST-validated SELECT only",
                  "Row cap + hard timeout",
                  "Privacy-aware schema",
                  "Grounded numeric output",
                  "Sanitized audit event",
                ].map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="text-emerald-300">✓</span>
                    {item}
                  </li>
                ))}
              </ul>
            </Panel>
            <Panel title="Recent Analyses">
              {history.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No local session history yet.
                </p>
              ) : (
                <ul className="space-y-3">
                  {history.map((item) => (
                    <li
                      key={item.id}
                      className="rounded-xl bg-slate-950 text-sm"
                    >
                      <button
                        type="button"
                        onClick={() => setAnalysis(item)}
                        className="w-full rounded-xl p-3 text-left hover:bg-slate-900"
                      >
                        <span className="block text-slate-200">
                          {item.question}
                        </span>
                        <span className="mt-1 block text-xs text-slate-500">
                          {item.status} · {item.query.rowCount} rows ·{" "}
                          {new Date(item.createdAt).toLocaleTimeString()}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
            <Panel title="Semantic Catalog">
              <p className="text-sm text-slate-400">
                Bundled sample metrics only. No production business claims.
              </p>
              <div className="mt-3 space-y-2 text-xs">
                <code className="block rounded bg-slate-950 p-2 text-cyan-200">
                  monthly_recurring_revenue
                </code>
                <code className="block rounded bg-slate-950 p-2 text-cyan-200">
                  company_revenue
                </code>
              </div>
            </Panel>
          </aside>
        </div>
      </div>
    </main>
  );
}

function ValidatedChart({ analysis }: { analysis: AnalysisResponse }) {
  const y = analysis.chart.y[0];
  const common = (
    <>
      <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
      <XAxis
        dataKey={analysis.chart.x}
        stroke="#94a3b8"
        tick={{ fontSize: 11 }}
      />
      <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} width={72} />
      <Tooltip
        contentStyle={{
          background: "#020617",
          border: "1px solid #334155",
          borderRadius: 10,
        }}
      />
    </>
  );

  return (
    <div className="h-72 w-full" aria-label={`${analysis.chart.type} chart`}>
      <ResponsiveContainer width="100%" height="100%">
        {analysis.chart.type === "line" ? (
          <LineChart data={analysis.query.rows} margin={{ left: 8, right: 16 }}>
            {common}
            <Line
              dataKey={y}
              stroke="#67e8f9"
              strokeWidth={2}
              dot={{ r: 2 }}
              type="monotone"
            />
          </LineChart>
        ) : (
          <BarChart data={analysis.query.rows} margin={{ left: 8, right: 16 }}>
            {common}
            <Bar dataKey={y} fill="#22d3ee" radius={[5, 5, 0, 0]} />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-slate-300">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
      <p className="text-xs uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-cyan-200">{value}</p>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-slate-500">
        {label}
      </dt>
      <dd className="mt-1 text-slate-200">{value}</dd>
    </div>
  );
}

function InsightGroup({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="mb-4 last:mb-0">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-cyan-300">
        {title}
      </h3>
      <ul className="mt-2 space-y-1 text-sm text-slate-300">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
