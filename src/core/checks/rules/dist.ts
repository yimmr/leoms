import type { CheckRule, CheckRuleContext, CheckIssue } from "../types.js";
import { t } from "../../i18n.js";

export const distRule: CheckRule = {
  id: "dist",
  get name() {
    return t("rules.dist.name");
  },
  get description() {
    return t("rules.dist.description");
  },
  category: "health",
  default: true,
  run(context: CheckRuleContext): CheckIssue[] {
    const { project } = context;
    const issues: CheckIssue[] = [];

    if (project.needsBuild && !project.hasBuildArtifact) {
      issues.push({
        level: "warn",
        ruleId: "dist",
        ruleName: distRule.name,
        project: project.name,
        projectRelativeDir: project.relativeDir,
        message: t("rules.dist.missingMessage"),
        remedy: t("rules.dist.missingRemedy", { project: project.name }),
      });
    }

    return issues;
  },
};
