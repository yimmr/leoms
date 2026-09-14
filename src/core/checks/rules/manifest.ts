import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { CheckRule, CheckRuleContext, CheckIssue } from "../types.js";
import { t } from "../../i18n.js";

export const manifestRule: CheckRule = {
  id: "manifest",
  get name() {
    return t("rules.manifest.name");
  },
  get description() {
    return t("rules.manifest.description");
  },
  category: "hygiene",
  default: true,
  run(context: CheckRuleContext): CheckIssue[] {
    const { project, ecosystemFilter } = context;
    const issues: CheckIssue[] = [];

    // 1. PHP composer.json path repository check
    if (
      ecosystemFilter !== "npm" &&
      (project.packageManager === "composer" || project.packageManager === "hybrid")
    ) {
      const compJsonPath = join(project.path, "composer.json");
      if (existsSync(compJsonPath)) {
        try {
          const raw = JSON.parse(readFileSync(compJsonPath, "utf8"));
          if (raw.repositories) {
            const repos = Array.isArray(raw.repositories) ? raw.repositories : Object.values(raw.repositories);
            const hasLocalPath = repos.some((r: any) => r && r.type === "path");
            if (hasLocalPath) {
              issues.push({
                level: "error",
                ruleId: "manifest",
                ruleName: manifestRule.name,
                project: project.name,
                projectRelativeDir: project.relativeDir,
                message: "在 composer.json 中发现了本地 'path' 仓库配置（破坏多仓库独立性）。",
                remedy: "必须从项目 composer.json 中移除 path 仓库；本地包解析已由 .leoms/composer/config.json 自动完成。",
              });
            }
          }
        } catch (err: any) {
          issues.push({
            level: "error",
            ruleId: "manifest",
            ruleName: manifestRule.name,
            project: project.name,
            projectRelativeDir: project.relativeDir,
            message: `composer.json 解析错误: ${err.message}`,
          });
        }
      }
    }

    // 2. Node package.json file: or link: check
    if (
      ecosystemFilter !== "composer" &&
      (project.packageManager === "npm" || project.packageManager === "hybrid")
    ) {
      const pkgJsonPath = join(project.path, "package.json");
      if (existsSync(pkgJsonPath)) {
        try {
          const rawPkg = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
          const allDeps: Record<string, string> = {
            ...(rawPkg.dependencies || {}),
            ...(rawPkg.devDependencies || {}),
          };

          for (const [dep, ver] of Object.entries(allDeps)) {
            if (typeof ver === "string" && (ver.startsWith("file:") || ver.startsWith("link:"))) {
              issues.push({
                level: "error",
                ruleId: "manifest",
                ruleName: manifestRule.name,
                project: project.name,
                projectRelativeDir: project.relativeDir,
                message: `依赖 "${dep}" 误用了本地 "${ver}" 协议。`,
                remedy: '请替换为标准 "@workspace:^" 或正式 Registry SemVer 版本号。',
              });
            }
          }
        } catch (err: any) {
          issues.push({
            level: "error",
            ruleId: "manifest",
            ruleName: manifestRule.name,
            project: project.name,
            projectRelativeDir: project.relativeDir,
            message: `package.json 解析错误: ${err.message}`,
          });
        }
      }
    }

    return issues;
  },
};
