import path from "node:path";
import {runPolish} from "../src/lib/polish";
import {repoRoot} from "../src/lib/project";
import {installCliErrorHandlers} from "./lib/validation";

installCliErrorHandlers();

const result = await runPolish();
console.log(
  `polish ${result.status}: rounds=${result.rounds.length}, report=${path.relative(repoRoot, result.reportPath)}`,
);
if (result.status !== "passed") process.exitCode = 1;
