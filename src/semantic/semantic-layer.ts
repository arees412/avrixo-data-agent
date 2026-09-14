import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import yaml from "js-yaml";
import { z } from "zod";

const FieldSchema = z.object({
  name: z.string().min(1),
  sql: z.string().min(1),
  type: z.string().min(1),
  description: z.string().min(1),
  sample_values: z
    .array(z.union([z.string(), z.number(), z.boolean()]))
    .optional(),
});

const MeasureSchema = FieldSchema;

const JoinSchema = z.object({
  target_entity: z.string().min(1),
  relationship: z.enum(["one_to_one", "one_to_many", "many_to_one"]),
  join_columns: z.object({ from: z.string().min(1), to: z.string().min(1) }),
});

const EntitySchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  table: z.string().min(1),
  grain: z.string().min(1),
  description: z.string().min(1),
  common_questions: z.array(z.string()).default([]),
  dimensions: z.array(FieldSchema).default([]),
  time_dimensions: z.array(FieldSchema).default([]),
  measures: z.array(MeasureSchema).default([]),
  joins: z.array(JoinSchema).default([]),
});

export const MetricDefinitionSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9_]*$/u),
  label: z.string().min(1),
  description: z.string().min(1),
  entity: z.string().min(1),
  expression: z.string().min(1),
  format: z.enum(["currency", "number", "percentage"]),
  allowed_dimensions: z.array(z.string()).min(1),
  synonyms: z.array(z.string()).default([]),
  owner: z.string().min(1),
  source: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+$/u),
  sample: z.boolean().default(false),
});

const MetricsFileSchema = z.object({
  metrics: z.array(MetricDefinitionSchema),
});

export type SemanticEntity = z.infer<typeof EntitySchema>;
export type MetricDefinition = z.infer<typeof MetricDefinitionSchema>;

export interface SemanticLayer {
  entities: SemanticEntity[];
  metrics: MetricDefinition[];
}

export class SemanticValidationError extends Error {
  constructor(readonly issues: string[]) {
    super(`Semantic layer is invalid:\n- ${issues.join("\n- ")}`);
    this.name = "SemanticValidationError";
  }
}

function parseYaml<T>(
  content: string,
  schema: z.ZodType<T>,
  source: string,
): T {
  const parsed = yaml.load(content);
  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new SemanticValidationError(
      result.error.issues.map(
        (issue) => `${source}: ${issue.path.join(".")} ${issue.message}`,
      ),
    );
  }
  return result.data;
}

export function validateSemanticLayer(layer: SemanticLayer): SemanticLayer {
  const issues: string[] = [];
  const entityMap = new Map(
    layer.entities.map((entity) => [entity.name, entity]),
  );
  const entityNames = layer.entities.map((entity) => entity.name);
  if (new Set(entityNames).size !== entityNames.length) {
    issues.push("duplicate entity names are not permitted");
  }

  const metricNames = layer.metrics.map((metric) => metric.name);
  if (new Set(metricNames).size !== metricNames.length) {
    issues.push("duplicate metric names are not permitted");
  }

  for (const entity of layer.entities) {
    const fields = new Set(
      [...entity.dimensions, ...entity.time_dimensions].map(
        (field) => field.name,
      ),
    );
    const measureNames = entity.measures.map((measure) => measure.name);
    if (new Set(measureNames).size !== measureNames.length) {
      issues.push(`${entity.name}: duplicate measure names are not permitted`);
    }
    for (const joinDefinition of entity.joins) {
      const target = entityMap.get(joinDefinition.target_entity);
      if (!target) {
        issues.push(
          `${entity.name}: unknown join target ${joinDefinition.target_entity}`,
        );
        continue;
      }
      const targetFields = new Set(
        [...target.dimensions, ...target.time_dimensions].map(
          (field) => field.name,
        ),
      );
      if (!fields.has(joinDefinition.join_columns.from)) {
        issues.push(
          `${entity.name}: unknown join field ${joinDefinition.join_columns.from}`,
        );
      }
      if (!targetFields.has(joinDefinition.join_columns.to)) {
        issues.push(
          `${entity.name}: unknown target join field ${joinDefinition.join_columns.to}`,
        );
      }
    }
  }

  for (const metric of layer.metrics) {
    const entity = entityMap.get(metric.entity);
    if (!entity) {
      issues.push(`${metric.name}: unknown entity ${metric.entity}`);
      continue;
    }
    const fields = new Set(
      [...entity.dimensions, ...entity.time_dimensions].map(
        (field) => field.name,
      ),
    );
    for (const dimension of metric.allowed_dimensions) {
      if (!fields.has(dimension)) {
        issues.push(`${metric.name}: unknown allowed dimension ${dimension}`);
      }
    }
    const identifiers =
      metric.expression
        .replace(/'[^']*'/g, " ")
        .match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [];
    const expressionKeywords = new Set([
      "SUM",
      "AVG",
      "MIN",
      "MAX",
      "COUNT",
      "DISTINCT",
      "NULL",
    ]);
    const unknown = identifiers.filter(
      (identifier) =>
        !expressionKeywords.has(identifier.toUpperCase()) &&
        !fields.has(identifier),
    );
    if (unknown.length > 0) {
      issues.push(`${metric.name}: unknown expression field ${unknown[0]}`);
    }
  }

  if (issues.length > 0) throw new SemanticValidationError(issues);
  return layer;
}

export async function loadSemanticLayer(
  rootDirectory: string,
): Promise<SemanticLayer> {
  const entityDirectory = join(rootDirectory, "entities");
  const entityFiles = (await readdir(entityDirectory))
    .filter((file) => /\.ya?ml$/u.test(file))
    .sort();
  const entities = await Promise.all(
    entityFiles.map(async (file) =>
      parseYaml(
        await readFile(join(entityDirectory, file), "utf8"),
        EntitySchema,
        file,
      ),
    ),
  );
  const metricFile = parseYaml(
    await readFile(join(rootDirectory, "metrics.yml"), "utf8"),
    MetricsFileSchema,
    "metrics.yml",
  );
  return validateSemanticLayer({ entities, metrics: metricFile.metrics });
}

export class MetricRegistry {
  private readonly metrics = new Map<string, MetricDefinition>();

  constructor(definitions: MetricDefinition[]) {
    for (const definition of definitions) {
      if (this.metrics.has(definition.name)) {
        throw new SemanticValidationError([
          `duplicate metric ${definition.name}`,
        ]);
      }
      this.metrics.set(definition.name, definition);
    }
  }

  get(name: string): MetricDefinition | undefined {
    return this.metrics.get(name);
  }

  list(): MetricDefinition[] {
    return [...this.metrics.values()];
  }

  resolve(question: string): { metric?: MetricDefinition; score: number } {
    const normalized = question.toLowerCase();
    let best: { metric?: MetricDefinition; score: number } = { score: 0 };
    for (const metric of this.metrics.values()) {
      const phrases = [
        metric.name.replaceAll("_", " "),
        metric.label,
        ...metric.synonyms,
      ].map((phrase) => phrase.toLowerCase());
      const matches = phrases.filter((phrase) => normalized.includes(phrase));
      const score =
        matches.length > 0 ? Math.min(1, 0.72 + matches[0].length / 100) : 0;
      if (score > best.score) best = { metric, score };
    }
    return best;
  }
}
