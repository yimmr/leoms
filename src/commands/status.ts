import pc from "picocolors";
import Table from "cli-table3";
import {
  findWorkspaceRoot,
  getWorkspaceContext,
  resolveTargetProjects,
  getProjectFromCwd,
} from "../core/workspace.js";
import { scanWorkspaceProjects } from "../core/scanner.js";
import { isZh } from "../core/i18n.js";
import type { ProjectCategory, ProjectModel } from "../core/types.js";

function getCategoryTitles(
  zh: boolean,
  customCategories?: Record<string, string>
): Record<string, { title: string; icon: string }> {
  const titles: Record<string, { title: string; icon: string }> = {
    packages: { title: zh ? "公共包 (Packages)" : "Packages (开源公共包)", icon: "📦" },
    libs: { title: zh ? "私有库 (Libs)" : "Libs (私有公共包)", icon: "🔒" },
    apps: { title: zh ? "业务应用 (Apps)" : "Apps (自研业务应用)", icon: "🚀" },
    other: { title: zh ? "其他扩展 (Other)" : "Other Projects", icon: "📁" },
  };

  if (customCategories) {
    for (const [key, label] of Object.entries(customCategories)) {
      if (!titles[key]) {
        titles[key] = { title: `${label} (${key})`, icon: "📁" };
      }
    }
  }

  return titles;
}

function formatGitStatus(proj: ProjectModel, zh: boolean): string {
  const git = proj.git;
  if (!git.isGitRepo) {
    return pc.dim(zh ? "无 Git" : "no git");
  }

  const parts: string[] = [];

  // Branch
  if (git.branch) {
    parts.push(pc.cyan(`(${git.branch})`));
  }

  // Dirty
  if (git.isDirty) {
    parts.push(pc.yellow(zh ? `⚠ ${git.dirtyCount} 个未提交变动` : `⚠ ${git.dirtyCount} dirty`));
  } else {
    parts.push(pc.green(zh ? "✔ 干净" : "✔ clean"));
  }

  // Ahead / Tag
  if (git.commitsAhead > 0) {
    if (git.latestTag) {
      parts.push(
        pc.magenta(
          zh ? `⬆ 领先 ${git.latestTag} ${git.commitsAhead} 个提交` : `⬆ ${git.commitsAhead} ahead of ${git.latestTag}`
        )
      );
    } else {
      parts.push(
        pc.magenta(zh ? `⬆ ${git.commitsAhead} 个未打 Tag 提交` : `⬆ ${git.commitsAhead} commits (untagged)`)
      );
    }
  }

  if (git.isStandalone) {
    parts.push(pc.dim(zh ? "[独立仓库]" : "[standalone]"));
  }

  return parts.join(" ");
}

function formatDepsAndNotes(proj: ProjectModel, zh: boolean): string {
  const notes: string[] = [];

  // Workspace Dependencies
  if (proj.workspaceDependencies.length > 0) {
    const depList = proj.workspaceDependencies
      .map((d) => (d.ecosystem === "composer" ? pc.blue(d.name) : pc.green(d.name)))
      .join(", ");
    notes.push(`${pc.dim(zh ? "依赖:" : "depends on:")} ${depList}`);
  }

  // Dependents (who uses this package)
  if (proj.dependents.length > 0) {
    const depList = proj.dependents.map((name) => pc.yellow(name)).join(", ");
    notes.push(`${pc.dim(zh ? "被引用:" : "used by:")} ${depList}`);
  }

  // Build requirement
  if (proj.needsBuild) {
    if (proj.hasBuildArtifact) {
      notes.push(pc.green(zh ? "产物: 已就绪" : "dist: ready"));
    } else {
      notes.push(pc.red(zh ? "产物: 缺失 (待构建)" : "dist: missing (build needed)"));
    }
  }

  return notes.length > 0 ? notes.join("\n") : pc.dim("-");
}

function renderSingleProjectCard(proj: ProjectModel, zh: boolean): void {
  const titles = getCategoryTitles(zh);
  const catMeta = titles[proj.category] || { title: proj.category, icon: "📁" };

  console.log(
    pc.bold(
      zh
        ? `\n📌 项目资产详情看板: ${pc.cyan(proj.name)}\n`
        : `\n📌 Project Asset Details: ${pc.cyan(proj.name)}\n`
    )
  );

  const table = new Table({
    colWidths: [22, 60],
    wordWrap: true,
  });

  table.push([pc.cyan(zh ? "项目名称 (Name)" : "Name"), pc.bold(proj.name)]);
  table.push([pc.cyan(zh ? "版本号 (Version)" : "Version"), pc.yellow(`v${proj.version || "0.0.0"}`)]);
  table.push([pc.cyan(zh ? "相对路径 (Path)" : "Path"), pc.dim(proj.relativeDir)]);
  table.push([pc.cyan(zh ? "项目类型 (Category)" : "Category"), `${catMeta.icon} ${catMeta.title}`]);
  table.push([
    pc.cyan(zh ? "技术生态 (Ecosystem)" : "Ecosystem"),
    proj.packageManager === "hybrid"
      ? pc.magenta("npm + php (双生态)")
      : proj.packageManager === "composer"
      ? pc.blue("PHP (Composer)")
      : pc.green("Node (npm/pnpm)"),
  ]);
  table.push([pc.cyan(zh ? "Git 状态 (Git)" : "Git"), formatGitStatus(proj, zh)]);

  // Dependencies
  const depList =
    proj.workspaceDependencies.length > 0
      ? proj.workspaceDependencies
          .map((d) => (d.ecosystem === "composer" ? pc.blue(d.name) : pc.green(d.name)))
          .join(", ")
      : pc.dim(zh ? "(无内部依赖)" : "(none)");
  table.push([pc.cyan(zh ? "上游依赖 (Depends On)" : "Depends On"), depList]);

  // Dependents
  const usedByList =
    proj.dependents.length > 0
      ? proj.dependents.map((name) => pc.yellow(name)).join(", ")
      : pc.dim(zh ? "(无下游引用)" : "(none)");
  table.push([pc.cyan(zh ? "下游引用 (Used By)" : "Used By"), usedByList]);

  // Build requirement & artifact
  if (proj.needsBuild) {
    table.push([
      pc.cyan(zh ? "构建产物 (Dist)" : "Dist Artifact"),
      proj.hasBuildArtifact
        ? pc.green(zh ? "✔ 已就绪" : "✔ ready")
        : pc.red(zh ? `✖ 缺失 (可运行 leoms build -p ${proj.name})` : "✖ missing (run leoms build)"),
    ]);
  }

  console.log(table.toString());

  // Proactive hints
  if (proj.git.hasUnpublished && proj.dependents.length > 0) {
    console.log(
      pc.yellow(
        zh
          ? `\n⚠ 发版风险提示: 该项目存在未发布/未打 Tag 的提交，且被下游项目 [${proj.dependents.join(
              ", "
            )}] 引用。若修改了公共接口，下游可能会出现不一致。`
          : `\n⚠ Release Warning: Unreleased commits present and depended on by [${proj.dependents.join(", ")}].`
      )
    );
  }
  console.log("");
}

export interface StatusCommandOptions {
  project?: string;
  all?: boolean;
  php?: boolean;
  npm?: boolean;
}

export async function runStatus(
  targetQuery?: string,
  options: StatusCommandOptions = {}
): Promise<void> {
  const zh = isZh();
  const rootDir = findWorkspaceRoot();
  if (!rootDir) {
    console.error(pc.red(zh ? "✖ 无法定位工作区根目录。" : "✖ Cannot locate workspace root."));
    process.exit(1);
  }

  const ctx = getWorkspaceContext(rootDir);
  const projects = await scanWorkspaceProjects(ctx);

  let filtered = projects;
  const targetPattern = options.project || targetQuery;

  // If a target pattern is specified, or if we are not forcing --all and CWD is a project
  if (targetPattern) {
    const { targets } = resolveTargetProjects(
      projects,
      rootDir,
      targetPattern,
      options.php ? "composer" : options.npm ? "npm" : "all"
    );

    if (targets.length === 0) {
      console.error(
        pc.red(zh ? `✖ 未找到匹配 "${targetPattern}" 的项目。` : `✖ No project found matching "${targetPattern}".`)
      );
      process.exit(1);
    }

    if (targets.length === 1) {
      renderSingleProjectCard(targets[0], zh);
      return;
    }

    // Multiple matches for pattern: filter dashboard to matched projects
    filtered = targets;
  } else if (!options.all) {
    const cwdProj = getProjectFromCwd(projects, rootDir);
    if (cwdProj) {
      renderSingleProjectCard(cwdProj, zh);
      return;
    }
  }
  let ecoBadge = "";
  if (options.php) {
    filtered = projects.filter((p) => p.packageManager === "composer" || p.packageManager === "hybrid");
    ecoBadge = pc.blue(zh ? " [仅限 PHP / Composer]" : " [PHP / Composer Only]");
  } else if (options.npm) {
    filtered = projects.filter((p) => p.packageManager === "npm" || p.packageManager === "hybrid");
    ecoBadge = pc.green(zh ? " [仅限 Node / NPM]" : " [Node / NPM Only]");
  }

  console.log(
    pc.bold(
      zh
        ? `\n📊 工作区多语言多仓库全局资产状态大盘${ecoBadge}\n`
        : `\n📊 Multi-Repo Workspace Asset Status Dashboard${ecoBadge}\n`
    )
  );

  // Group by category
  const standardCategories: ProjectCategory[] = ["packages", "libs", "apps"];
  const discoveredCategories = Array.from(new Set(filtered.map((p) => p.category)));
  const customCategories = discoveredCategories.filter(
    (c) => !standardCategories.includes(c) && c !== "other"
  );
  const categories: ProjectCategory[] = [...standardCategories, ...customCategories, "other"];

  const grouped = new Map<ProjectCategory, ProjectModel[]>();
  for (const cat of categories) {
    grouped.set(cat, []);
  }

  for (const proj of filtered) {
    const list = grouped.get(proj.category) || [];
    list.push(proj);
    grouped.set(proj.category, list);
  }

  let totalDirty = 0;
  let totalUnreleased = 0;
  let totalGitRepos = 0;
  const warnings: string[] = [];
  const titles = getCategoryTitles(zh, ctx.config.categories);

  for (const [cat, catProjects] of grouped.entries()) {
    if (catProjects.length === 0) continue;
    const meta = titles[cat as ProjectCategory] || { title: cat, icon: "📁" };
    console.log(pc.bold(`${meta.icon} ${meta.title}`));

    const table = new Table({
      head: zh
        ? [pc.cyan("项目名称"), pc.cyan("相对路径"), pc.cyan("技术生态"), pc.cyan("Git 状态"), pc.cyan("依赖关系与构建")]
        : [pc.cyan("Project"), pc.cyan("Path"), pc.cyan("Ecosystem"), pc.cyan("Git Status"), pc.cyan("Relations & Build")],
      colWidths: [24, 22, 12, 38, 38],
      wordWrap: true,
    });

    for (const proj of catProjects) {
      if (proj.git.isGitRepo) {
        totalGitRepos++;
        if (proj.git.isDirty) totalDirty++;
        if (proj.git.hasUnpublished) totalUnreleased++;
      }

      // Check for risks: if a package has unreleased changes and has dependents
      if (proj.git.hasUnpublished && proj.dependents.length > 0) {
        warnings.push(
          zh
            ? `项目 ${pc.bold(proj.name)} 存在未发布变更 (ahead/dirty)，但被以下下游项目引用: ${pc.yellow(
                proj.dependents.join(", ")
              )}`
            : `Project ${pc.bold(proj.name)} has unreleased changes (ahead/dirty), but is depended on by: ${pc.yellow(
                proj.dependents.join(", ")
              )}`
        );
      }

      let eco = "";
      if (proj.packageManager === "hybrid") eco = pc.magenta("npm+php");
      else if (proj.packageManager === "npm") eco = pc.green("npm");
      else if (proj.packageManager === "composer") eco = pc.blue("php");
      else eco = pc.dim(zh ? "未知" : "unknown");

      const nameVer = `${pc.bold(proj.name)}\n${pc.dim("v" + (proj.version || "0.0.0"))}`;

      table.push([
        nameVer,
        pc.dim(proj.relativeDir),
        eco,
        formatGitStatus(proj, zh),
        formatDepsAndNotes(proj, zh),
      ]);
    }

    console.log(table.toString());
    console.log("");
  }

  // Summary bar
  console.log(pc.bold(zh ? "──────── 工作区资产大盘汇总 ────────" : "──────── Summary & Insights ────────"));
  console.log(
    zh
      ? `项目总数: ${pc.bold(projects.length.toString())} | Git 仓库: ${pc.cyan(totalGitRepos.toString())} | 待提交: ${
          totalDirty > 0 ? pc.yellow(totalDirty.toString()) : pc.green("0")
        } | 待发版: ${totalUnreleased > 0 ? pc.magenta(totalUnreleased.toString()) : pc.green("0")}`
      : `Total: ${pc.bold(projects.length.toString())} | Git Repos: ${pc.cyan(totalGitRepos.toString())} | Dirty: ${
          totalDirty > 0 ? pc.yellow(totalDirty.toString()) : pc.green("0")
        } | Unreleased: ${totalUnreleased > 0 ? pc.magenta(totalUnreleased.toString()) : pc.green("0")}`
  );

  if (warnings.length > 0) {
    console.log(
      pc.yellow(zh ? `\n⚠ 跨包依赖发版风险提示 (${warnings.length}):` : `\n⚠ Dependency Release Warnings (${warnings.length}):`)
    );
    for (const w of warnings) {
      console.log(`  • ${w}`);
    }
  } else {
    console.log(
      pc.green(zh ? "\n✔ 未检测到跨包依赖发版风险，工作区资产状态良好。" : "\n✔ No cross-package release risks detected.")
    );
  }
  console.log("");
}
