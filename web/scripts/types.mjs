import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

if (!existsSync("schema.json")) {
  console.error("schema.json missing; run `uv run scriptindexer-schema` first");
  process.exit(1);
}

execSync("pnpm exec json2ts -i schema.json -o src/types/generated.ts", {
  stdio: "inherit",
});
