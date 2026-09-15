import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import pc from "picocolors";
import Table from "cli-table3";
import { findWorkspaceRoot } from "../core/workspace.js";
import {
  getWorkspaceTemplatesDir,
  listAllTemplates,
} from "../core/template/resolver.js";
import { promptConfirm } from "../utils/prompt.js";

export async function runTemplateList(): Promise<void> {
  const rootDir = findWorkspaceRoot();
  const { custom, builtin } = listAllTemplates(rootDir);

  console.log(pc.bold("\n📦 Available Project Templates:\n"));

  const table = new Table({
    head: [
      pc.cyan("Type"),
      pc.cyan("Name"),
      pc.cyan("Shortcut"),
      pc.cyan("Version"),
      pc.cyan("Description"),
    ],
    colWidths: [14, 20, 14, 10, 42],
    wordWrap: true,
  });

  for (const t of custom) {
    table.push([
      pc.yellow("workspace"),
      pc.bold(t.name),
      pc.cyan(`:${t.name}`),
      t.version || "1.0.0",
      t.description || "Workspace custom template",
    ]);
  }

  for (const t of builtin) {
    table.push([
      pc.green("builtin"),
      pc.bold(t.name),
      pc.dim(t.name),
      t.version || "1.0.0",
      t.description || "Official leoms template",
    ]);
  }

  console.log(table.toString());
  console.log(
    pc.dim(`\nTip: Use "${pc.cyan(":")}" prefix (e.g. "${pc.cyan(`leoms create :${custom[0]?.name || "tpl"}`)}") to strictly use a workspace template.\n`)
  );
}

export async function runTemplateCreate(name: string): Promise<void> {
  if (!name || name.trim().length === 0) {
    console.error(pc.red("✖ Please specify a template name."));
    console.log(pc.dim("Example: leoms template create my-custom-tpl"));
    process.exit(1);
  }

  const rootDir = findWorkspaceRoot();
  if (!rootDir) {
    console.error(pc.red("✖ Cannot locate workspace root."));
    process.exit(1);
  }

  const customDir = getWorkspaceTemplatesDir(rootDir);
  const targetTplDir = join(customDir, name);

  if (existsSync(targetTplDir)) {
    console.error(
      pc.red(`✖ Custom template "${name}" already exists at ${targetTplDir}`)
    );
    process.exit(1);
  }

  mkdirSync(join(targetTplDir, "template"), { recursive: true });

  // 1. template.config.mjs (Custom template configuration and lifecycle hooks script)
  const configContent = `/**
 * @type {import('leoms').TemplateConfig}
 */
export default {
  name: "${name}",
  version: "1.0.0",
  description: "Custom workspace template for ${name}",

  // 交互式问询（可选）：回答注入 answers，且自动替换 template/ 中的 {{key}}
  prompts: [
    // { name: "db", message: "Database type:", type: "select", choices: [{ label: "PostgreSQL", value: "pg" }] },
    // { name: "docker", message: "Enable Docker?", type: "confirm", default: true },
  ],

  // 渲染前钩子：在文件复制前调用
  async beforeRender({ projectName, targetDir, answers }) {},

  // 渲染后钩子：在文件复制后调用，提供 utils.removeFile / writeFile / readFile / modifyJson
  async afterRender({ projectName, targetDir, answers, utils }) {},
};
`;
  writeFileSync(join(targetTplDir, "template.config.mjs"), configContent, "utf-8");

  // 2. README.md
  const readme = `# ${name} 模板

这是在 \`leoms\` 工作区中注册的自定义模板。

## 目录结构
- \`template.config.mjs\`：模板配置与钩子脚本（定义 \`prompts\` 与前后置 \`beforeRender\` / \`afterRender\` 钩子）。
- \`template/\`：模板项目文件目录。放入任意语言的项目代码，文件中的 \`{{projectName}}\` 会在生成时自动替换。

## 使用此模板创建项目
\`\`\`bash
# 严格使用此工作区模板
leoms create :${name} <project-name>

# 自动匹配（若有同名冲突会提示选择）
leoms create ${name} <project-name>
\`\`\`
`;
  writeFileSync(join(targetTplDir, "README.md"), readme, "utf-8");

  console.log(
    pc.green(`\n✔ Created custom template skeleton at ${pc.cyan(targetTplDir)}`)
  );
  console.log(
    pc.bold("Next steps:") +
      `\n  1. Put your project files into: ${pc.cyan(`${targetTplDir}/template/`)}` +
      `\n  2. Configure prompts & hooks in: ${pc.cyan(`${targetTplDir}/template.config.mjs`)}` +
      `\n  3. Run: ${pc.cyan(`leoms create :${name} <project-name>`)}\n`
  );
}

export async function runTemplateDelete(name: string): Promise<void> {
  if (!name || name.trim().length === 0) {
    console.error(pc.red("✖ Please specify a template name to delete."));
    process.exit(1);
  }

  const rootDir = findWorkspaceRoot();
  if (!rootDir) {
    console.error(pc.red("✖ Cannot locate workspace root."));
    process.exit(1);
  }

  const customDir = getWorkspaceTemplatesDir(rootDir);
  const targetTplDir = join(customDir, name);

  if (!existsSync(targetTplDir)) {
    console.error(
      pc.red(`✖ Custom template "${name}" does not exist at ${targetTplDir}`)
    );
    process.exit(1);
  }

  const confirmed = await promptConfirm(
    `Are you sure you want to delete custom template "${name}"?`,
    false
  );

  if (!confirmed) {
    console.log(pc.dim("Aborted."));
    return;
  }

  rmSync(targetTplDir, { recursive: true, force: true });
  console.log(pc.green(`✔ Deleted custom template "${name}".\n`));
}
