import type { CheckRule, CheckRuleContext, CheckIssue } from "../types.js";
import { t } from "../../i18n.js";

export const gitRule: CheckRule = {
  id: "git",
  get name() {
    return t("rules.git.name");
  },
  get description() {
    return t("rules.git.description");
  },
  category: "git",
  default: true,
  run(context: CheckRuleContext): CheckIssue[] {
    const { project } = context;
    const issues: CheckIssue[] = [];

    if (project.git.isDirty) {
      issues.push({
        level: "warn",
        ruleId: "git",
        ruleName: gitRule.name,
        project: project.name,
        projectRelativeDir: project.relativeDir,
        message: t("rules.git.dirtyMessage", { count: project.git.dirtyCount }),
        remedy: t("rules.git.dirtyRemedy", { dir: project.relativeDir }),
      });
    }

    return issues;
  },
};
