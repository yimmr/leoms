import { existsSync } from "node:fs";
import { join, resolve, relative } from "node:path";
import pc from "picocolors";
import { findWorkspaceRoot } from "../core/workspace.js";
import {
  listAllTemplates,
  resolveTemplate,
  loadTemplateConfig,
} from "../core/template/resolver.js";
import { generateProject } from "../core/template/generator.js";
import { promptConfirm, promptInput, promptSelect } from "../utils/prompt.js";

export interface CreateCommandOptions {
  force?: boolean;
}

export async function runCreate(
  templateArg?: string,
  nameArg?: string,
  options: CreateCommandOptions = {}
): Promise<void> {
  const rootDir = findWorkspaceRoot();

  // 1. If template is not specified, interactively select one
  if (!templateArg) {
    const { all } = listAllTemplates(rootDir);
    if (all.length === 0) {
      console.error(pc.red("✖ No templates available."));
      process.exit(1);
    }

    const selected = await promptSelect<string>(
      "Select a project template:",
      all.map((t) => ({
        label: t.type === "custom" ? `[workspace] ${t.name}` : `[builtin]   ${t.name}`,
        value: t.type === "custom" ? `:${t.name}` : t.name,
        hint: pc.dim(t.description || ""),
      }))
    );
    templateArg = selected;
  }

  // 2. Resolve template (handles ':' prefix and duplicate collision resolution)
  const template = await resolveTemplate(templateArg, rootDir);

  // 3. If project name is not specified, interactively prompt for it
  if (!nameArg) {
    const defaultName = `${template.name}-app`;
    nameArg = await promptInput(
      "Project name",
      defaultName,
      (val) => {
        if (!val || val.trim().length === 0) return "Project name cannot be empty.";
        if (!/^[a-zA-Z0-9_\-./]+$/.test(val)) {
          return "Project name can only contain letters, numbers, hyphens, underscores, dots, or slashes.";
        }
        return true;
      }
    );
  }

  // 4. Resolve target directory
  let targetDir: string;
  if (nameArg.startsWith("/") || nameArg.startsWith("./") || nameArg.includes("/")) {
    targetDir = resolve(process.cwd(), nameArg);
  } else if (rootDir && process.cwd() === rootDir && existsSync(join(rootDir, "apps"))) {
    targetDir = join(rootDir, "apps", nameArg);
  } else {
    targetDir = resolve(process.cwd(), nameArg);
  }

  // 5. Load template configuration (for prompts and hooks)
  const config = await loadTemplateConfig(template.dir);
  const answers: Record<string, any> = {};

  if (config?.prompts && config.prompts.length > 0) {
    for (const p of config.prompts) {
      if (p.type === "confirm") {
        answers[p.name] = await promptConfirm(p.message, p.default ?? true);
      } else if (p.type === "select" && p.choices && p.choices.length > 0) {
        answers[p.name] = await promptSelect(p.message, p.choices);
      } else {
        answers[p.name] = await promptInput(p.message, p.default ? String(p.default) : undefined);
      }
    }
  }

  // 6. If built-in react-vite template, prompt for UI library
  let uiLibrary: "shadcn" | "antd" | "none" = "none";
  if (template.type === "builtin" && template.name === "react-vite") {
    uiLibrary = await promptSelect<"shadcn" | "antd" | "none">(
      "Select a UI library:",
      [
        {
          label: "shadcn/ui",
          value: "shadcn",
          hint: pc.green("[Recommended: modern, accessible, copy-paste]"),
        },
        {
          label: "Ant Design",
          value: "antd",
          hint: pc.dim("[Enterprise-ready UI system]"),
        },
        {
          label: "None (Pure Tailwind CSS)",
          value: "none",
          hint: pc.dim("[No extra UI library]"),
        },
      ]
    );
  }

  // 7. Generate project
  console.log(
    pc.bold(
      `\n🚀 Creating project ${pc.cyan(nameArg)} using template ${pc.green(
        template.name
      )}...\n`
    )
  );

  try {
    const files = await generateProject({
      projectName: nameArg.includes("/") ? nameArg.split("/").pop()! : nameArg,
      targetDir,
      template,
      config,
      answers,
      uiLibrary,
      force: options.force,
    });

    console.log(
      pc.green(
        `✔ Successfully created ${pc.bold(nameArg)} at ${pc.cyan(targetDir)} (${files.length} files)\n`
      )
    );

    const relPath = relative(process.cwd(), targetDir) || ".";
    console.log(pc.bold("Next steps:"));
    if (relPath !== ".") {
      console.log(`  ${pc.cyan(`cd ${relPath}`)}`);
    }
    console.log(`  ${pc.cyan("pnpm install")}`);
    console.log(`  ${pc.cyan("pnpm dev")}\n`);
  } catch (err: any) {
    console.error(pc.red(`✖ Failed to create project: ${err.message}`));
    process.exit(1);
  }
}
