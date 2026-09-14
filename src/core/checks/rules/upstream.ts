import type { CheckRule, CheckRuleContext, CheckIssue } from "../types.js";
import { t } from "../../i18n.js";

export const upstreamRule: CheckRule = {
  id: "upstream",
  get name() {
    return t("rules.upstream.name");
  },
  get description() {
    return t("rules.upstream.description");
  },
  category: "health",
  default: true,
  run(context: CheckRuleContext): CheckIssue[] {
    const { project, projectMap, ecosystemFilter } = context;
    const issues: CheckIssue[] = [];

    const targetDeps = project.workspaceDependencies.filter(
      (d) => ecosystemFilter === "all" || d.ecosystem === ecosystemFilter
    );

    for (const dep of targetDeps) {
      const targetProj = projectMap.get(dep.name);
      if (targetProj && targetProj.git.hasUnpublished) {
        issues.push({
          level: "warn",
          ruleId: "upstream",
          ruleName: upstreamRule.name,
          project: project.name,
          projectRelativeDir: project.relativeDir,
          message: t("rules.upstream.aheadMessage", {
            dep: dep.name,
            commits: targetProj.git.commitsAhead,
            dirty: targetProj.git.isDirty ? ", worktree dirty" : "",
          }),
          remedy: t("rules.upstream.aheadRemedy", { dep: dep.name }),
        });
      }
    }

    return issues;
  },
};
