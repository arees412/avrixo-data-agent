import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";

/**
 * Avrixo does not expose the inherited general-purpose bash tool to model input.
 * Schema exploration is constrained to reading YAML beneath src/semantic.
 */
export async function readSemanticFile(
  semanticRoot: string,
  relativePath: string,
): Promise<string> {
  if (
    !/^(catalog\.yml|metrics\.yml|privacy\.yml|entities\/[A-Za-z0-9_-]+\.ya?ml)$/u.test(
      relativePath,
    )
  ) {
    throw new Error("Semantic exploration is limited to approved YAML files");
  }
  const root = resolve(semanticRoot);
  const target = resolve(root, relativePath);
  if (target !== root && !target.startsWith(`${root}${sep}`)) {
    throw new Error("Semantic path escapes are not permitted");
  }
  return readFile(target, "utf8");
}
