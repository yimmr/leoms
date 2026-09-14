import { spawn } from "node:child_process";
import { join } from "node:path";
import pc from "picocolors";
import { findWorkspaceRoot, getComposerEnv } from "../core/workspace.js";

export async function runComposerWrapper(args: string[]): Promise<void> {
  const rootDir = findWorkspaceRoot();
  if (!rootDir) {
    console.error(pc.red("✖ Cannot locate workspace root (no pnpm-workspace.yaml or .leoms found upwards)."));
    console.error(pc.yellow("Run `leoms init` first to initialize this directory as a leoms workspace."));
    process.exit(1);
  }

  // Spawn system composer with workspace COMPOSER_HOME if .leoms/composer/config.json exists
  const child = spawn("composer", args, {
    stdio: "inherit",
    env: getComposerEnv(rootDir),
  });

  child.on("error", (err: any) => {
    if (err.code === "ENOENT") {
      console.error(pc.red("✖ Composer CLI not found in system PATH."));
      console.error(pc.yellow("Please install Composer first: https://getcomposer.org/"));
    } else {
      console.error(pc.red(`✖ Failed to run Composer: ${err.message}`));
    }
    process.exit(1);
  });

  child.on("exit", (code) => {
    process.exit(code ?? 0);
  });
}
