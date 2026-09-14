import { existsSync, lstatSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { isVersionSatisfied } from "../../../utils/semver.js";
import type { CheckRule, CheckRuleContext, CheckIssue } from "../types.js";
import { t } from "../../i18n.js";

export const linkageRule: CheckRule = {
  id: "linkage",
  get name() {
    return t("rules.linkage.name");
  },
  get description() {
    return t("rules.linkage.description");
  },
  category: "health",
  default: true,
  run(context: CheckRuleContext): CheckIssue[] {
    const { project, projectMap, ecosystemFilter, workspace } = context;
    const issues: CheckIssue[] = [];

    const targetDeps = project.workspaceDependencies.filter(
      (d) => ecosystemFilter === "all" || d.ecosystem === ecosystemFilter
    );

    for (const dep of targetDeps) {
      const targetProject = projectMap.get(dep.name);
      const targetRelPath = dep.targetPath || (targetProject ? targetProject.relativeDir : "unknown");
      const targetAbsPath = resolve(workspace.rootDir, targetRelPath);

      let installedPath: string;
      if (dep.ecosystem === "npm") {
        installedPath = join(project.path, "node_modules", dep.name);
      } else {
        installedPath = join(project.path, "vendor", dep.name);
      }

      // 1. Installation & Linkage Check
      if (!existsSync(installedPath)) {
        issues.push({
          level: "error",
          ruleId: "linkage",
          ruleName: linkageRule.name,
          project: project.name,
          projectRelativeDir: project.relativeDir,
          message: `内部依赖 "${dep.name}" 未在本地安装 (${dep.ecosystem === "npm" ? "node_modules" : "vendor"})。`,
          remedy: dep.ecosystem === "npm" ? "运行 `pnpm install`" : "运行 `leoms i --php` 或 `composer install`",
        });
      } else {
        try {
          const lstat = lstatSync(installedPath);
          if (lstat.isSymbolicLink()) {
            const real = realpathSync(installedPath);
            if (real !== targetAbsPath && real !== targetAbsPath + "/") {
              issues.push({
                level: "warn",
                ruleId: "linkage",
                ruleName: linkageRule.name,
                project: project.name,
                projectRelativeDir: project.relativeDir,
                message: `依赖 "${dep.name}" 软链指向了非预期路径: ${real}`,
                remedy: "重新运行安装命令以刷新软链",
              });
            }
          } else {
            // Real directory = downloaded copy instead of symlink
            issues.push({
              level: "warn",
              ruleId: "linkage",
              ruleName: linkageRule.name,
              project: project.name,
              projectRelativeDir: project.relativeDir,
              message: `依赖 "${dep.name}" 安装自远端 Registry 而非本地工作区软链。`,
              remedy:
                dep.ecosystem === "npm"
                  ? "检查 pnpm-workspace.yaml 是否包含了该包所在目录"
                  : "检查 .leoms/composer/config.json 路径仓库配置",
            });
          }
        } catch (err: any) {
          issues.push({
            level: "error",
            ruleId: "linkage",
            ruleName: linkageRule.name,
            project: project.name,
            projectRelativeDir: project.relativeDir,
            message: `依赖 "${dep.name}" 文件系统探测失败: ${err.message}`,
          });
        }
      }

      // 2. SemVer satisfaction check
      if (targetProject?.version) {
        const satisfied = isVersionSatisfied(dep.versionReq, targetProject.version);
        if (!satisfied) {
          issues.push({
            level: "warn",
            ruleId: "linkage",
            ruleName: linkageRule.name,
            project: project.name,
            projectRelativeDir: project.relativeDir,
            message: `依赖版本范围不满足: 声明了 "${dep.versionReq}"，但本地工作区包实际版本为 v${targetProject.version}`,
            remedy: `更新清单依赖版本范围或运行 \`leoms add ${dep.name}\``,
          });
        }
      }
    }

    return issues;
  },
};
