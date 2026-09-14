import pc from "picocolors";
import Table from "cli-table3";
import { findWorkspaceRoot, getWorkspaceContext } from "../core/workspace.js";
import { scanWorkspaceProjects } from "../core/scanner.js";

export interface ListCommandOptions {
  php?: boolean;
  npm?: boolean;
}

export async function runList(options: ListCommandOptions = {}): Promise<void> {
  const rootDir = findWorkspaceRoot();
  if (!rootDir) {
    console.error(pc.red("✖ Cannot locate workspace root."));
    process.exit(1);
  }

  const ctx = getWorkspaceContext(rootDir);
  const projects = await scanWorkspaceProjects(ctx);

  let filtered = projects;
  let ecoBadge = "";
  if (options.php) {
    filtered = projects.filter((p) => p.packageManager === "composer" || p.packageManager === "hybrid");
    ecoBadge = pc.blue(" [PHP / Composer Only]");
  } else if (options.npm) {
    filtered = projects.filter((p) => p.packageManager === "npm" || p.packageManager === "hybrid");
    ecoBadge = pc.green(" [Node / NPM Only]");
  }

  console.log(pc.bold(`\n📦 Discovered ${filtered.length} project(s) in workspace${ecoBadge}:\n`));

  const table = new Table({
    head: [pc.cyan("Directory"), pc.cyan("Name"), pc.cyan("Ecosystem"), pc.cyan("Version"), pc.cyan("Git Repo")],
    colWidths: [26, 26, 14, 12, 14],
  });

  for (const proj of filtered) {
    let ecoLabel = "";
    if (proj.packageManager === "hybrid") {
      ecoLabel = pc.magenta("npm+composer");
    } else if (proj.packageManager === "npm") {
      ecoLabel = pc.green("npm");
    } else if (proj.packageManager === "composer") {
      ecoLabel = pc.blue("composer");
    } else {
      ecoLabel = pc.dim("unknown");
    }

    let gitLabel = pc.dim("no git");
    if (proj.git.isGitRepo) {
      gitLabel = proj.git.isStandalone ? pc.green("standalone") : pc.dim("workspace");
    }

    table.push([
      pc.bold(proj.relativeDir),
      proj.name,
      ecoLabel,
      proj.version ? `v${proj.version}` : pc.dim("unversioned"),
      gitLabel,
    ]);
  }

  console.log(table.toString());
  console.log("");
}
