import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import pc from "picocolors";
import {
  findWorkspaceRoot,
  getWorkspaceContext,
  getProjectFromCwd,
  resolveTargetProjects,
} from "../core/workspace.js";
import { scanWorkspaceProjects } from "../core/scanner.js";
import { promptProjectSelection } from "../utils/prompt.js";
import { executeChecks } from "../core/checks/index.js";
import { runBuild } from "./build.js";
import { spawnCommand } from "../utils/exec.js";
import { msg } from "../core/i18n.js";
import type { ProjectModel } from "../core/types.js";

export interface DeployCommandOptions {
  project?: string;
  env?: string;
  skipCheck?: boolean;
  skipBuild?: boolean;
  dryRun?: boolean;
  script?: string;
  opt?: Record<string, string>;
}

export async function runDeploy(
  targetPattern?: string,
  options: DeployCommandOptions = {}
): Promise<void> {
  const rootDir = findWorkspaceRoot();
  if (!rootDir) {
    console.error(pc.red("✖ Cannot locate workspace root."));
    process.exit(1);
  }

  const env = options.env || "production";
  const isDryRun = Boolean(options.dryRun);

  console.log(
    pc.bold(
      msg(
        `\n🚀 应用一键部署编排器 (deploy) ${isDryRun ? pc.yellow("[模拟预览 DRY-RUN]") : ""}\n`,
        `\n🚀 Application Deployment Orchestrator (deploy) ${isDryRun ? pc.yellow("[DRY-RUN SIMULATION]") : ""}\n`
      )
    )
  );

  const ctx = getWorkspaceContext(rootDir);
  const projects = await scanWorkspaceProjects(ctx);

  // 1. Resolve Target Project
  let targetProj: ProjectModel;

  const effectiveTarget = options.project || targetPattern;

  if (effectiveTarget) {
    const { targets } = resolveTargetProjects(projects, rootDir, effectiveTarget);
    if (targets.length === 0) {
      console.error(pc.red(msg(`✖ 未找到匹配 "${effectiveTarget}" 的项目。`, `✖ No project found matching "${effectiveTarget}".`)));
      process.exit(1);
    }
    targetProj = targets[0];
  } else {
    const cwdProj = getProjectFromCwd(projects, rootDir);
    if (cwdProj) {
      targetProj = cwdProj;
    } else {
      targetProj = await promptProjectSelection(projects, msg("请选择要部署的项目:", "Select project to deploy:"));
    }
  }

  // Config parameter resolution: CLI options override leoms.yml config with the same name
  const configDeploy = ctx.config.deploy || {};
  const activeScript = options.script || configDeploy.script;
  const activeEnv = options.env || configDeploy.env;

  // Resolve custom options (leoms.yml deploy.options overridden by CLI --opt)
  const combinedOptions: Record<string, any> = {
    ...(configDeploy.options || {}),
    ...(options.opt || {}),
  };

  const optionsEntries = Object.entries(combinedOptions);
  const optionsCount = optionsEntries.length;

  const envDisplay = activeEnv ? ` (${msg("目标环境", "Target Env")}: ${pc.green(activeEnv)})` : "";
  console.log(
    `${pc.cyan(msg("● 目标项目:", "● Target Project:"))} ${pc.bold(targetProj.name)} ${pc.dim(
      `(${targetProj.relativeDir})`
    )} [${pc.magenta(targetProj.packageManager)}]${envDisplay}`
  );
  if (optionsCount > 0) {
    const optsStr = optionsEntries
      .map(([k, v]) => `${pc.cyan(k)}=${pc.yellow(typeof v === "object" ? JSON.stringify(v) : String(v))}`)
      .join(", ");
    console.log(pc.dim(`  • ${msg("自定义选项 (options):", "Custom Options:")} ${optsStr}`));
  }
  console.log();

  // 2. Step 1: Pre-flight Full Health & Standalone Gatekeeper
  if (!options.skipCheck) {
    console.log(pc.cyan(msg("1. 正在执行部署前全量健康与离仓自洽门禁体检...", "1. Running pre-deployment full health & standalone gatekeeper...")));
    const checkResult = await executeChecks({
      targets: [targetProj],
      all: true,
    });
    if (!checkResult.passed) {
      console.error(
        pc.red(
          msg(
            `\n✖ 部署已阻断：目标项目未通过全量门禁检查。请先解决问题后再执行部署。\n  可添加 '--skip-check' 强制跳过检查（生产环境不建议跳过）。\n`,
            `\n✖ Deployment blocked: Target project failed full gatekeeper checks. Please resolve issues before deploying.\n  Use '--skip-check' if you wish to bypass (not recommended for production).\n`
          )
        )
      );
      process.exit(1);
    }
    console.log(pc.green(msg("✔ 部署前门禁体检全绿通过！\n", "✔ Pre-flight gatekeeper checks passed!\n")));
  } else {
    console.log(pc.yellow(msg("⚠ 正在跳过部署前门禁检查 (--skip-check)。\n", "⚠ Bypassing pre-deployment gatekeeper checks (--skip-check).\n")));
  }

  // 3. Step 2: Build Application Artifacts
  if (!options.skipBuild) {
    console.log(pc.cyan(msg("2. 正在构建应用与依赖产物...", "2. Building application artifacts...")));
    await runBuild([targetProj.name], {});
    console.log(pc.green(msg("✔ 构建产物就绪！\n", "✔ Build artifacts ready!\n")));
  } else {
    console.log(pc.yellow(msg("⚠ 正在跳过产物构建步骤 (--skip-build)。\n", "⚠ Bypassing build step (--skip-build).\n")));
  }

  // 4. Step 3: Discover Script Entry Point
  // Order of resolution:
  // 1) Explicit entry: CLI '--script' or leoms.yml 'deploy.script'
  // 2) Project-level auto-discovery: '<project>/scripts/deploy.sh' or '<project>/deploy.sh'
  // 3) Workspace-level auto-discovery in root tools/: 'tools/deploy.sh'
  let deployScriptPath: string | null = null;

  if (activeScript) {
    const resolved = resolve(rootDir, activeScript);
    if (existsSync(resolved)) {
      deployScriptPath = resolved;
    } else {
      console.error(pc.red(`✖ Specified deploy script not found: ${activeScript}`));
      process.exit(1);
    }
  } else {
    // Project-level auto-discovery
    const projectCandidates = [
      join(targetProj.path, "scripts", "deploy.sh"),
      join(targetProj.path, "deploy.sh"),
    ];
    for (const c of projectCandidates) {
      if (existsSync(c)) {
        deployScriptPath = c;
        break;
      }
    }

    // Workspace-level auto-discovery (in root tools/)
    if (!deployScriptPath) {
      const toolsCandidate = join(rootDir, "tools", "deploy.sh");
      if (existsSync(toolsCandidate)) {
        deployScriptPath = toolsCandidate;
      }
    }
  }

  // 5. Step 4: Execute Deployment Script with Essential Arguments
  console.log(pc.cyan(msg("3. 正在调度部署脚本流水线...", "3. Executing deployment pipeline...")));

  if (!deployScriptPath) {
    console.log(
      pc.yellow(msg(`ℹ 未找到项目 ${pc.bold(targetProj.name)} 的部署脚本。`, `ℹ No deploy script found for ${pc.bold(targetProj.name)}.`))
    );
    console.log(pc.dim(msg("  已探测路径:", "  Looked for:")));
    console.log(pc.dim(`  • ${msg("项目级专属:", "Project script:  ")} ${join(targetProj.relativeDir, "scripts", "deploy.sh")}`));
    console.log(pc.dim(`  • ${msg("工作区全局:", "Workspace script:")} tools/deploy.sh`));
    console.log(pc.dim(`  • ${msg("配置文件指定:", "Config entry:    ")} leoms.yml (deploy.script)\n`));
    console.log(
      pc.dim(
        msg(
          `创建脚本 tools/deploy.sh 或 ${join(targetProj.relativeDir, "scripts", "deploy.sh")} 并赋予执行权限即可启用一键部署。\n`,
          `Create a script at tools/deploy.sh or ${join(targetProj.relativeDir, "scripts", "deploy.sh")} to enable one-click deploy.\n`
        )
      )
    );
    return;
  }

  // Essential arguments only:
  // $1 = project path (crucial for knowing what to deploy)
  // $2 = target environment (only passed if env is defined)
  const scriptArgs: string[] = [targetProj.path];
  if (activeEnv) {
    scriptArgs.push(activeEnv);
  }

  // Build temporary environment variables for the deployment script:
  // 1. Context variables
  const injectedEnv: Record<string, string> = {
    LEOMS_PROJECT_NAME: targetProj.name,
    LEOMS_PROJECT_PATH: targetProj.path,
    LEOMS_PROJECT_REL: targetProj.relativeDir,
    LEOMS_WORKSPACE_ROOT: rootDir,
  };
  if (activeEnv) {
    injectedEnv.LEOMS_DEPLOY_ENV = activeEnv;
  }

  // 2. Custom options mapped to LEOMS_OPT_*
  const customEnvKeys: string[] = [];
  for (const [k, v] of optionsEntries) {
    const normalizedKey = k
      .replace(/([a-z])([A-Z])/g, "$1_$2")
      .replace(/[-\.]/g, "_")
      .toUpperCase();
    const envVarName = `LEOMS_OPT_${normalizedKey}`;
    const stringVal = typeof v === "object" && v !== null ? JSON.stringify(v) : String(v);
    injectedEnv[envVarName] = stringVal;
    customEnvKeys.push(`${envVarName}="${stringVal}"`);
  }

  // 3. Full JSON payload for structured consumers
  if (optionsCount > 0) {
    injectedEnv.LEOMS_DEPLOY_OPTIONS = JSON.stringify(combinedOptions);
  }

  if (isDryRun) {
    console.log(pc.yellow(msg("💡 模拟预览 (DRY-RUN)：实际部署脚本不会被执行。", "💡 DRY-RUN simulation: Script will not be executed.")));
    console.log(pc.dim(`  ${msg("拟执行命令:", "Would execute:")} ${deployScriptPath} ${scriptArgs.join(" ")}`));
    if (customEnvKeys.length > 0) {
      console.log(pc.dim(`  ${msg("拟注入临时环境变量:", "Injected Env Vars:")}`));
      for (const envItem of customEnvKeys) {
        console.log(pc.dim(`    • ${envItem}`));
      }
      console.log(pc.dim(`    • LEOMS_DEPLOY_OPTIONS='${injectedEnv.LEOMS_DEPLOY_OPTIONS}'`));
    }
    console.log(pc.green(msg("\n🎉 部署全流程模拟演练通过！\n", "\n🎉 Deployment simulation completed successfully!\n")));
    return;
  }

  console.log(pc.cyan(`➜ Invoking deploy script: ${pc.bold(deployScriptPath)}`));
  console.log(pc.dim(`  Args: [${scriptArgs.join(", ")}]`));
  if (customEnvKeys.length > 0) {
    console.log(pc.dim(`  Env:  [${customEnvKeys.join(", ")}]\n`));
  } else {
    console.log();
  }

  try {
    const { exitCode } = await spawnCommand("bash", [deployScriptPath, ...scriptArgs], {
      cwd: targetProj.path,
      env: injectedEnv,
      stdio: "inherit",
    });

    if (exitCode !== 0) {
      console.error(pc.red(`\n✖ Deploy script failed with exit code ${exitCode}.`));
      process.exit(exitCode);
    }

    console.log(
      pc.green(
        `\n🎉 Successfully deployed ${pc.bold(targetProj.name)}${
          activeEnv ? ` to ${pc.bold(activeEnv)}` : ""
        }!\n`
      )
    );
  } catch (err: any) {
    console.error(pc.red(`\n✖ Error executing deploy script: ${err.message}`));
    process.exit(1);
  }
}
