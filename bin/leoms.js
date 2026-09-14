#!/usr/bin/env node

import { existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const distPath = resolve(__dirname, "../dist/index.js");
const tsPath = resolve(__dirname, "../src/index.ts");
const tsxBin = resolve(__dirname, "../node_modules/.bin/tsx");

// If LEOMS_DEV=1, or distPath doesn't exist, or TypeScript source is newer than dist bundle: execute via tsx
const shouldUseTsx =
  process.env.LEOMS_DEV === "1" ||
  !existsSync(distPath) ||
  (existsSync(tsPath) && existsSync(distPath) && statSync(tsPath).mtimeMs > statSync(distPath).mtimeMs);

if (shouldUseTsx) {
  const child = spawn(
    existsSync(tsxBin) ? tsxBin : "npx",
    existsSync(tsxBin) ? [tsPath, ...process.argv.slice(2)] : ["tsx", tsPath, ...process.argv.slice(2)],
    {
      stdio: "inherit",
      env: process.env,
    }
  );

  child.on("exit", (code) => {
    process.exit(code ?? 0);
  });
} else {
  await import(distPath);
}
