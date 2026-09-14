import type { CheckRule } from "./types.js";
import { linkageRule } from "./rules/linkage.js";
import { manifestRule } from "./rules/manifest.js";
import { distRule } from "./rules/dist.js";
import { gitRule } from "./rules/git.js";
import { upstreamRule } from "./rules/upstream.js";
import { lockfileRule } from "./rules/lockfile.js";
import { phantomRule } from "./rules/phantom.js";
import { standaloneRule } from "./rules/standalone.js";

/**
 * All registered check rules in leoms
 */
const ALL_RULES: CheckRule[] = [
  linkageRule,
  manifestRule,
  distRule,
  gitRule,
  upstreamRule,
  lockfileRule,
  phantomRule,
  standaloneRule,
];

const RULE_MAP = new Map<string, CheckRule>();
for (const rule of ALL_RULES) {
  RULE_MAP.set(rule.id, rule);
}

/**
 * Get all registered rules
 */
export function getAllRules(): CheckRule[] {
  return [...ALL_RULES];
}

/**
 * Get a specific rule by ID
 */
export function getRule(id: string): CheckRule | undefined {
  return RULE_MAP.get(id);
}

/**
 * Resolve rules to run based on user options:
 * - If `ruleIds` is specified: runs ONLY those matching rules (e.g. ['standalone', 'git'])
 * - If `all` is true: runs ALL 8 rules (including phantom AST scan and standalone portability)
 * - Otherwise (default): runs fast daily development health checks (linkage, manifest, dist, git, upstream, lockfile)
 * - Finally: filters out any rule in `skipRuleIds`
 */
export function resolveRules(options: {
  ruleIds?: string[];
  skipRuleIds?: string[];
  all?: boolean;
}): CheckRule[] {
  const { ruleIds, skipRuleIds, all } = options;

  let selected: CheckRule[] = [];

  if (ruleIds && ruleIds.length > 0) {
    const requested = new Set(ruleIds.flatMap((id) => id.split(",").map((s) => s.trim())).filter(Boolean));
    selected = ALL_RULES.filter((r) => requested.has(r.id));
  } else if (all) {
    // --all: runs 100% full check suite across all dimensions
    selected = [...ALL_RULES];
  } else {
    // default: fast, daily development health checks
    selected = ALL_RULES.filter((r) => r.default);
  }

  if (skipRuleIds && skipRuleIds.length > 0) {
    const skipped = new Set(skipRuleIds.flatMap((id) => id.split(",").map((s) => s.trim())).filter(Boolean));
    selected = selected.filter((r) => !skipped.has(r.id));
  }

  return selected;
}
