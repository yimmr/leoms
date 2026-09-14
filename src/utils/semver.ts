/**
 * Simple, zero-dependency semver utility for workspace dependency verification & bumping
 */
export function cleanVersion(v: string): string {
  return v.trim().replace(/^v/, "");
}

export function parseSemver(v: string): [number, number, number] | null {
  const cleaned = cleanVersion(v);
  const match = cleaned.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return [parseInt(match[1], 10), parseInt(match[2], 10), parseInt(match[3], 10)];
}

export function bumpVersion(
  currentVer: string = "0.0.0",
  type: "patch" | "minor" | "major" = "patch"
): string {
  const parsed = parseSemver(currentVer) || [0, 0, 0];
  let [major, minor, patch] = parsed;

  if (type === "major") {
    major += 1;
    minor = 0;
    patch = 0;
  } else if (type === "minor") {
    minor += 1;
    patch = 0;
  } else {
    patch += 1;
  }

  return `${major}.${minor}.${patch}`;
}

export function isVersionSatisfied(requiredReq: string, actualVer?: string): boolean {
  if (!actualVer) return true;
  const req = requiredReq.trim();
  if (req === "*" || req === "workspace:*" || req === "workspace:^" || req === "workspace:~") {
    return true;
  }

  const actual = parseSemver(actualVer);
  if (!actual) return true; // If actual is non-standard, skip strict check

  // ^1.2.3 or ^0.1.2
  if (req.startsWith("^") || req.startsWith("workspace:^")) {
    const rawReq = req.replace(/^workspace:\^?/, "").replace(/^\^/, "");
    const target = parseSemver(rawReq);
    if (!target) return true;

    if (target[0] > 0) {
      // Major must match, actual must be >= target
      if (actual[0] !== target[0]) return false;
      if (actual[1] < target[1]) return false;
      if (actual[1] === target[1] && actual[2] < target[2]) return false;
      return true;
    } else {
      // 0.x.y: minor must match
      if (actual[0] !== 0 || actual[1] !== target[1]) return false;
      return actual[2] >= target[2];
    }
  }

  // ~1.2.3
  if (req.startsWith("~") || req.startsWith("workspace:~")) {
    const rawReq = req.replace(/^workspace:~?/, "").replace(/^~/, "");
    const target = parseSemver(rawReq);
    if (!target) return true;

    if (actual[0] !== target[0] || actual[1] !== target[1]) return false;
    return actual[2] >= target[2];
  }

  // Exact version
  const exactTarget = parseSemver(req.replace(/^workspace:/, ""));
  if (exactTarget) {
    return (
      actual[0] === exactTarget[0] &&
      actual[1] === exactTarget[1] &&
      actual[2] === exactTarget[2]
    );
  }

  return true;
}
