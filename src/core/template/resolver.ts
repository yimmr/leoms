import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import pc from "picocolors";
import { promptSelect } from "../../utils/prompt.js";
import type { TemplateConfig, TemplateInfo, TemplateType } from "./types.js";

/**
 * Locate the built-in templates directory within the leoms package
 */
export function getBuiltinTemplatesDir(): string {
  let current = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 5; i++) {
    const candidate = join(current, "templates");
    const pkgFile = join(current, "package.json");
    if (existsSync(pkgFile)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgFile, "utf-8"));
        if (pkg.name === "leoms") {
          return candidate;
        }
      } catch {}
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return resolve(dirname(fileURLToPath(import.meta.url)), "../../../templates");
}

/**
 * Dynamically load template.config.js / .mjs / .ts / .json
 */
export async function loadTemplateConfig(templateDir: string): Promise<TemplateConfig | null> {
  const candidates = [
    "template.config.js",
    "template.config.mjs",
    "template.config.ts",
    "template.config.json",
  ];

  for (const filename of candidates) {
    const fullPath = join(templateDir, filename);
    if (!existsSync(fullPath)) continue;

    if (filename.endsWith(".json")) {
      try {
        return JSON.parse(readFileSync(fullPath, "utf-8"));
      } catch {
        return null;
      }
    }

    try {
      const fileUrl = pathToFileURL(fullPath).href;
      const mod = await import(fileUrl);
      return mod.default || mod;
    } catch (err: any) {
      console.warn(pc.yellow(`⚠ Failed to load ${filename}: ${err.message}`));
    }
  }

  return null;
}

/**
 * Locate the workspace custom templates directory
 */
export function getWorkspaceTemplatesDir(workspaceRoot: string): string {
  return join(workspaceRoot, ".leoms", "templates");
}

/**
 * Read metadata for a template from template.config.* or package.json
 */
function readTemplateMeta(templateDir: string, fallbackName: string, type: TemplateType): TemplateInfo {
  let description = type === "builtin" ? "Built-in leoms template" : "Workspace custom template";
  let version = "1.0.0";

  const jsonConfig = join(templateDir, "template.config.json");
  const jsConfig = join(templateDir, "template.config.js");
  const mjsConfig = join(templateDir, "template.config.mjs");

  if (existsSync(jsonConfig)) {
    try {
      const cfg = JSON.parse(readFileSync(jsonConfig, "utf-8"));
      if (cfg.description) description = cfg.description;
      if (cfg.version) version = cfg.version;
    } catch {}
  } else if (existsSync(jsConfig) || existsSync(mjsConfig)) {
    try {
      const file = existsSync(jsConfig) ? jsConfig : mjsConfig;
      const content = readFileSync(file, "utf-8");
      const descMatch = content.match(/description\s*:\s*["'`]([^"'`]+)["'`]/);
      if (descMatch) description = descMatch[1];
      const verMatch = content.match(/version\s*:\s*["'`]([^"'`]+)["'`]/);
      if (verMatch) version = verMatch[1];
    } catch {}
  } else {
    // Check template/package.json or root package.json
    const innerPkg = join(templateDir, "template", "package.json");
    const rootPkg = join(templateDir, "package.json");
    const pkgPath = existsSync(innerPkg) ? innerPkg : existsSync(rootPkg) ? rootPkg : null;
    if (pkgPath) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
        if (pkg.description) description = pkg.description;
        if (pkg.version) version = pkg.version;
      } catch {}
    }
  }

  return {
    name: fallbackName,
    type,
    dir: templateDir,
    description,
    version,
  };
}

/**
 * Scan all available templates (both workspace custom and built-in)
 */
export function listAllTemplates(workspaceRoot: string | null): {
  custom: TemplateInfo[];
  builtin: TemplateInfo[];
  all: TemplateInfo[];
} {
  const custom: TemplateInfo[] = [];
  const builtin: TemplateInfo[] = [];

  // 1. Scan workspace custom templates
  if (workspaceRoot) {
    const customDir = getWorkspaceTemplatesDir(workspaceRoot);
    if (existsSync(customDir)) {
      const entries = readdirSync(customDir, { withFileTypes: true });
      for (const ent of entries) {
        if (ent.isDirectory() && !ent.name.startsWith(".")) {
          const tplPath = join(customDir, ent.name);
          custom.push(readTemplateMeta(tplPath, ent.name, "custom"));
        }
      }
    }
  }

  // 2. Scan built-in templates
  const builtinDir = getBuiltinTemplatesDir();
  if (existsSync(builtinDir)) {
    const entries = readdirSync(builtinDir, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.isDirectory() && !ent.name.startsWith(".")) {
        const tplPath = join(builtinDir, ent.name);
        builtin.push(readTemplateMeta(tplPath, ent.name, "builtin"));
      }
    }
  }

  return { custom, builtin, all: [...custom, ...builtin] };
}

/**
 * Resolve a template given an argument (supporting ':' prefix and duplicate collision resolution)
 */
export async function resolveTemplate(
  templateArg: string,
  workspaceRoot: string | null
): Promise<TemplateInfo> {
  const isExplicitCustom = templateArg.startsWith(":");
  const cleanName = isExplicitCustom ? templateArg.slice(1) : templateArg;

  if (!cleanName) {
    throw new Error("Template name cannot be empty.");
  }

  const { custom, builtin } = listAllTemplates(workspaceRoot);

  // 1. Explicit custom template (prefixed with ':')
  if (isExplicitCustom) {
    const matched = custom.find((t) => t.name === cleanName);
    if (!matched) {
      const customPath = workspaceRoot
        ? getWorkspaceTemplatesDir(workspaceRoot)
        : ".leoms/templates";
      throw new Error(
        `Custom template ":${cleanName}" was not found in ${customPath}.\n` +
          `Run "leoms template list" to view available templates.`
      );
    }
    return matched;
  }

  // 2. Unprefixed search: check custom and builtin
  const matchedCustom = custom.find((t) => t.name === cleanName);
  const matchedBuiltin = builtin.find((t) => t.name === cleanName);

  // Collision detected: both custom and built-in exist with the same name
  if (matchedCustom && matchedBuiltin) {
    console.log(
      pc.yellow(`\n⚠️  Found multiple templates matching "${pc.bold(cleanName)}":`)
    );

    const choice = await promptSelect<"custom" | "builtin">(
      `Which template would you like to use?`,
      [
        {
          label: `[Custom]   .leoms/templates/${cleanName}`,
          value: "custom",
          hint: pc.dim(`(${matchedCustom.description || "Workspace template"})`),
        },
        {
          label: `[Built-in] ${cleanName}`,
          value: "builtin",
          hint: pc.dim(`(${matchedBuiltin.description || "Official template"})`),
        },
      ]
    );

    console.log(
      pc.dim(`(Tip: Use ":${cleanName}" to directly target the custom template next time)\n`)
    );

    return choice === "custom" ? matchedCustom : matchedBuiltin;
  }

  if (matchedCustom) return matchedCustom;
  if (matchedBuiltin) return matchedBuiltin;

  throw new Error(
    `Template "${cleanName}" was not found.\n` +
      `Run "leoms template list" to view all available templates.`
  );
}
