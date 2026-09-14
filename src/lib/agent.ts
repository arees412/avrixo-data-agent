import { join } from "node:path";
import type { UIMessage } from "ai";
import { convertToModelMessages, stepCountIs, streamText, tool } from "ai";
import { z } from "zod";
import { filterSchemaForModel, loadPrivacyPolicy } from "@/governance/privacy";
import { loadSemanticLayer } from "@/semantic/semantic-layer";
import { ExecuteSQL } from "./tools/execute-sqlite";

const FinalizeReportSchema = z.object({
  sql: z.string(),
  csvResults: z.string(),
  narrative: z.string().min(1),
});

const FinalizeReport = tool({
  description: "Finalize a report from validated SQL results.",
  inputSchema: FinalizeReportSchema,
  outputSchema: FinalizeReportSchema,
  execute: async (input) => input,
});

const InspectSemanticCatalog = tool({
  description:
    "Return governed entities and sample metric definitions without raw shell access.",
  inputSchema: z.object({ includeDescriptions: z.boolean().default(true) }),
  execute: async () => {
    const semanticRoot = join(process.cwd(), "src", "semantic");
    const [layer, privacyPolicy] = await Promise.all([
      loadSemanticLayer(semanticRoot),
      loadPrivacyPolicy(join(semanticRoot, "privacy.yml")),
    ]);
    return {
      entities: layer.entities.map((entity) => {
        const visible = filterSchemaForModel(
          [
            {
              name: entity.name,
              columns: [...entity.dimensions, ...entity.time_dimensions].map(
                (field) => ({
                  name: field.name,
                  dataType: field.type,
                  nullable: true,
                  description: field.description,
                }),
              ),
            },
          ],
          privacyPolicy,
        )[0];
        return {
          name: entity.name,
          table: entity.table,
          description: entity.description,
          dimensions: visible.columns.map((field) => ({
            name: field.name,
            type: field.dataType,
            description: field.description,
            classification: field.classification,
          })),
        };
      }),
      metrics: layer.metrics,
    };
  },
});

const SYSTEM_PROMPT = `You are the analysis assistant inside Avrixo DataAgent.

Use InspectSemanticCatalog before generating SQL. Prefer an approved metric when one resolves the question. Submit only one SELECT statement to ExecuteSQL. The execution tool enforces AST parsing, forbidden-operation rejection, a row cap, and a timeout independently of these instructions.

Never request or expose secrets, hidden columns, arbitrary shell access, or data mutations. If the question is ambiguous, ask for clarification rather than inventing a metric. FinalizeReport must contain only numeric claims present in validated results and must separate facts from interpretation.

Today is ${new Date().toISOString().split("T")[0]}.`;

export async function runAgent({
  messages,
  model = "anthropic/claude-opus-4.5",
}: {
  messages: UIMessage[];
  model?: string;
}) {
  return streamText({
    model,
    system: SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages),
    stopWhen: [
      (context) =>
        context.steps.some((step) =>
          step.toolResults?.some(
            (result) => result.toolName === "FinalizeReport",
          ),
        ),
      stepCountIs(12),
    ],
    tools: { InspectSemanticCatalog, ExecuteSQL, FinalizeReport },
  });
}

type FinalizeReportOutput = z.infer<typeof FinalizeReportSchema>;

export function extractFinalizeReport(result: {
  toolResults: Array<{ toolName: string; output?: unknown }>;
}) {
  const finalResult = result.toolResults.find(
    (candidate) => candidate.toolName === "FinalizeReport",
  );
  const output = (finalResult?.output ?? {}) as Partial<FinalizeReportOutput>;
  return {
    hasFinalResult: finalResult != null,
    sql: output.sql,
    csvResults: output.csvResults,
    narrative: output.narrative,
  };
}
