import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  filterSchemaForModel,
  loadPrivacyPolicy,
  resolveRowPolicy,
  type PrivacyPolicy,
} from "../privacy";

const policy: PrivacyPolicy = {
  max_sample_rows: 3,
  columns: [
    {
      table: "people",
      column: "email",
      classification: "pii",
      expose_to_model: false,
      expose_sample_values: false,
      hidden: false,
    },
  ],
  row_policies: [
    {
      table: "accounts",
      column: "organization_id",
      context_key: "organizationId",
    },
  ],
};

describe("privacy policy", () => {
  it("loads and validates the committed policy", async () => {
    const loaded = await loadPrivacyPolicy(
      join(process.cwd(), "src", "semantic", "privacy.yml"),
    );
    expect(
      loaded.columns.some((column) => column.classification === "pii"),
    ).toBe(true);
  });

  it("removes forbidden columns from model-visible schema", () => {
    const filtered = filterSchemaForModel(
      [
        {
          name: "people",
          columns: [
            { name: "id", dataType: "integer", nullable: false },
            { name: "email", dataType: "text", nullable: false },
          ],
        },
      ],
      policy,
    );
    expect(filtered[0].columns.map((column) => column.name)).toEqual(["id"]);
  });

  it("builds a parameterized row-boundary predicate", () => {
    expect(
      resolveRowPolicy(
        "accounts",
        { organizationId: "org-123" },
        policy,
        "postgresql",
      ),
    ).toEqual({ predicate: '"organization_id" = $1', parameters: ["org-123"] });
  });

  it("fails closed when row-policy context is absent", () => {
    expect(() => resolveRowPolicy("accounts", {}, policy, "sqlite")).toThrow(
      /context is missing/i,
    );
  });
});
