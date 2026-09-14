import pc from "picocolors";
import Table from "cli-table3";
import { findWorkspaceRoot, getWorkspaceContext } from "../core/workspace.js";
import { scanWorkspaceProjects } from "../core/scanner.js";
import { calculateAffectedProjects } from "../core/affected.js";
import { isZh } from "../core/i18n.js";

export interface AffectedCommandOptions {
  base?: string;
  plain?: boolean;
  type?: "all" | "direct" | "downstream";
  php?: boolean;
  npm?: boolean;
}

export async function runAffected(options: AffectedCommandOptions = {}): Promise<void> {
  const zh = isZh();
  const rootDir = findWorkspaceRoot();
  if (!rootDir) {
    console.error(pc.red(zh ? "✖ 无法定位工作区根目录。" : "✖ Cannot locate workspace root."));
    process.exit(1);
  }

  const ctx = getWorkspaceContext(rootDir);
  const projects = await scanWorkspaceProjects(ctx);

  const result = await calculateAffectedProjects(projects, { baseRef: options.base });

  let targetList = result.allAffected;
  if (options.type === "direct") {
    targetList = result.directProjects;
  } else if (options.type === "downstream") {
    targetList = result.downstreamProjects;
  }

  if (options.php) {
    targetList = targetList.filter(
      (item) => item.project.packageManager === "composer" || item.project.packageManager === "hybrid"
    );
  } else if (options.npm) {
    targetList = targetList.filter(
      (item) => item.project.packageManager === "npm" || item.project.packageManager === "hybrid"
    );
  }

  // Plain mode for CI/scripts piping
  if (options.plain) {
    const names = targetList.map((item) => item.project.name);
    if (names.length > 0) {
      console.log(names.join(" "));
    }
    return;
  }

  console.log(
    pc.bold(zh ? "\n🔍 工作区代码变动差量波及分析 (Affected)\n" : "\n🔍 Workspace Affected Change Analysis\n")
  );

  if (options.base) {
    console.log(
      `${pc.cyan(zh ? "对比 Git 基准分支:" : "Comparing against git base:")} ${pc.bold(options.base)}`
    );
  }

  if (!result.hasChanges) {
    console.log(
      pc.green(
        zh
          ? "✔ 工作区代码干净，未检测到受变动影响的项目。\n"
          : "✔ Clean working tree. No affected projects detected in workspace.\n"
      )
    );
    return;
  }

  console.log(
    zh
      ? `共检测到 ${pc.bold(pc.yellow(result.allAffected.length.toString()))} 个受影响项目 ` +
          `(${pc.yellow(result.directProjects.length.toString())} 个直接变动, ${pc.cyan(
            result.downstreamProjects.length.toString()
          )} 个间接受波及下游应用)\n`
      : `Found ${pc.bold(pc.yellow(result.allAffected.length.toString()))} affected project(s) ` +
          `(${pc.yellow(result.directProjects.length.toString())} direct, ${pc.cyan(
            result.downstreamProjects.length.toString()
          )} downstream impact)\n`
  );

  const table = new Table({
    head: zh
      ? [
          pc.cyan("波及类型"),
          pc.cyan("项目名称"),
          pc.cyan("技术生态"),
          pc.cyan("所属分类"),
          pc.cyan("相对路径"),
          pc.cyan("变动原因与触发点"),
        ]
      : [
          pc.cyan("Impact"),
          pc.cyan("Project"),
          pc.cyan("Ecosystem"),
          pc.cyan("Category"),
          pc.cyan("Path"),
          pc.cyan("Reason / Trigger"),
        ],
    colWidths: [14, 24, 12, 12, 26, 36],
    wordWrap: true,
  });

  for (const item of targetList) {
    const p = item.project;
    const isDirect = item.type === "direct";
    const typeBadge = isDirect
      ? pc.bold(pc.yellow(zh ? "● 直接变动" : "● DIRECT"))
      : pc.dim(pc.cyan(zh ? "↳ 间接波及" : "↳ IMPACT"));

    const reasonText = item.reasons.join("; ") || pc.dim(zh ? "代码发生变更" : "changed");

    table.push([
      typeBadge,
      pc.bold(p.name),
      p.packageManager === "npm"
        ? pc.green("npm (node)")
        : p.packageManager === "composer"
        ? pc.blue("composer (php)")
        : pc.magenta(p.packageManager),
      p.category,
      p.relativeDir,
      reasonText,
    ]);
  }

  console.log(table.toString());

  // Show affected dependency paths if any downstream projects exist
  if (result.downstreamProjects.length > 0) {
    console.log(pc.bold(zh ? "\n下游影响传播链路 (Downstream Propagation Chain):" : "\nDownstream Propagation Chain:"));
    for (const down of result.downstreamProjects) {
      if (down.depChain && down.depChain.length > 0) {
        console.log(`  • ${pc.bold(down.project.name)}: ${down.depChain.join(" ➔ ")}`);
      } else {
        console.log(`  • ${pc.bold(down.project.name)}: ${down.reasons.join(", ")}`);
      }
    }
  }

  console.log("");
}
