import { access, readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

async function markdownFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries
      .filter(
        (entry) => !["node_modules", ".git", ".next"].includes(entry.name),
      )
      .map(async (entry) => {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) return markdownFiles(path);
        return entry.isFile() && entry.name.endsWith(".md") ? [path] : [];
      }),
  );
  return nested.flat();
}

const files = await markdownFiles(process.cwd());
const failures: string[] = [];
let mermaidBlocks = 0;

for (const file of files) {
  const content = await readFile(file, "utf8");
  const openingBlocks = (content.match(/```mermaid\s*\n/gu) ?? []).length;
  mermaidBlocks += openingBlocks;
  const allFences = (content.match(/^```/gmu) ?? []).length;
  if (allFences % 2 !== 0)
    failures.push(`${file}: unclosed Markdown code fence`);

  for (const match of content.matchAll(/\[[^\]]+\]\(([^)]+)\)/gu)) {
    const destination = match[1].split("#")[0];
    if (!destination || /^(?:https?:|mailto:)/u.test(destination)) continue;
    try {
      await access(resolve(dirname(file), decodeURIComponent(destination)));
    } catch {
      failures.push(`${file}: missing local link ${destination}`);
    }
  }
}

if (mermaidBlocks === 0) failures.push("No Mermaid diagram was found");
if (failures.length > 0) throw new Error(failures.join("\n"));
console.log(
  `Validated ${files.length} Markdown files and ${mermaidBlocks} Mermaid blocks.`,
);
