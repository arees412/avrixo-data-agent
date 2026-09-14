import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative } from "node:path";

const excluded = new Set([".git", ".next", "node_modules", "coverage"]);
const textExtensions = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".json",
  ".md",
  ".yml",
  ".yaml",
  ".example",
  ".gitignore",
]);
const highConfidencePatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u,
  /\bgh[opusr]_[A-Za-z0-9]{30,}\b/u,
  /\bAKIA[0-9A-Z]{16}\b/u,
  /\bsk-(?:live|proj)-[A-Za-z0-9_-]{20,}\b/u,
];

async function walk(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const results = await Promise.all(
    entries
      .filter((entry) => !excluded.has(entry.name))
      .map(async (entry) => {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) return walk(path);
        return entry.isFile() ? [path] : [];
      }),
  );
  return results.flat();
}

const findings: string[] = [];
for (const file of await walk(process.cwd())) {
  const extension = extname(file);
  if (!textExtensions.has(extension) && !file.endsWith(".gitignore")) continue;
  const content = await readFile(file, "utf8");
  if (highConfidencePatterns.some((pattern) => pattern.test(content))) {
    findings.push(relative(process.cwd(), file));
  }
}

if (findings.length > 0)
  throw new Error(`Potential secrets found in: ${findings.join(", ")}`);
console.log("High-confidence secret scan passed.");
