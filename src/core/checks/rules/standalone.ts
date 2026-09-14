import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { CheckRule, CheckRuleContext, CheckIssue } from "../types.js";
import { t } from "../../i18n.js";

export const standaloneRule: CheckRule = {
  id: "standalone",
  get name() {
    return t("rules.standalone.name");
  },
  get description() {
    return t("rules.standalone.description");
  },
  category: "standalone",
  default: false, // In daily dev, projects can use @workspace:^. Enabled when --all, --only standalone, or during release/deploy.
  heavy: false,
  run(context: CheckRuleContext): CheckIssue[] {
    const { project, ecosystemFilter } = context;
    const issues: CheckIssue[] = [];

    // 1. Check NPM Manifest for forbidden local protocols when standalone
    const pkgJsonPath = join(project.path, "package.json");
    if (ecosystemFilter !== "composer" && existsSync(pkgJsonPath)) {
      try {
        const rawPkg = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
        const allDeps: Record<string, string> = {
          ...(rawPkg.dependencies || {}),
          ...(rawPkg.devDependencies || {}),
        };

        const forbiddenUsages: string[] = [];
        for (const [dep, ver] of Object.entries(allDeps)) {
          if (typeof ver === "string") {
            if (ver.startsWith("workspace:")) {
              forbiddenUsages.push(`${dep} ("${ver}") - workspace 工作区协议`);
            } else if (ver.startsWith("file:")) {
              forbiddenUsages.push(`${dep} ("${ver}") - file 本地相对路径协议`);
            } else if (ver.startsWith("link:")) {
              forbiddenUsages.push(`${dep} ("${ver}") - link 本地符号链接协议`);
            }
          }
        }

        if (forbiddenUsages.length > 0) {
          issues.push({
            level: "error",
            ruleId: "standalone",
            ruleName: standaloneRule.name,
            project: project.name,
            projectRelativeDir: project.relativeDir,
            message: `离仓自洽拦截：发现禁止的工作区本地协议残留: ${forbiddenUsages.join("; ")}。脱离工作区后他人无法安装此依赖。`,
            remedy: "必须将 workspace: 替换为正式发布的语义化版本号（SemVer），或通过发版命令自动转换",
          });
        }
      } catch (err: any) {
        issues.push({
          level: "error",
          ruleId: "standalone",
          ruleName: standaloneRule.name,
          project: project.name,
          projectRelativeDir: project.relativeDir,
          message: `package.json 解析错误: ${err.message}`,
        });
      }
    }

    // 2. Check Composer Manifest for path repositories
    const compJsonPath = join(project.path, "composer.json");
    if (ecosystemFilter !== "npm" && existsSync(compJsonPath)) {
      try {
        const rawComp = JSON.parse(readFileSync(compJsonPath, "utf8"));
        if (rawComp.repositories) {
          const repos = Array.isArray(rawComp.repositories)
            ? rawComp.repositories
            : Object.values(rawComp.repositories);
          const hasLocalPath = repos.some((r: any) => r && r.type === "path");
          if (hasLocalPath) {
            issues.push({
              level: "error",
              ruleId: "standalone",
              ruleName: standaloneRule.name,
              project: project.name,
              projectRelativeDir: project.relativeDir,
              message: "离仓自洽拦截：composer.json 中发现硬编码的本地 'path' 仓库。脱离当前机器后会变成死路径。",
              remedy: "必须从 composer.json 中移除 path 仓库；本地开发请通过 .leoms/composer/config.json 联动",
            });
          }
        }
      } catch (err: any) {
        issues.push({
          level: "error",
          ruleId: "standalone",
          ruleName: standaloneRule.name,
          project: project.name,
          projectRelativeDir: project.relativeDir,
          message: `composer.json 解析错误: ${err.message}`,
        });
      }
    }

    // 3. Independent Lockfile Check
    // When a project leaves the workspace and is cloned on another machine, it needs its own deterministic lockfile
    const hasPnpmLock = existsSync(join(project.path, "pnpm-lock.yaml"));
    const hasNpmLock = existsSync(join(project.path, "package-lock.json"));
    const hasCompLock = existsSync(join(project.path, "composer.lock"));

    if (
      ecosystemFilter !== "composer" &&
      (project.packageManager === "npm" || project.packageManager === "hybrid")
    ) {
      if (!hasPnpmLock && !hasNpmLock) {
        issues.push({
          level: "error",
          ruleId: "standalone",
          ruleName: standaloneRule.name,
          project: project.name,
          projectRelativeDir: project.relativeDir,
          message: "缺少项目独立的锁文件（pnpm-lock.yaml 或 package-lock.json）。脱离根目录工作区后无法保证确定性依赖版本。",
          remedy: `在 ${project.relativeDir} 下执行 \`pnpm install\` 生成独立锁文件`,
        });
      }
    }

    if (
      ecosystemFilter !== "npm" &&
      (project.packageManager === "composer" || project.packageManager === "hybrid")
    ) {
      if (!hasCompLock) {
        issues.push({
          level: "error",
          ruleId: "standalone",
          ruleName: standaloneRule.name,
          project: project.name,
          projectRelativeDir: project.relativeDir,
          message: "缺少项目独立的 composer.lock 文件。脱离工作区后无法确定性复现 PHP 依赖树。",
          remedy: `在 ${project.relativeDir} 下执行 \`composer update --lock\` 生成独立锁文件`,
        });
      }
    }

    // 4. Artifact Contamination (.leoms leak)
    const distPath = join(project.path, "dist");
    const buildPath = join(project.path, "build");
    const hasLeomsInDist =
      existsSync(join(distPath, ".leoms")) || existsSync(join(buildPath, ".leoms"));

    if (hasLeomsInDist) {
      issues.push({
        level: "error",
        ruleId: "standalone",
        ruleName: standaloneRule.name,
        project: project.name,
        projectRelativeDir: project.relativeDir,
        message: "构建输出目录（dist / build）中泄露了 .leoms 本地工作区工具链配置。",
        remedy: "清理构建输出目录并在打包配置中排除 .leoms",
      });
    }

    return issues;
  },
};
