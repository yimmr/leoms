import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import pc from "picocolors";
import readline from "node:readline";

/**
 * Detect the appropriate shell configuration file (.bashrc, .zshrc, .profile)
 */
export function detectShellRcFile(): string {
  const home = homedir();
  const shell = process.env.SHELL || "";

  if (shell.includes("zsh")) {
    const zshrc = join(home, ".zshrc");
    if (existsSync(zshrc)) return zshrc;
  }

  const bashrc = join(home, ".bashrc");
  if (existsSync(bashrc)) return bashrc;

  const profile = join(home, ".profile");
  if (existsSync(profile)) return profile;

  return bashrc;
}

/**
 * Check if COMPOSER_HOME is already configured in the rc file
 */
export function getExistingComposerHomeInRc(rcFilePath: string): { isSet: boolean; value?: string } {
  if (!existsSync(rcFilePath)) {
    return { isSet: false };
  }

  try {
    const content = readFileSync(rcFilePath, "utf8");
    const match = content.match(/(?:export\s+)?COMPOSER_HOME=["']?([^"'\r\n]+)["']?/);
    if (match && match[1]) {
      return { isSet: true, value: match[1].trim() };
    }
  } catch {
    // ignore
  }

  return { isSet: false };
}

/**
 * Prompt user in terminal (yes/no)
 */
export async function askConfirmation(question: string, defaultYes = false): Promise<boolean> {
  // If not running in an interactive terminal, fallback to default
  if (!process.stdin.isTTY) {
    return defaultYes;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const promptSuffix = defaultYes ? "[Y/n]" : "[y/N]";
  return new Promise((resolve) => {
    rl.question(`${question} ${promptSuffix}: `, (answer) => {
      rl.close();
      const cleaned = answer.trim().toLowerCase();
      if (!cleaned) {
        resolve(defaultYes);
      } else {
        resolve(cleaned === "y" || cleaned === "yes");
      }
    });
  });
}

/**
 * Persist COMPOSER_HOME to shell rc file
 */
export async function setupGlobalComposerHome(
  composerHomeDir: string,
  options: { force?: boolean; yes?: boolean; silent?: boolean } = {}
): Promise<{ success: boolean; rcFile: string; message: string }> {
  const rcFile = detectShellRcFile();
  const existing = getExistingComposerHomeInRc(rcFile);

  const targetLine = `export COMPOSER_HOME="${composerHomeDir}"`;

  if (existing.isSet) {
    // If it's already pointing to the same place, nothing to do
    if (existing.value === composerHomeDir) {
      return {
        success: true,
        rcFile,
        message: `COMPOSER_HOME is already configured for this path in ${rcFile}`,
      };
    }

    // Different path already exists
    if (!options.force && !options.yes) {
      console.log(
        pc.yellow(
          `\n⚠ COMPOSER_HOME is already set in ${pc.bold(rcFile)}:\n  Current: ${pc.dim(
            existing.value || ""
          )}\n  Target:  ${pc.cyan(composerHomeDir)}`
        )
      );

      const confirmed = await askConfirmation(
        `Do you want to overwrite COMPOSER_HOME in ${rcFile}?`,
        false
      );

      if (!confirmed) {
        return {
          success: false,
          rcFile,
          message: `Kept existing COMPOSER_HOME in ${rcFile}`,
        };
      }
    }

    // Overwrite the existing line in rcFile
    try {
      let content = readFileSync(rcFile, "utf8");
      content = content.replace(
        /(?:#\s*Added by leoms\s*\n)?(?:export\s+)?COMPOSER_HOME=.*(?:\r?\n)?/,
        `# Added by leoms\n${targetLine}\n`
      );
      writeFileSync(rcFile, content, "utf8");
      return {
        success: true,
        rcFile,
        message: `Updated COMPOSER_HOME in ${rcFile}`,
      };
    } catch (err: any) {
      return {
        success: false,
        rcFile,
        message: `Failed to write to ${rcFile}: ${err.message}`,
      };
    }
  }

  // Not set yet: append to rcFile
  try {
    const banner = `\n# Added by leoms workspace manager\n${targetLine}\n`;
    const content = existsSync(rcFile) ? readFileSync(rcFile, "utf8") : "";
    writeFileSync(rcFile, content + banner, "utf8");
    return {
      success: true,
      rcFile,
      message: `Persisted COMPOSER_HOME to ${rcFile}`,
    };
  } catch (err: any) {
    return {
      success: false,
      rcFile,
      message: `Failed to append to ${rcFile}: ${err.message}`,
    };
  }
}
