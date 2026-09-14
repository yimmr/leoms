import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export async function execCommand(
  cmd: string,
  args: string[] = [],
  options: { cwd?: string; timeout?: number } = {}
): Promise<ExecResult> {
  try {
    const { stdout, stderr } = await execFileAsync(cmd, args, {
      cwd: options.cwd,
      timeout: options.timeout ?? 10000,
      encoding: "utf8",
    });
    return {
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      exitCode: 0,
    };
  } catch (error: any) {
    return {
      stdout: (error.stdout || "").trim(),
      stderr: (error.stderr || error.message || "").trim(),
      exitCode: typeof error.code === "number" ? error.code : 1,
    };
  }
}

export async function spawnCommand(
  cmd: string,
  args: string[] = [],
  options: { cwd?: string; env?: NodeJS.ProcessEnv; stdio?: "inherit" | "pipe" } = {}
): Promise<{ exitCode: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: options.cwd,
      stdio: options.stdio ?? "inherit",
      env: options.env ? { ...process.env, ...options.env } : process.env,
    });

    child.on("error", (err: any) => {
      reject(err);
    });

    child.on("close", (code) => {
      resolve({ exitCode: code ?? 0 });
    });
  });
}

