import { join } from "node:path";
import { runEvaluationSuite } from "../src/evaluation/harness";
import {
  loadSemanticLayer,
  MetricRegistry,
} from "../src/semantic/semantic-layer";

const semanticLayer = await loadSemanticLayer(
  join(process.cwd(), "src", "semantic"),
);
const results = runEvaluationSuite(
  semanticLayer,
  new MetricRegistry(semanticLayer.metrics),
);
for (const result of results) {
  console.log(
    `${result.passed ? "PASS" : "FAIL"} ${result.name}: ${result.detail}`,
  );
}
if (results.some((result) => !result.passed)) process.exitCode = 1;
