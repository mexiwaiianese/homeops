import { cpSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const standalone = join(root, ".next", "standalone");
if (!existsSync(standalone)) {
  console.warn("No .next/standalone output; skip asset copy.");
  process.exit(0);
}

cpSync(join(root, "public"), join(standalone, "public"), { recursive: true });
mkdirSync(join(standalone, ".next"), { recursive: true });
cpSync(join(root, ".next", "static"), join(standalone, ".next", "static"), { recursive: true });
console.log("Copied public/ and .next/static into standalone output.");
