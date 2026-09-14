import type { ProjectModel, WorkspaceContext, EcosystemFilter } from "../types.js";

export type IssueLevel = "error" | "warn";

export interface CheckIssue {
  level: IssueLevel;
  ruleId: string;
  ruleName: string;
  project: string;
  projectRelativeDir: string;
  message: string;
  remedy?: string;
}

export interface CheckRuleContext {
  workspace: WorkspaceContext;
  project: ProjectModel;
  allProjects: ProjectModel[];
  projectMap: Map<string, ProjectModel>;
  ecosystemFilter: EcosystemFilter;
}

export interface CheckRule {
  id: string;
  name: string;
  description: string;
  category: "health" | "hygiene" | "git" | "standalone";
  /**
   * Whether this rule is enabled in the default `leoms check` run.
   * True for fast, daily health checks.
   * False for deep scans (phantom AST) or standalone portability checks.
   */
  default: boolean;
  /**
   * Heavy tasks (like source code AST/regex scanning).
   * Enabled when `--all` / `-a` is passed.
   */
  heavy?: boolean;
  run(context: CheckRuleContext): Promise<CheckIssue[]> | CheckIssue[];
}

export interface ExecuteChecksOptions {
  targets?: ProjectModel[];
  targetPattern?: string;
  rootDir?: string;
  ecosystemFilter?: EcosystemFilter;
  ruleIds?: string[];      // Run only these explicit rule IDs
  skipRuleIds?: string[];  // Skip these rule IDs
  all?: boolean;           // Include heavy rules (e.g. phantom)
  silent?: boolean;        // Do not render table output to console
}

export interface CheckExecutionResult {
  passed: boolean;
  totalErrors: number;
  totalWarnings: number;
  issues: CheckIssue[];
  executedRules: CheckRule[];
  targets: ProjectModel[];
}
