import { z } from "zod";
import { readFile } from "node:fs/promises";
import yaml from "js-yaml";
import type { SchemaTable, SqlDialect } from "./types";

export const ColumnPolicySchema = z.object({
  table: z.string().min(1),
  column: z.string().min(1),
  classification: z.enum(["public", "internal", "pii", "restricted"]),
  expose_to_model: z.boolean().default(false),
  expose_sample_values: z.boolean().default(false),
  hidden: z.boolean().default(false),
});

export const RowPolicySchema = z.object({
  table: z.string().min(1),
  column: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/u),
  context_key: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/u),
});

export const PrivacyPolicySchema = z.object({
  max_sample_rows: z.number().int().min(0).max(100).default(5),
  columns: z.array(ColumnPolicySchema).default([]),
  row_policies: z.array(RowPolicySchema).default([]),
});

export type PrivacyPolicy = z.infer<typeof PrivacyPolicySchema>;

export async function loadPrivacyPolicy(path: string): Promise<PrivacyPolicy> {
  return PrivacyPolicySchema.parse(yaml.load(await readFile(path, "utf8")));
}

export function filterSchemaForModel(
  schema: SchemaTable[],
  policy: PrivacyPolicy,
): SchemaTable[] {
  return schema.map((table) => ({
    ...table,
    columns: table.columns
      .filter((column) => {
        const rule = policy.columns.find(
          (candidate) =>
            candidate.table.toLowerCase() === table.name.toLowerCase() &&
            candidate.column.toLowerCase() === column.name.toLowerCase(),
        );
        return !rule?.hidden && rule?.expose_to_model !== false;
      })
      .map((column) => {
        const rule = policy.columns.find(
          (candidate) =>
            candidate.table.toLowerCase() === table.name.toLowerCase() &&
            candidate.column.toLowerCase() === column.name.toLowerCase(),
        );
        return {
          ...column,
          classification: rule?.classification ?? "internal",
          exposeToModel: rule?.expose_to_model ?? true,
        };
      }),
  }));
}

function quoteIdentifier(identifier: string, dialect: SqlDialect): string {
  const quote = dialect === "postgresql" ? '"' : '"';
  return `${quote}${identifier.replaceAll(quote, quote + quote)}${quote}`;
}

export interface AppliedRowPolicy {
  predicate: string;
  parameters: unknown[];
}

export function resolveRowPolicy(
  table: string,
  context: Record<string, unknown>,
  policy: PrivacyPolicy,
  dialect: SqlDialect,
): AppliedRowPolicy | undefined {
  const rowPolicy = policy.row_policies.find(
    (candidate) => candidate.table.toLowerCase() === table.toLowerCase(),
  );
  if (!rowPolicy) return undefined;
  const value = context[rowPolicy.context_key];
  if (value === undefined || value === null) {
    throw new Error(
      `Required row-policy context is missing: ${rowPolicy.context_key}`,
    );
  }
  const placeholder = dialect === "postgresql" ? "$1" : "?";
  return {
    predicate: `${quoteIdentifier(rowPolicy.column, dialect)} = ${placeholder}`,
    parameters: [value],
  };
}
