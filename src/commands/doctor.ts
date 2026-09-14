import pc from "picocolors";
import Table from "cli-table3";
import { execCommand } from "../utils/exec.js";
import { findWorkspaceRoot, getWorkspaceContext } from "../core/workspace.js";
import { isZh } from "../core/i18n.js";
import type { DoctorItem } from "../core/types.js";

export async function runDoctor(): Promise<void> {
  const zh = isZh();
  console.log(
    pc.bold(zh ? "\n🔍 正在运行 leoms doctor 环境与配置体检...\n" : "\n🔍 Running leoms doctor diagnostics...\n")
  );

  const items: DoctorItem[] = [];

  // 1. Check Node.js
  const nodeVersion = process.version;
  const majorNode = parseInt(nodeVersion.replace("v", "").split(".")[0] || "0", 10);
  if (majorNode >= 20) {
    items.push({
      category: zh ? "环境依赖" : "Environment",
      name: "Node.js",
      status: "ok",
      message: `${nodeVersion} ${zh ? "(ESM 与现代语法特性就绪)" : "(ESM & modern features ready)"}`,
    });
  } else {
    items.push({
      category: zh ? "环境依赖" : "Environment",
      name: "Node.js",
      status: "warn",
      message: `${nodeVersion} ${zh ? "(建议升级至 Node.js 20+)" : "(Recommended: Node.js 20+)"}`,
    });
  }

  // 2. Check pnpm
  const pnpmCheck = await execCommand("pnpm", ["-v"]);
  if (pnpmCheck.exitCode === 0) {
    items.push({
      category: zh ? "环境依赖" : "Environment",
      name: "pnpm",
      status: "ok",
      message: `v${pnpmCheck.stdout} ${zh ? "(现代 Monorepo 包管理器就绪)" : ""}`,
    });
  } else {
    items.push({
      category: zh ? "环境依赖" : "Environment",
      name: "pnpm",
      status: "error",
      message: zh ? "未检测到 pnpm 或运行 pnpm -v 报错" : "Not found or error running pnpm -v",
      detail: pnpmCheck.stderr,
    });
  }

  // 3. Check PHP
  const phpCheck = await execCommand("php", ["-v"]);
  if (phpCheck.exitCode === 0) {
    const firstLine = phpCheck.stdout.split("\n")[0] || "PHP detected";
    items.push({
      category: zh ? "环境依赖" : "Environment",
      name: "PHP",
      status: "ok",
      message: `${firstLine} ${zh ? "(PHP CLI 运行环境可用)" : ""}`,
    });
  } else {
    items.push({
      category: zh ? "环境依赖" : "Environment",
      name: "PHP",
      status: "warn",
      message: zh ? "PATH 中未找到 PHP CLI（将无法构建或运行 PHP 包）" : "PHP CLI not found in PATH",
    });
  }

  // 4. Check Composer
  const composerCheck = await execCommand("composer", ["--version"]);
  if (composerCheck.exitCode === 0) {
    const firstLine = composerCheck.stdout.split("\n")[0] || "Composer detected";
    items.push({
      category: zh ? "环境依赖" : "Environment",
      name: "Composer",
      status: "ok",
      message: `${firstLine} ${zh ? "(包管理器就绪)" : ""}`,
    });
  } else {
    items.push({
      category: zh ? "环境依赖" : "Environment",
      name: "Composer",
      status: "warn",
      message: zh ? "PATH 中未找到 Composer CLI" : "Composer CLI not found in PATH",
    });
  }

  // 5. Check Git
  const gitCheck = await execCommand("git", ["--version"]);
  if (gitCheck.exitCode === 0) {
    items.push({
      category: zh ? "环境依赖" : "Environment",
      name: "Git",
      status: "ok",
      message: `${gitCheck.stdout} ${zh ? "(版本控制系统就绪)" : ""}`,
    });
  } else {
    items.push({
      category: zh ? "环境依赖" : "Environment",
      name: "Git",
      status: "error",
      message: zh ? "PATH 中未检测到 Git 命令" : "Git CLI not found in PATH",
    });
  }

  // 6. Check Workspace Root
  const rootDir = findWorkspaceRoot();
  if (rootDir) {
    items.push({
      category: zh ? "工作区配置" : "Workspace",
      name: zh ? "根目录 (Root)" : "Root Directory",
      status: "ok",
      message: `${rootDir} ${zh ? "(已定位工作区根目录)" : ""}`,
    });

    const ctx = getWorkspaceContext(rootDir);

    // pnpm workspace check
    if (ctx.pnpmWorkspaceFile) {
      items.push({
        category: zh ? "工作区配置" : "Workspace",
        name: "pnpm-workspace.yaml",
        status: "ok",
        message: zh
          ? `已配置就绪 (包含 ${ctx.pnpmPackages.length} 组匹配规则: ${ctx.pnpmPackages.join(", ")})`
          : `Found (${ctx.pnpmPackages.length} package patterns: ${ctx.pnpmPackages.join(", ")})`,
      });
    } else {
      items.push({
        category: zh ? "工作区配置" : "Workspace",
        name: "pnpm-workspace.yaml",
        status: "warn",
        message: zh ? "根目录未检测到 pnpm-workspace.yaml 声明" : "Missing in root directory",
      });
    }

    // Composer path injection check
    if (ctx.composerConfigFile) {
      items.push({
        category: zh ? "工作区配置" : "Workspace",
        name: ".leoms/composer",
        status: "ok",
        message: zh
          ? `已激活隔离 (配置了 ${ctx.composerRepositories.length} 个本地 path 仓库，leoms 自动应用注入)`
          : `Active (${ctx.composerRepositories.length} path repositories configured, auto-applied by leoms)`,
      });
    } else {
      items.push({
        category: zh ? "工作区配置" : "Workspace",
        name: ".leoms/composer",
        status: "ok",
        message: zh ? "可选 (当前使用标准 Composer 配置)" : "Optional (using standard Composer config)",
      });
    }

    // COMPOSER_HOME env check (optional for native shell)
    const composerHome = process.env.COMPOSER_HOME;
    if (composerHome) {
      items.push({
        category: zh ? "工作区配置" : "Workspace",
        name: "COMPOSER_HOME 变量",
        status: "ok",
        message: zh
          ? `当前 Shell 环境已生效 (${composerHome}) - 原生 composer 隔离已就绪`
          : `Set in shell env (${composerHome}) - native composer enabled`,
      });
    } else {
      items.push({
        category: zh ? "工作区配置" : "Workspace",
        name: "COMPOSER_HOME 变量",
        status: "ok",
        message: zh
          ? '可选（leoms 命令会自动注入工作区专属环境；执行 "leoms init --set-composer-home" 可写入全局 Shell）'
          : 'Optional (leoms auto-injects workspace config; run "leoms init --set-composer-home" for native composer in shell)',
      });
    }

    // leoms.yml check
    if (ctx.leomsConfigFile) {
      items.push({
        category: zh ? "个性化配置" : "Config",
        name: "leoms.yml",
        status: "ok",
        message: zh ? `已从 ${ctx.leomsConfigFile} 加载自定义配置` : `Loaded from ${ctx.leomsConfigFile}`,
      });
    } else {
      items.push({
        category: zh ? "个性化配置" : "Config",
        name: "leoms.yml",
        status: "ok",
        message: zh ? "可选 (当前使用零配置与智能推导规则)" : "Optional (using defaults & zero-config inference)",
      });
    }
  } else {
    items.push({
      category: zh ? "工作区配置" : "Workspace",
      name: zh ? "根目录 (Root)" : "Root Directory",
      status: "error",
      message: zh
        ? "无法定位工作区根目录（向上未发现 pnpm-workspace.yaml 或 .leoms）"
        : "Cannot find workspace root (no pnpm-workspace.yaml or .leoms found upwards)",
    });
  }

  // Render Table
  const table = new Table({
    head: zh
      ? [pc.cyan("分类"), pc.cyan("检查项"), pc.cyan("状态"), pc.cyan("详情与建议")]
      : [pc.cyan("Category"), pc.cyan("Item"), pc.cyan("Status"), pc.cyan("Details")],
    colWidths: [15, 24, 10, 55],
    wordWrap: true,
  });

  let errorCount = 0;
  let warnCount = 0;

  for (const item of items) {
    let statusFormatted = "";
    if (item.status === "ok") {
      statusFormatted = pc.green(zh ? "✔ 正常" : "✔ OK");
    } else if (item.status === "warn") {
      statusFormatted = pc.yellow(zh ? "⚠ 警告" : "⚠ WARN");
      warnCount++;
    } else {
      statusFormatted = pc.red(zh ? "✖ 错误" : "✖ ERROR");
      errorCount++;
    }

    table.push([
      pc.dim(item.category),
      pc.bold(item.name),
      statusFormatted,
      item.detail ? `${item.message}\n${pc.dim(item.detail)}` : item.message,
    ]);
  }

  console.log(table.toString());

  console.log("");
  if (errorCount === 0 && warnCount === 0) {
    console.log(
      pc.green(
        zh
          ? "🎉 全部门禁与诊断体检项已通过！工作区状态健康良好。\n"
          : "🎉 All diagnostic checks passed! Workspace is in great shape.\n"
      )
    );
  } else if (errorCount === 0) {
    console.log(
      pc.yellow(
        zh
          ? `💡 关键体检全部通过，共发现 ${warnCount} 个建议提示项。\n`
          : `💡 All critical checks passed with ${warnCount} warning(s).\n`
      )
    );
  } else {
    console.log(
      pc.red(
        zh
          ? `❌ 体检发现 ${errorCount} 个阻断性错误与 ${warnCount} 个警告提示，请优先解决上述列表中的阻断项。\n`
          : `❌ Diagnostics found ${errorCount} error(s) and ${warnCount} warning(s).\n`
      )
    );
  }
}
