import pc from "picocolors";
import Table from "cli-table3";
import { executeChecks, getAllRules } from "../core/checks/index.js";
import { runPlan } from "./plan.js";
import { t } from "../core/i18n.js";
import type { EcosystemFilter } from "../core/types.js";

export interface CheckCommandOptions {
  project?: string;
  all?: boolean;
  only?: string | string[];
  skip?: string | string[];
  listRules?: boolean;
  plan?: boolean;
  php?: boolean;
  npm?: boolean;
}

export async function runCheck(
  targetPattern?: string,
  options: CheckCommandOptions = {}
): Promise<void> {
  // 1. If user requested --list-rules, display the registered check catalog
  if (options.listRules) {
    const rules = getAllRules();
    console.log(pc.bold(t("commands.check.rulesCatalogTitle")));

    const table = new Table({
      head: [
        pc.cyan(t("commands.check.rulesCatalogTable.ruleId")),
        pc.cyan(t("commands.check.rulesCatalogTable.category")),
        pc.cyan(t("commands.check.rulesCatalogTable.name")),
        pc.cyan(t("commands.check.rulesCatalogTable.default")),
        pc.cyan(t("commands.check.rulesCatalogTable.description")),
      ],
      colWidths: [14, 12, 22, 14, 44],
      wordWrap: true,
    });

    for (const r of rules) {
      let defaultLabel = pc.dim(t("commands.check.rulesCatalogTable.no"));
      if (r.default) {
        defaultLabel = pc.green(t("commands.check.rulesCatalogTable.yesFast"));
      } else if (r.heavy || r.id === "standalone") {
        defaultLabel = pc.yellow(t("commands.check.rulesCatalogTable.allInclude"));
      }

      table.push([
        pc.bold(r.id),
        pc.dim(r.category),
        pc.bold(r.name),
        defaultLabel,
        r.description,
      ]);
    }

    console.log(table.toString());
    console.log("");
    return;
  }

  const effectiveTarget = options.project || targetPattern;

  // 2. If user requested topological DAG execution plan
  if (options.plan) {
    await runPlan(effectiveTarget, { project: options.project });
    return;
  }

  // 3. Normal check execution
  const ecoFilter: EcosystemFilter = options.php ? "composer" : options.npm ? "npm" : "all";

  // Normalize only & skip options (can be string or array)
  const ruleIds = options.only
    ? Array.isArray(options.only)
      ? options.only
      : options.only.split(",")
    : undefined;

  const skipRuleIds = options.skip
    ? Array.isArray(options.skip)
      ? options.skip
      : options.skip.split(",")
    : undefined;

  const result = await executeChecks({
    targetPattern: effectiveTarget,
    ecosystemFilter: ecoFilter,
    all: options.all,
    ruleIds,
    skipRuleIds,
  });

  if (!result.passed) {
    process.exit(1);
  }
}
