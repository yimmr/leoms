import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { execCommand } from "../utils/exec.js";
import type { GitInfo } from "./types.js";

export async function getProjectGitInfo(dir: string): Promise<GitInfo> {
  const defaultGit: GitInfo = {
    isGitRepo: false,
    isStandalone: false,
    isDirty: false,
    dirtyCount: 0,
    commitsAhead: 0,
    hasUnpublished: false,
  };

  // Quick check: does this dir or its immediate parent have git?
  // Let's run git rev-parse --show-toplevel
  const topLevelCheck = await execCommand("git", ["-C", dir, "rev-parse", "--show-toplevel"]);
  if (topLevelCheck.exitCode !== 0 || !topLevelCheck.stdout) {
    return defaultGit;
  }

  const gitRoot = resolve(topLevelCheck.stdout);
  const isStandalone = resolve(dir) === gitRoot;

  // 1. Get branch
  let branch: string | undefined;
  const branchCheck = await execCommand("git", ["-C", dir, "rev-parse", "--abbrev-ref", "HEAD"]);
  if (branchCheck.exitCode === 0 && branchCheck.stdout) {
    branch = branchCheck.stdout === "HEAD" ? "detached" : branchCheck.stdout;
  }

  // 2. Check dirty files
  // If it's a standalone repo, we check the whole repo;
  // If it's a subproject in a monorepo, we check only this subdirectory!
  const statusArgs = isStandalone
    ? ["-C", dir, "status", "--porcelain"]
    : ["-C", dir, "status", "--porcelain", "."];

  let isDirty = false;
  let dirtyCount = 0;
  const statusCheck = await execCommand("git", statusArgs);
  if (statusCheck.exitCode === 0 && statusCheck.stdout) {
    const lines = statusCheck.stdout.split("\n").filter((l) => l.trim().length > 0);
    dirtyCount = lines.length;
    isDirty = dirtyCount > 0;
  }

  // 3. Find latest tag
  let latestTag: string | undefined;
  const tagCheck = await execCommand("git", ["-C", dir, "describe", "--tags", "--abbrev=0"]);
  if (tagCheck.exitCode === 0 && tagCheck.stdout) {
    latestTag = tagCheck.stdout;
  }

  // 4. Count commits ahead
  let commitsAhead = 0;
  if (latestTag) {
    const aheadCheck = await execCommand("git", ["-C", dir, "rev-list", `${latestTag}..HEAD`, "--count"]);
    if (aheadCheck.exitCode === 0) {
      commitsAhead = parseInt(aheadCheck.stdout || "0", 10);
    }
  } else {
    // If no tags, check how many commits exist total in this repo/path
    const countCheck = isStandalone
      ? await execCommand("git", ["-C", dir, "rev-list", "--count", "HEAD"])
      : await execCommand("git", ["-C", dir, "rev-list", "--count", "HEAD", "--", "."]);
    if (countCheck.exitCode === 0) {
      commitsAhead = parseInt(countCheck.stdout || "0", 10);
    }
  }

  const hasUnpublished = isDirty || commitsAhead > 0;

  return {
    isGitRepo: true,
    isStandalone,
    gitRoot,
    branch,
    isDirty,
    dirtyCount,
    latestTag,
    commitsAhead,
    hasUnpublished,
  };
}
