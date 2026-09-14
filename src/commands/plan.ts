import pc from "picocolors";
import Table from "cli-table3";
import { findWorkspaceRoot, getWorkspaceContext, getProjectFromCwd } from "../core/workspace.js";
import { scanWorkspaceProjects } from "../core/scanner.js";
import { calculatePublishPlan } from "../core/topology.js";

export interface PlanCommandOptions {
  project?: string;
}

export async function runPlan(
  targetPattern?: string,
  options: PlanCommandOptions = {}
): Promise<void> {
  const rootDir = findWorkspaceRoot();
  if (!rootDir) {
    console.error(pc.red("✖ Cannot locate workspace root."));
    process.exit(1);
  }

  const ctx = getWorkspaceContext(rootDir);
  const projects = await scanWorkspaceProjects(ctx);

  let effectiveTarget = options.project || targetPattern;
  if (!effectiveTarget) {
    const cwdProj = getProjectFromCwd(projects, rootDir);
    if (cwdProj) {
      effectiveTarget = cwdProj.name;
    }
  }

  console.log(pc.bold("\n📋 Release Execution Plan (Topological DAG Order)\n"));

  const plan = calculatePublishPlan(projects, effectiveTarget);

  if (plan.hasCycle) {
    console.error(
      pc.red(`❌ Circular dependency detected! The following projects form a cycle:`)
    );
    for (const node of plan.cycleNodes || []) {
      console.error(`  • ${pc.bold(node)}`);
    }
    console.error(pc.yellow("\nPlease break the circular dependency before releasing.\n"));
    process.exit(1);
  }

  if (!plan.hasChanges || plan.orderedSteps.length === 0) {
    console.log(pc.green("✔ No unreleased changes detected across workspace."));
    console.log(
      pc.dim(
        "Tip: Pass a project name or pattern (e.g. `leoms plan demo`) to simulate an impact plan.\n"
      )
    );
    return;
  }

  console.log(
    `${pc.dim("Affected Packages:")} ${pc.bold(
      plan.affectedProjects.length.toString()
    )}  |  ${pc.dim("Total Steps:")} ${pc.cyan(plan.orderedSteps.length.toString())}\n`
  );

  const table = new Table({
    head: [
      pc.cyan("Step"),
      pc.cyan("Project"),
      pc.cyan("Ecosystem"),
      pc.cyan("Action"),
      pc.cyan("Wait For / Depends On"),
      pc.cyan("Trigger Reason"),
    ],
    colWidths: [8, 24, 12, 18, 26, 30],
    wordWrap: true,
  });

  for (const step of plan.orderedSteps) {
    const p = step.project;
    let actionFormatted = "";
    if (step.action === "publish") {
      actionFormatted = pc.green("Publish to Registry");
    } else if (step.action === "build-and-tag") {
      actionFormatted = pc.blue("Build & Tag Release");
    } else {
      actionFormatted = pc.dim("Verify Only");
    }

    const waitFor =
      step.dependenciesToWait.length > 0
        ? step.dependenciesToWait.map((d) => pc.yellow(d)).join(", ")
        : pc.dim("(none - root tier)");

    table.push([
      pc.bold(`#${step.step}`),
      `${pc.bold(p.name)}\n${pc.dim("v" + (p.version || "0.0.0"))}`,
      p.packageManager,
      actionFormatted,
      waitFor,
      pc.dim(step.reason),
    ]);
  }

  console.log(table.toString());
  console.log("");
  console.log(pc.bold("──────── Execution Summary ────────"));
  console.log(
    pc.cyan(
      `✔ Topological order verified: Release bottom-tier dependencies first (#1), cascading up to dependents.`
    )
  );
  console.log(
    pc.dim(
      `Run \`leoms check --release\` to verify pre-release readiness for this plan.\n`
    )
  );
}
