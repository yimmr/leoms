import { Command } from "commander";
import { runDoctor } from "./commands/doctor.js";
import { runList, type ListCommandOptions } from "./commands/list.js";
import { runStatus, type StatusCommandOptions } from "./commands/status.js";
import { runCheck, type CheckCommandOptions } from "./commands/check.js";
import { runRelease, type ReleaseCommandOptions } from "./commands/release.js";
import { runPublish, type PublishCommandOptions } from "./commands/publish.js";
import { runDeploy, type DeployCommandOptions } from "./commands/deploy.js";
import { runInit, type InitCommandOptions } from "./commands/init.js";
import { runComposerWrapper } from "./commands/composer.js";
import { runAffected, type AffectedCommandOptions } from "./commands/affected.js";
import { runInstall, type InstallCommandOptions } from "./commands/install.js";
import { runAdd, type AddCommandOptions } from "./commands/add.js";
import { runRemove, type RemoveCommandOptions } from "./commands/remove.js";
import { runBuild, type BuildCommandOptions } from "./commands/build.js";
import { runPlan, type PlanCommandOptions } from "./commands/plan.js";
import { runUi, type UiCommandOptions } from "./commands/ui.js";
import { setLocale, t } from "./core/i18n.js";
import { loadLeomsConfig } from "./core/config.js";

// 1. Initialize locale from config (leoms.yml) if available
loadLeomsConfig(process.cwd());

// 2. Extract global --lang / --locale flag if present on CLI
const langIdx = process.argv.findIndex((arg) => arg === "--lang" || arg.startsWith("--lang="));
if (langIdx !== -1) {
  const val = process.argv[langIdx].includes("=")
    ? process.argv[langIdx].split("=")[1]
    : process.argv[langIdx + 1];
  setLocale(val, true);
  if (process.argv[langIdx].includes("=")) {
    process.argv.splice(langIdx, 1);
  } else {
    process.argv.splice(langIdx, 2);
  }
}

// Transparently bypass commander parsing for composer to forward all flags (--version, -vvv, etc.)
if (process.argv[2] === "composer" || process.argv[2] === "c") {
  await runComposerWrapper(process.argv.slice(3));
} else {
  const helpConfig = {
    styleTitle(str: string) {
      switch (str) {
        case "Usage:":
          return t("cli.titles.usage");
        case "Arguments:":
          return t("cli.titles.arguments");
        case "Options:":
          return t("cli.titles.options");
        case "Global Options:":
          return t("cli.titles.globalOptions");
        case "Commands:":
          return t("cli.titles.commands");
        default:
          return str;
      }
    },
  };

  const program = new Command();

  program.createCommand = (name?: string) => {
    const cmd = new Command(name);
    cmd.configureHelp(helpConfig);
    cmd.helpOption("-h, --help", t("cli.help"));
    return cmd;
  };

  program
    .name(t("cli.name"))
    .description(t("cli.description"))
    .version("0.1.0", "-v, --version", t("cli.version"))
    .configureHelp(helpConfig)
    .helpOption("-h, --help", t("cli.help"))
    .helpCommand("help [command]", t("cli.helpCommand"))
    .option("--lang <zh|en>", t("cli.lang"), "zh");

  // ==================== 1. Workspace & Toolchain Diagnostics ====================

  program
    .command("init [directory]")
    .description(t("commands.init.description"))
    .option("-y, --yes", t("commands.init.options.yes"))
    .option("--config", t("commands.init.options.config"))
    .option("--set-composer-home", t("commands.init.options.setComposerHome"))
    .option("-f, --force", t("commands.init.options.force"))
    .action(async (directory?: string, options?: InitCommandOptions) => {
      try {
        await runInit(directory || ".", options || {});
      } catch (err: any) {
        console.error("Init error:", err);
        process.exit(1);
      }
    });

  program
    .command("doctor")
    .description(t("commands.doctor.description"))
    .action(async () => {
      try {
        await runDoctor();
      } catch (err: any) {
        console.error("Doctor error:", err);
        process.exit(1);
      }
    });

  // ==================== 2. Asset Insights & Status ====================

  program
    .command("status [target]")
    .description(t("commands.status.description"))
    .option("-p, --project <name>", t("commands.status.options.project"))
    .option("--php", t("commands.status.options.php"))
    .option("--npm", t("commands.status.options.npm"))
    .action(async (target?: string, options?: StatusCommandOptions) => {
      try {
        await runStatus(target, options || {});
      } catch (err: any) {
        console.error("Status error:", err);
        process.exit(1);
      }
    });

  program
    .command("list")
    .alias("ls")
    .description(t("commands.list.description"))
    .option("--php", t("commands.list.options.php"))
    .option("--npm", t("commands.list.options.npm"))
    .action(async (options?: ListCommandOptions) => {
      try {
        await runList(options || {});
      } catch (err: any) {
        console.error("List error:", err);
        process.exit(1);
      }
    });

  program
    .command("affected")
    .description(t("commands.affected.description"))
    .option("-b, --base <ref>", t("commands.affected.options.base"))
    .option("-p, --plain", t("commands.affected.options.plain"))
    .option("-t, --type <all|direct|downstream>", t("commands.affected.options.type"), "all")
    .option("--php", t("commands.affected.options.php"))
    .option("--npm", t("commands.affected.options.npm"))
    .action(async (options: AffectedCommandOptions) => {
      try {
        await runAffected(options);
      } catch (err: any) {
        console.error("Affected error:", err);
        process.exit(1);
      }
    });

  // ==================== 3. Dependency Management ====================

  program
    .command("install [target]")
    .alias("i")
    .description(t("commands.install.description"))
    .option("-p, --project <name>", t("commands.install.options.project"))
    .option("--php", t("commands.install.options.php"))
    .option("--npm", t("commands.install.options.npm"))
    .action(async (target?: string, options?: InstallCommandOptions) => {
      try {
        await runInstall(target, options || {});
      } catch (err: any) {
        console.error("Install error:", err);
        process.exit(1);
      }
    });

  program
    .command("add <packages...>")
    .description(t("commands.add.description"))
    .option("-p, --project <name>", t("commands.add.options.project"))
    .option("-D, --dev", t("commands.add.options.dev"))
    .option("--php", t("commands.add.options.php"))
    .option("--npm", t("commands.add.options.npm"))
    .action(async (packages: string[], options?: AddCommandOptions) => {
      try {
        await runAdd(packages, options || {});
      } catch (err: any) {
        console.error("Add error:", err);
        process.exit(1);
      }
    });

  program
    .command("remove <packages...>")
    .alias("rm")
    .description(t("commands.remove.description"))
    .option("-p, --project <name>", t("commands.remove.options.project"))
    .option("--php", t("commands.remove.options.php"))
    .option("--npm", t("commands.remove.options.npm"))
    .action(async (packages: string[], options?: RemoveCommandOptions) => {
      try {
        await runRemove(packages, options || {});
      } catch (err: any) {
        console.error("Remove error:", err);
        process.exit(1);
      }
    });

  program
    .command("composer [args...]")
    .alias("c")
    .description(t("commands.composer.description"));

  // ==================== 4. Build & Gatekeeper Check ====================

  program
    .command("build [targets...]")
    .description(t("commands.build.description"))
    .option("-p, --project <name>", t("commands.build.options.project"))
    .option("--all", t("commands.build.options.all"))
    .option("--affected", t("commands.build.options.affected"))
    .option("-b, --base <ref>", t("commands.build.options.base"))
    .option("--no-deps", t("commands.build.options.noDeps"))
    .option("--php", t("commands.build.options.php"))
    .option("--npm", t("commands.build.options.npm"))
    .action(async (targets: string[], options?: BuildCommandOptions) => {
      try {
        await runBuild(targets, options || {});
      } catch (err: any) {
        console.error("Build error:", err);
        process.exit(1);
      }
    });

  program
    .command("check [target]")
    .description(t("commands.check.description"))
    .option("-p, --project <name>", t("commands.check.options.project"))
    .option("-a, --all", t("commands.check.options.all"))
    .option("-i, --only <rules...>", t("commands.check.options.only"))
    .option("--skip <rules...>", t("commands.check.options.skip"))
    .option("--list-rules", t("commands.check.options.listRules"))
    .option("--plan", t("commands.check.options.plan"))
    .option("--php", t("commands.check.options.php"))
    .option("--npm", t("commands.check.options.npm"))
    .action(async (target?: string, options?: CheckCommandOptions) => {
      try {
        await runCheck(target, options || {});
      } catch (err: any) {
        console.error("Check error:", err);
        process.exit(1);
      }
    });

  program
    .command("plan [target]")
    .description(t("commands.plan.description"))
    .option("-p, --project <name>", t("commands.plan.options.project"))
    .action(async (target?: string, options?: PlanCommandOptions) => {
      try {
        await runPlan(target, options || {});
      } catch (err: any) {
        console.error("Plan error:", err);
        process.exit(1);
      }
    });

  // ==================== 5. Release & Deployment ====================

  program
    .command("release [target]")
    .alias("rel")
    .description(t("commands.release.description"))
    .option("-p, --project <name>", t("commands.release.options.project"))
    .option("--patch", t("commands.release.options.patch"))
    .option("--minor", t("commands.release.options.minor"))
    .option("--major", t("commands.release.options.major"))
    .option("--to <version>", t("commands.release.options.to"))
    .option("--publish", t("commands.release.options.publish"))
    .option("--no-push", t("commands.release.options.noPush"))
    .option("--no-tag", t("commands.release.options.noTag"))
    .option("--no-cascade", t("commands.release.options.noCascade"))
    .option("-s, --script <path>", t("commands.release.options.script"))
    .option("-d, --dry-run", t("commands.release.options.dryRun"))
    .option("-f, --force", t("commands.release.options.force"))
    .option("-m, --message <msg>", t("commands.release.options.message"))
    .action(async (target?: string, options?: ReleaseCommandOptions) => {
      try {
        await runRelease(target, options || {});
      } catch (err: any) {
        console.error("Release error:", err);
        process.exit(1);
      }
    });

  program
    .command("publish [target]")
    .alias("pub")
    .description(t("commands.publish.description"))
    .option("-p, --project <name>", t("commands.publish.options.project"))
    .option("-d, --dry-run", t("commands.publish.options.dryRun"))
    .option("--tag <tag>", t("commands.publish.options.tag"))
    .option("--access <public|restricted>", t("commands.publish.options.access"))
    .option("--no-build", t("commands.publish.options.noBuild"))
    .option("-f, --force", t("commands.publish.options.force"))
    .action(async (target?: string, options?: PublishCommandOptions) => {
      try {
        await runPublish(target, options || {});
      } catch (err: any) {
        console.error("Publish error:", err);
        process.exit(1);
      }
    });

  program
    .command("deploy [target]")
    .description(t("commands.deploy.description"))
    .option("-p, --project <name>", t("commands.deploy.options.project"))
    .option("-e, --env <name>", t("commands.deploy.options.env"))
    .option("--skip-check", t("commands.deploy.options.skipCheck"))
    .option("--skip-build", t("commands.deploy.options.skipBuild"))
    .option("-s, --script <path>", t("commands.deploy.options.script"))
    .option("-d, --dry-run", t("commands.deploy.options.dryRun"))
    .action(async (target?: string, options?: DeployCommandOptions) => {
      try {
        await runDeploy(target, options || {});
      } catch (err: any) {
        console.error("Deploy error:", err);
        process.exit(1);
      }
    });

  program
    .command("ui [subcommand]")
    .description(t("commands.ui.description"))
    .option("-p, --port <number>", t("commands.ui.options.port"))
    .option("-H, --host <host>", t("commands.ui.options.host"))
    .option("-d, --daemon", "在后台以守护进程模式运行 (适合桌面端与免干扰开发)")
    .option("--stop", "停止正在后台运行的 leoms workbench 服务")
    .option("--status", "查看后台服务当前运行健康度与 PID")
    .option("--no-open", t("commands.ui.options.noOpen"))
    .option("--internal-daemon", "内部守护进程标记")
    .action(async (subcommand?: string, options?: UiCommandOptions) => {
      try {
        await runUi(options || {}, subcommand);
      } catch (err: any) {
        console.error("UI error:", err);
        process.exit(1);
      }
    });

  program.parse(process.argv);
}
