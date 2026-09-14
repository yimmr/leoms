import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";
import { setLocale } from "./i18n.js";
import type { LeomsConfig } from "./types.js";

const DEFAULT_CONFIG: LeomsConfig = {
  locale: "zh",
  deploy: {
    env: "production",
  },
  release: {
    remotes: ["origin"],
  },
};

export function loadLeomsConfig(rootDir: string): { config: LeomsConfig; configFile?: string } {
  const possiblePaths = [
    resolve(rootDir, "leoms.yml"),
    resolve(rootDir, "leoms.yaml"),
    resolve(rootDir, ".leoms/config.yml"),
    resolve(rootDir, ".leoms/config.yaml"),
  ];

  for (const filePath of possiblePaths) {
    if (existsSync(filePath)) {
      try {
        const content = readFileSync(filePath, "utf8");
        const parsed = parse(content) as Partial<LeomsConfig & { lang?: "zh" | "en" }> | null;
        if (parsed && typeof parsed === "object") {
          const locale = parsed.locale || parsed.lang || "zh";
          setLocale(locale);
          return {
            config: {
              locale,
              deploy: { ...DEFAULT_CONFIG.deploy, ...parsed.deploy },
              release: { ...DEFAULT_CONFIG.release, ...parsed.release },
              categories: parsed.categories && typeof parsed.categories === "object" ? parsed.categories : undefined,
            },
            configFile: filePath,
          };
        }
      } catch (err) {
        console.warn(`[leoms] ⚠ Failed to parse ${filePath}, fallback to defaults.`);
      }
    }
  }

  setLocale(DEFAULT_CONFIG.locale);
  return { config: DEFAULT_CONFIG };
}
