import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  loadSemanticLayer,
  MetricRegistry,
  SemanticValidationError,
  validateSemanticLayer,
  type MetricDefinition,
  type SemanticEntity,
} from "../semantic-layer";

const entity: SemanticEntity = {
  name: "Company",
  type: "fact_table",
  table: "companies",
  grain: "one row per company",
  description: "Companies",
  common_questions: [],
  dimensions: [
    { name: "name", sql: "name", type: "string", description: "Name" },
    { name: "revenue", sql: "revenue", type: "number", description: "Revenue" },
  ],
  time_dimensions: [],
  measures: [],
  joins: [],
};

const metric: MetricDefinition = {
  name: "company_revenue",
  label: "Company Revenue",
  description: "Sample company revenue",
  entity: "Company",
  expression: "SUM(revenue)",
  format: "currency",
  allowed_dimensions: ["name"],
  synonyms: ["revenue"],
  owner: "sample",
  source: "fixture",
  version: "1.0.0",
  sample: true,
};

describe("semantic governance", () => {
  it("validates the repository semantic layer", async () => {
    const layer = await loadSemanticLayer(
      join(process.cwd(), "src", "semantic"),
    );
    expect(layer.entities.length).toBe(3);
    expect(layer.metrics.every((definition) => definition.sample)).toBe(true);
  });

  it("rejects an unknown metric dimension", () => {
    expect(() =>
      validateSemanticLayer({
        entities: [entity],
        metrics: [{ ...metric, allowed_dimensions: ["missing"] }],
      }),
    ).toThrow(SemanticValidationError);
  });

  it("rejects duplicate metric names", () => {
    expect(() => new MetricRegistry([metric, metric])).toThrow(
      /duplicate metric/i,
    );
  });

  it("prefers a governed metric for a matching business phrase", () => {
    const resolution = new MetricRegistry([metric]).resolve(
      "Top companies by revenue",
    );
    expect(resolution.metric?.name).toBe("company_revenue");
    expect(resolution.score).toBeGreaterThan(0.5);
  });
});
