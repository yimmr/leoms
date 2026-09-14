import { zh } from "./zh.js";
import { en } from "./en.js";
import type { LocaleSchema, TranslationKey } from "./schema.js";

export * from "./schema.js";
export { zh } from "./zh.js";
export { en } from "./en.js";

const DEFAULT_LOCALE: string = "zh";
let currentLocale: string = DEFAULT_LOCALE;

/**
 * Locale dictionary registry
 */
const dictionaries = new Map<string, any>([
  ["zh", zh],
  ["en", en],
]);

/**
 * Register a new locale dictionary dynamically
 * E.g.: registerLocale("ja", jaDictionary)
 */
export function registerLocale(name: string, dictionary: Partial<LocaleSchema>): void {
  const code = normalizeLocaleCode(name);
  const existing = dictionaries.get(code) || {};
  dictionaries.set(code, deepMerge(existing, dictionary));
}

/**
 * Get all currently registered locale codes
 */
export function getSupportedLocales(): string[] {
  return Array.from(dictionaries.keys());
}

let explicitLocaleSet = false;

/**
 * Set current active locale.
 * Supports standard codes like "zh", "zh-CN", "en", "en-US", "ja", etc.
 * If isExplicit is true (e.g. set via CLI --lang), subsequent implicit config loads will not overwrite it.
 */
export function setLocale(locale?: string, isExplicit = false): void {
  if (!locale) return;
  if (explicitLocaleSet && !isExplicit) return;
  if (isExplicit) {
    explicitLocaleSet = true;
  }

  const normalized = normalizeLocaleCode(locale);
  if (dictionaries.has(normalized)) {
    currentLocale = normalized;
  } else {
    // Fallback: match prefix (e.g. "zh-Hans" -> "zh", "en-GB" -> "en")
    const prefix = normalized.split("-")[0];
    if (dictionaries.has(prefix)) {
      currentLocale = prefix;
    } else {
      currentLocale = DEFAULT_LOCALE;
    }
  }
}

/**
 * Get currently active locale code
 */
export function getLocale(): string {
  return currentLocale;
}

/**
 * Check if the active locale is Chinese
 */
export function isZh(): boolean {
  return currentLocale.startsWith("zh");
}

/**
 * Standard translation function: resolves nested key path and interpolates template params.
 * E.g.: t("commands.check.options.all")
 *       t("runner.summary.failed", { errors: 2, warnings: 1 })
 *
 * Fallback chain: activeLocale -> defaultLocale ("zh") -> "en" -> raw key
 */
export function t(
  key: TranslationKey | string,
  params?: Record<string, string | number | boolean | null | undefined>
): string {
  const currentDict = dictionaries.get(currentLocale) || zh;
  let text = getNestedValue(currentDict, key);

  // Fallback 1: default locale (zh)
  if (text === undefined && currentLocale !== DEFAULT_LOCALE) {
    text = getNestedValue(dictionaries.get(DEFAULT_LOCALE), key);
  }

  // Fallback 2: english
  if (text === undefined && currentLocale !== "en" && DEFAULT_LOCALE !== "en") {
    text = getNestedValue(dictionaries.get("en"), key);
  }

  // If still not found, return the key as fallback
  if (text === undefined) {
    return key;
  }

  if (typeof text !== "string") {
    return String(text);
  }

  // Template interpolation: {name} -> params.name
  if (params) {
    return text.replace(/\{(\w+)\}/g, (match, paramName) => {
      const val = params[paramName];
      return val !== undefined ? String(val) : match;
    });
  }

  return text;
}

/**
 * Transitional helper for backward compatibility during migration
 */
export function msg(zhText: string, enText: string): string {
  return isZh() ? zhText : enText;
}

/**
 * Helper to get nested value from object by dot-separated path
 */
function getNestedValue(obj: any, path: string): string | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  const parts = path.split(".");
  let curr = obj;
  for (const part of parts) {
    if (curr == null || typeof curr !== "object") {
      return undefined;
    }
    curr = curr[part];
  }
  return typeof curr === "string" ? curr : undefined;
}

/**
 * Normalize locale code (e.g. "zh_CN" -> "zh-cn")
 */
function normalizeLocaleCode(code: string): string {
  return code.toLowerCase().trim().replace(/_/g, "-");
}

/**
 * Deep merge helper for locale registration
 */
function deepMerge(target: any, source: any): any {
  const output = { ...target };
  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach((key) => {
      if (isObject(source[key])) {
        if (!(key in target)) {
          Object.assign(output, { [key]: source[key] });
        } else {
          output[key] = deepMerge(target[key], source[key]);
        }
      } else {
        Object.assign(output, { [key]: source[key] });
      }
    });
  }
  return output;
}

function isObject(item: any): boolean {
  return item && typeof item === "object" && !Array.isArray(item);
}
