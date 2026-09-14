import { existsSync } from "node:fs";
import { join } from "node:path";
import type { CheckRule, CheckRuleContext, CheckIssue } from "../types.js";
import { t } from "../../i18n.js";

export const lockfileRule: CheckRule = {
  id: "lockfile",
  get name() {
    return t("rules.lockfile.name");
  },
  get description() {
    return t("rules.lockfile.description");
  },
  category: "hygiene",
  default: true,
  run(context: CheckRuleContext): CheckIssue[] {
    const { project, ecosystemFilter, workspace } = context;
    const issues: CheckIssue[] = [];

    // 1. Node lockfile check
    if (
      ecosystemFilter !== "composer" &&
      (project.packageManager === "npm" || project.packageManager === "hybrid")
    ) {
      const projPnpmLock = existsSync(join(project.path, "pnpm-lock.yaml"));
      const projNpmLock = existsSync(join(project.path, "package-lock.json"));
      const rootPnpmLock = existsSync(join(workspace.rootDir, "pnpm-lock.yaml"));

      if (!projPnpmLock && !projNpmLock && !rootPnpmLock) {
        issues.push({
          level: "warn",
          ruleId: "lockfile",
          ruleName: lockfileRule.name,
          project: project.name,
          projectRelativeDir: project.relativeDir,
          message: t("rules.lockfile.missingNodeMessage"),
          remedy: t("rules.lockfile.missingNodeRemedy"),
        });
      }
    }

    // 2. PHP lockfile check (especially for applications/end-projects)
    if (
      ecosystemFilter !== "npm" &&
      (project.packageManager === "composer" || project.packageManager === "hybrid")
    ) {
      const compLock = existsSync(join(project.path, "composer.lock"));
      if (!compLock && (project.category === "apps" || project.private)) {
        issues.push({
          level: "warn",
          ruleId: "lockfile",
          ruleName: lockfileRule.name,
          project: project.name,
          projectRelativeDir: project.relativeDir,
          message: t("rules.lockfile.missingPhpMessage"),
          remedy: t("rules.lockfile.missingPhpRemedy"),
        });
      }
    }

    return issues;
  },
};
