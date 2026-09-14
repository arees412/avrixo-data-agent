import { join } from "node:path";
import { loadSemanticLayer } from "../src/semantic/semantic-layer";

const layer = await loadSemanticLayer(join(process.cwd(), "src", "semantic"));
console.log(
  `Validated ${layer.entities.length} entities and ${layer.metrics.length} governed metrics.`,
);
