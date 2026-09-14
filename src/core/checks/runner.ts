import pc from "picocolors";
import Table from "cli-table3";
import { findWorkspaceRoot, getWorkspaceContext, resolveTargetProjects } from "../workspace.js";
import { scanWorkspaceProjects } from "../scanner.js";
import { resolveRules } from "./registry.js";
import { t } from "../i18n.js";
import type {
  CheckIssue,
  CheckRule,
  CheckRuleContext,
  ExecuteChecksOptions,
  CheckExecutionResult,
} from "./types.js";
import type { ProjectModel, EcosystemFilter } from "../types.js";

/**
 * Core checks runner: orchestrates rules execution across target projects.
 * Does not contain specific check logic itself; delegates to pluggable CheckRules.
 */
export async function executeChecks(
  options: ExecuteChecksOptions = {}
): Promise<CheckExecutionResult> {
  const rootDir = options.rootDir || findWorkspaceRoot();
  if (!rootDir) {
    throw new Error(t("runner.noRoot"));
  }

  const ctx = getWorkspaceContext(rootDir);
  const allProjects = await scanWorkspaceProjects(ctx);
  const projectMap = new Map<string, ProjectModel>();
  for (const p of allProjects) {
    projectMap.set(p.name, p);
  }

  const ecoFilter: EcosystemFilter = options.ecosystemFilter || "all";

  // Resolve target projects
  let targets: ProjectModel[] = [];
  let isCwdTarget = false;

  if (options.targets && options.targets.length > 0) {
    targets = options.targets;
  } else {
    const resolved = resolveTargetProjects(allProjects, rootDir, options.targetPattern, ecoFilter);
    targets = resolved.targets;
    isCwdTarget = resolved.isCwdTarget;
  }

  if (targets.length === 0) {
    if (!options.silent) {
      console.error(
        pc.red(
          t("runner.noTargetMatch", {
            eco: ecoFilter !== "all" ? ecoFilter + " " : "",
          })
        )
      );
    }
    return {
      passed: false,
      totalErrors: 1,
      totalWarnings: 0,
      issues: [
        {
          level: "error",
          ruleId: "runner",
          ruleName: t("runner.targetResolution"),
          project: options.targetPattern || "unknown",
          projectRelativeDir: ".",
          message: `${t("runner.targetResolution")}: ${options.targetPattern || "none"}`,
        },
      ],
      executedRules: [],
      targets: [],
    };
  }

  // Resolve rules to execute
  const executedRules = resolveRules({
    ruleIds: options.ruleIds,
    skipRuleIds: options.skipRuleIds,
    all: options.all,
  });

  if (executedRules.length === 0) {
    if (!options.silent) {
      console.log(pc.yellow(t("runner.noRulesSelected")));
    }
    return {
      passed: true,
      totalErrors: 0,
      totalWarnings: 0,
      issues: [],
      executedRules: [],
      targets,
    };
  }

  if (!options.silent) {
    if (isCwdTarget) {
      console.log(
        pc.dim(
          t("runner.autoDetectCwd", {
            name: targets[0].name,
            dir: targets[0].relativeDir,
          })
        )
      );
    }
    const ruleBadges = executedRules.map((r) => pc.cyan(r.id)).join(", ");
    console.log(
      pc.bold(
        t("runner.runningChecks", {
          targetCount: pc.bold(targets.length.toString()),
          ruleCount: pc.bold(executedRules.length.toString()),
          badges: ruleBadges,
        })
      )
    );
  }

  const allIssues: CheckIssue[] = [];

  // Execute rules across all target projects
  for (const project of targets) {
    const ruleContext: CheckRuleContext = {
      workspace: ctx,
      project,
      allProjects,
      projectMap,
      ecosystemFilter: ecoFilter,
    };

    for (const rule of executedRules) {
      try {
        const issues = await rule.run(ruleContext);
        if (issues && issues.length > 0) {
          allIssues.push(...issues);
        }
      } catch (err: any) {
        allIssues.push({
          level: "error",
          ruleId: rule.id,
          ruleName: rule.name,
          project: project.name,
          projectRelativeDir: project.relativeDir,
          message: t("runner.ruleException", {
            ruleId: rule.id,
            message: err.message,
          }),
        });
      }
    }
  }

  const errors = allIssues.filter((i) => i.level === "error");
  const warnings = allIssues.filter((i) => i.level === "warn");
  const passed = errors.length === 0;

  // Render report if not silent
  if (!options.silent) {
    if (allIssues.length === 0) {
      console.log(
        pc.green(
          t("runner.allPassed", {
            targetCount: targets.length,
            ruleCount: executedRules.length,
          })
        )
      );
    } else {
      const table = new Table({
        head: [
          pc.cyan(t("runner.table.level")),
          pc.cyan(t("runner.table.rule")),
          pc.cyan(t("runner.table.target")),
          pc.cyan(t("runner.table.issue")),
          pc.cyan(t("runner.table.remedy")),
        ],
        colWidths: [10, 18, 22, 38, 36],
        wordWrap: true,
      });

      for (const issue of allIssues) {
        table.push([
          issue.level === "error" ? pc.red("BLOCK") : pc.yellow("WARN"),
          pc.bold(issue.ruleId),
          `${pc.bold(issue.project)}\n${pc.dim(issue.projectRelativeDir)}`,
          issue.message,
          issue.remedy ? pc.dim(issue.remedy) : pc.dim("-"),
        ]);
      }

      console.log(table.toString());
      console.log("");
      console.log(pc.bold(t("runner.summary.title")));

      if (errors.length > 0) {
        console.log(
          pc.red(
            t("runner.summary.failed", {
              errors: errors.length,
              warnings: warnings.length,
            })
          )
        );
        console.log(pc.red(t("runner.summary.failedHint")));
      } else {
        console.log(
          pc.yellow(
            t("runner.summary.passedWithWarnings", {
              warnings: warnings.length,
            })
          )
        );
        console.log(pc.cyan(t("runner.summary.passedWithWarningsHint")));
      }
    }
  }

  return {
    passed,
    totalErrors: errors.length,
    totalWarnings: warnings.length,
    issues: allIssues,
    executedRules,
    targets,
  };
}
