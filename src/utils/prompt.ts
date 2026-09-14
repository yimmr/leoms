import readline from "node:readline";
import pc from "picocolors";
import type { ProjectCategory, ProjectModel } from "../core/types.js";

export interface SelectOption<T = string> {
  label: string;
  value: T;
  hint?: string;
}

/**
 * Interactive single-choice select prompt in terminal using Node readline
 */
export async function promptSelect<T = string>(
  message: string,
  options: SelectOption<T>[]
): Promise<T> {
  if (options.length === 0) {
    throw new Error("Cannot prompt with empty options list.");
  }
  if (options.length === 1) {
    return options[0].value;
  }

  if (!process.stdin.isTTY) {
    throw new Error(
      `Non-interactive terminal detected. Please explicitly specify target with '-p <project>' or filter with '--npm'/'--php'.`
    );
  }

  return new Promise((resolve) => {
    let selectedIndex = 0;
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    readline.emitKeypressEvents(process.stdin, rl);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }

    // Hide cursor
    process.stdout.write("\x1b[?25l");

    function render(firstTime = false) {
      if (!firstTime) {
        // Move cursor up: 1 line for header + options.length lines
        process.stdout.write(`\x1b[${options.length + 1}A\r`);
      }

      console.log(pc.cyan("?") + " " + pc.bold(message));
      options.forEach((opt, idx) => {
        const isSelected = idx === selectedIndex;
        const prefix = isSelected ? pc.cyan("❯ ") : "  ";
        const label = isSelected ? pc.bold(pc.cyan(opt.label)) : opt.label;
        const hint = opt.hint ? pc.dim(` ${opt.hint}`) : "";
        console.log(`\x1b[2K${prefix}${label}${hint}`);
      });
    }

    render(true);

    function onKeypress(str: string, key: readline.Key) {
      if (!key) return;

      if (key.name === "up" || key.name === "k") {
        selectedIndex = (selectedIndex - 1 + options.length) % options.length;
        render();
      } else if (key.name === "down" || key.name === "j") {
        selectedIndex = (selectedIndex + 1) % options.length;
        render();
      } else if (key.name === "return") {
        cleanup();
        // Clear options and render final selection line
        process.stdout.write(`\x1b[${options.length + 1}A\r`);
        for (let i = 0; i <= options.length; i++) {
          process.stdout.write("\x1b[2K\n");
        }
        process.stdout.write(`\x1b[${options.length + 1}A\r`);
        console.log(
          pc.green("✔") +
            " " +
            pc.bold(message) +
            " " +
            pc.cyan(options[selectedIndex].label)
        );
        resolve(options[selectedIndex].value);
      } else if (key.name === "c" && key.ctrl) {
        cleanup();
        console.log(pc.dim("\nAborted."));
        process.exit(0);
      } else {
        // Quick number shortcut (1-9)
        const num = parseInt(str, 10);
        if (!isNaN(num) && num >= 1 && num <= options.length) {
          selectedIndex = num - 1;
          render();
        }
      }
    }

    function cleanup() {
      process.stdin.removeListener("keypress", onKeypress);
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      process.stdout.write("\x1b[?25h"); // Restore cursor
      rl.close();
    }

    process.stdin.on("keypress", onKeypress);
  });
}

/**
 * Interactively select a target project:
 * - If total projects <= 6: Flat list with tags.
 * - If total projects > 6: Category/folder drill-down navigation.
 */
export async function promptProjectSelection(
  projects: ProjectModel[],
  message = "Please select target project:"
): Promise<ProjectModel> {
  if (projects.length === 0) {
    throw new Error("No projects available in workspace.");
  }
  if (projects.length === 1) {
    return projects[0];
  }

  // Under threshold: Flat list
  if (projects.length <= 6) {
    const options: SelectOption<ProjectModel>[] = projects.map((p) => {
      let ecoBadge = "";
      if (p.packageManager === "hybrid") ecoBadge = pc.magenta("[hybrid: node+php]");
      else if (p.packageManager === "npm") ecoBadge = pc.green("[node]");
      else if (p.packageManager === "composer") ecoBadge = pc.blue("[php]");

      return {
        label: `${p.relativeDir} (${p.name})`,
        value: p,
        hint: ecoBadge,
      };
    });

    return await promptSelect(message, options);
  }

  // Over threshold: Folder/Category drill-down
  // 1. Group by category
  const standardCategories: ProjectCategory[] = ["apps", "packages", "libs"];
  const discoveredCategories = Array.from(new Set(projects.map((p) => p.category)));
  const customCategories = discoveredCategories.filter(
    (c) => !standardCategories.includes(c) && c !== "other"
  );
  const categories: ProjectCategory[] = [...standardCategories, ...customCategories, "other"];
  const grouped = new Map<ProjectCategory, ProjectModel[]>();
  for (const cat of categories) {
    const list = projects.filter((p) => p.category === cat);
    if (list.length > 0) {
      grouped.set(cat, list);
    }
  }

  const catOptions: SelectOption<ProjectCategory>[] = [];
  for (const [cat, list] of grouped.entries()) {
    catOptions.push({
      label: `📂 ${cat}/`,
      value: cat,
      hint: pc.dim(`(${list.length} ${list.length === 1 ? "project" : "projects"})`),
    });
  }

  const selectedCat = await promptSelect("Select category / directory folder:", catOptions);
  const catProjects = grouped.get(selectedCat) || [];

  if (catProjects.length === 1) {
    return catProjects[0];
  }

  const projOptions: SelectOption<ProjectModel>[] = catProjects.map((p) => {
    let ecoBadge = "";
    if (p.packageManager === "hybrid") ecoBadge = pc.magenta("[hybrid: node+php]");
    else if (p.packageManager === "npm") ecoBadge = pc.green("[node]");
    else if (p.packageManager === "composer") ecoBadge = pc.blue("[php]");

    return {
      label: `${p.relativeDir} (${p.name})`,
      value: p,
      hint: ecoBadge,
    };
  });

  return await promptSelect(`Select project in ${selectedCat}/:`, projOptions);
}

/**
 * Prompt for ecosystem (npm vs composer) when dealing with hybrid projects
 */
export async function promptEcosystemChoice(
  projectName: string,
  actionDesc = "package manager"
): Promise<"npm" | "composer"> {
  return await promptSelect(
    `Project "${projectName}" is a hybrid project. Select ${actionDesc}:`,
    [
      {
        label: "📦 NPM",
        value: "npm",
        hint: "package.json (pnpm)",
      },
      {
        label: "🐘 Composer",
        value: "composer",
        hint: "composer.json (PHP Composer)",
      },
    ]
  );
}

/**
 * Prompt user to select how to bump the version
 */
export async function promptVersionSelection(
  projectName: string,
  currentVersion: string = "0.0.0"
): Promise<string> {
  const { bumpVersion } = await import("./semver.js");
  const patchVer = bumpVersion(currentVersion, "patch");
  const minorVer = bumpVersion(currentVersion, "minor");
  const majorVer = bumpVersion(currentVersion, "major");

  return await promptSelect(
    `Select new version for ${pc.cyan(projectName)} (current: v${currentVersion}):`,
    [
      {
        label: `patch  v${patchVer}`,
        value: patchVer,
        hint: pc.green("[recommended: bug fixes & small updates]"),
      },
      {
        label: `minor  v${minorVer}`,
        value: minorVer,
        hint: pc.yellow("[new backwards-compatible features]"),
      },
      {
        label: `major  v${majorVer}`,
        value: majorVer,
        hint: pc.red("[breaking changes]"),
      },
      {
        label: `keep current  v${currentVersion}`,
        value: currentVersion,
        hint: pc.dim("[tag/re-release without bumping]"),
      },
    ]
  );
}

/**
 * Simple Yes/No confirmation prompt
 */
export async function promptConfirm(message: string, defaultYes = true): Promise<boolean> {
  return await promptSelect(message, [
    {
      label: defaultYes ? "Yes" : "Yes",
      value: true,
      hint: defaultYes ? pc.green("[default]") : undefined,
    },
    {
      label: !defaultYes ? "No" : "No",
      value: false,
      hint: !defaultYes ? pc.yellow("[default]") : undefined,
    },
  ]);
}
