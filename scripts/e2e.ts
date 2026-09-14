import { join } from "node:path";
import { InMemoryAuditStore } from "../src/audit/audit";
import { runGovernedAnalysis } from "../src/analytics/pipeline";
import { SQLiteAdapter } from "../src/governance/adapters/sqlite";
import {
  loadSemanticLayer,
  MetricRegistry,
} from "../src/semantic/semantic-layer";

const semanticLayer = await loadSemanticLayer(
  join(process.cwd(), "src", "semantic"),
);
const registry = new MetricRegistry(semanticLayer.metrics);
const adapter = new SQLiteAdapter(
  join(process.cwd(), "data", "oss-data-analyst.db"),
);
const auditStore = new InMemoryAuditStore();

const completed = await runGovernedAnalysis({
  question: "Show monthly revenue trend",
  adapter,
  semanticLayer,
  registry,
  auditStore,
});

let unsafeRejected = false;
try {
  await runGovernedAnalysis({
    question: "Delete all customers",
    adapter,
    semanticLayer,
    registry,
    auditStore,
  });
} catch {
  unsafeRejected = true;
}

if (!completed.insight.grounding.grounded || !unsafeRejected) {
  throw new Error("Deterministic E2E governance assertions failed");
}

console.log(
  JSON.stringify(
    {
      safeFlow: "passed",
      unsafeFlow: "rejected before execution",
      rows: completed.query.rowCount,
      chart: completed.chart.type,
      auditEvents: (await auditStore.list()).length,
    },
    null,
    2,
  ),
);
