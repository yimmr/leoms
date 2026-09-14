import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type { CheckRule, CheckRuleContext, CheckIssue } from "../types.js";
import { t } from "../../i18n.js";

const NODE_BUILTINS = new Set([
  "assert", "async_hooks", "buffer", "child_process", "cluster", "console", "constants",
  "crypto", "dgram", "diagnostics_channel", "dns", "domain", "events", "fs", "fs/promises",
  "http", "http2", "https", "inspector", "module", "net", "os", "path", "perf_hooks",
  "process", "punycode", "querystring", "readline", "repl", "stream", "stream/promises",
  "string_decoder", "timers", "timers/promises", "tls", "trace_events", "tty", "url",
  "util", "v8", "vm", "wasi", "worker_threads", "zlib"
]);

function scanSourceFiles(dir: string, extensions: string[], maxFiles = 300): string[] {
  const results: string[] = [];
  const ignoredDirs = new Set([
    "node_modules", "vendor", "dist", "build", ".git", ".next", ".turbo", ".leoms", "coverage"
  ]);

  function walk(currentDir: string) {
    if (results.length >= maxFiles) return;
    let entries: string[];
    try {
      entries = readdirSync(currentDir);
    } catch {
      return;
    }

    for (const entry of entries) {
      if (ignoredDirs.has(entry) || entry.startsWith(".")) continue;
      const fullPath = join(currentDir, entry);
      try {
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          walk(fullPath);
        } else if (stat.isFile()) {
          const match = extensions.some((ext) => entry.endsWith(ext));
          if (match) {
            results.push(fullPath);
            if (results.length >= maxFiles) break;
          }
        }
      } catch {}
    }
  }

  walk(dir);
  return results;
}

export const phantomRule: CheckRule = {
  id: "phantom",
  get name() {
    return t("rules.phantom.name");
  },
  get description() {
    return t("rules.phantom.description");
  },
  category: "hygiene",
  default: false, // Heavy task: enabled in --all or via --only phantom
  heavy: true,
  run(context: CheckRuleContext): CheckIssue[] {
    const { project, allProjects, ecosystemFilter } = context;
    const issues: CheckIssue[] = [];

    // 1. JS / TS Phantom Dependencies
    const pkgJsonPath = join(project.path, "package.json");
    if (ecosystemFilter !== "composer" && existsSync(pkgJsonPath)) {
      let declaredDeps = new Set<string>();
      try {
        const rawPkg = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
        const allDeclared = {
          ...rawPkg.dependencies,
          ...rawPkg.devDependencies,
          ...rawPkg.peerDependencies,
          ...rawPkg.optionalDependencies,
        };
        declaredDeps = new Set(Object.keys(allDeclared));
      } catch {}

      const jsFiles = scanSourceFiles(project.path, [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
      const importRegex = /(?:import\s+(?:[\w*\s{},]*\s+from\s+)?['"]([^'"]+)['"]|import\(['"]([^'"]+)['"]\)|require\(['"]([^'"]+)['"]\))/g;

      for (const file of jsFiles) {
        let content = "";
        try {
          content = readFileSync(file, "utf8");
        } catch {
          continue;
        }

        const lines = content.split("\n");
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line.trim().startsWith("//") || line.trim().startsWith("/*")) continue;

          let match: RegExpExecArray | null;
          importRegex.lastIndex = 0;
          while ((match = importRegex.exec(line)) !== null) {
            const specifier = match[1] || match[2] || match[3];
            if (!specifier) continue;
            if (specifier.startsWith(".") || specifier.startsWith("/")) continue;
            if (specifier.startsWith("node:")) continue;
            if (NODE_BUILTINS.has(specifier)) continue;

            let pkgName: string;
            if (specifier.startsWith("@")) {
              const parts = specifier.split("/");
              pkgName = parts.slice(0, 2).join("/");
            } else {
              pkgName = specifier.split("/")[0];
            }

            if (pkgName === project.name) continue;

            const isDeclared = declaredDeps.has(pkgName) || declaredDeps.has(`@types/${pkgName}`);
            if (!isDeclared) {
              const relFile = relative(project.path, file);
              const alreadyFound = issues.some(
                (issue) => issue.message.includes(`"${pkgName}"`) && issue.message.includes(relFile)
              );
              if (!alreadyFound) {
                issues.push({
                  level: "warn",
                  ruleId: "phantom",
                  ruleName: phantomRule.name,
                  project: project.name,
                  projectRelativeDir: project.relativeDir,
                  message: `发现幽灵依赖 "${pkgName}" 在 ${relFile}:${i + 1} 被引用，但未在 package.json 中声明。`,
                  remedy: `运行 \`pnpm --filter ${project.name} add ${pkgName}\` 显式声明依赖`,
                });
              }
            }
          }
        }
      }
    }

    // 2. PHP Phantom Dependencies
    const compJsonPath = join(project.path, "composer.json");
    if (ecosystemFilter !== "npm" && existsSync(compJsonPath)) {
      let declaredPhpDeps = new Set<string>();
      try {
        const rawComp = JSON.parse(readFileSync(compJsonPath, "utf8"));
        const allDeclared = {
          ...rawComp.require,
          ...rawComp["require-dev"],
        };
        declaredPhpDeps = new Set(Object.keys(allDeclared));
      } catch {}

      const namespaceToPkg = new Map<string, string>();
      for (const other of allProjects) {
        if (
          other.name === project.name ||
          (other.packageManager !== "composer" && other.packageManager !== "hybrid")
        )
          continue;
        const otherCompPath = join(other.path, "composer.json");
        if (existsSync(otherCompPath)) {
          try {
            const c = JSON.parse(readFileSync(otherCompPath, "utf8"));
            const psr4 = c.autoload?.["psr-4"] || {};
            for (const ns of Object.keys(psr4)) {
              const cleanNs = ns.replace(/\\+$/, "");
              namespaceToPkg.set(cleanNs, other.name);
            }
          } catch {}
        }
      }

      const phpFiles = scanSourceFiles(project.path, [".php"]);
      const useRegex = /use\s+([A-Za-z0-9_\\]+)(?:\s+as\s+[A-Za-z0-9_]+)?;/g;

      for (const file of phpFiles) {
        let content = "";
        try {
          content = readFileSync(file, "utf8");
        } catch {
          continue;
        }

        const lines = content.split("\n");
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (
            line.trim().startsWith("//") ||
            line.trim().startsWith("#") ||
            line.trim().startsWith("/*")
          )
            continue;

          let match: RegExpExecArray | null;
          useRegex.lastIndex = 0;
          while ((match = useRegex.exec(line)) !== null) {
            const fullNs = match[1];
            if (!fullNs) continue;

            for (const [nsPrefix, pkgName] of namespaceToPkg.entries()) {
              if (fullNs.startsWith(nsPrefix)) {
                if (!declaredPhpDeps.has(pkgName)) {
                  const relFile = relative(project.path, file);
                  const alreadyFound = issues.some(
                    (issue) => issue.message.includes(`"${pkgName}"`) && issue.message.includes(relFile)
                  );
                  if (!alreadyFound) {
                    issues.push({
                      level: "warn",
                      ruleId: "phantom",
                      ruleName: phantomRule.name,
                      project: project.name,
                      projectRelativeDir: project.relativeDir,
                      message: `发现幽灵命名空间 "${fullNs}" (${pkgName}) 在 ${relFile}:${i + 1} 被引用，但未在 composer.json 中声明。`,
                      remedy: `运行 \`leoms add ${pkgName} -p ${project.name}\` 显式声明依赖`,
                    });
                  }
                }
              }
            }
          }
        }
      }
    }

    return issues;
  },
};
