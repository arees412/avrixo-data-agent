export const runtime = "nodejs";

import { join } from "node:path";
import { z } from "zod";
import { InMemoryAuditStore } from "@/audit/audit";
import { runGovernedAnalysis } from "@/analytics/pipeline";
import { SQLiteAdapter } from "@/governance/adapters/sqlite";
import { loadSemanticLayer, MetricRegistry } from "@/semantic/semantic-layer";

const RequestSchema = z.object({ question: z.string().trim().min(3).max(500) });
const auditStore = new InMemoryAuditStore();

export async function POST(request: Request) {
  try {
    const { question } = RequestSchema.parse(await request.json());
    const semanticLayer = await loadSemanticLayer(
      join(process.cwd(), "src", "semantic"),
    );
    const session = await runGovernedAnalysis({
      question,
      adapter: new SQLiteAdapter(
        join(process.cwd(), "data", "oss-data-analyst.db"),
      ),
      semanticLayer,
      registry: new MetricRegistry(semanticLayer.metrics),
      auditStore,
    });
    return Response.json({ ok: true, session });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Analysis failed",
      },
      { status: 422 },
    );
  }
}
