import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, resolve, relative, basename, dirname } from "node:path";
import pc from "picocolors";
import type { CreateProjectOptions } from "./types.js";

const BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".ico",
  ".webp",
  ".svgz",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".zip",
  ".tar",
  ".gz",
  ".pdf",
]);

function isBinaryFile(filePath: string): boolean {
  const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}

/**
 * Apply UI Library recipes for react-vite template
 */
function applyUiLibraryRecipe(
  targetDir: string,
  projectName: string,
  uiLibrary: "shadcn" | "antd" | "none"
): void {
  const pkgPath = join(targetDir, "package.json");
  if (!existsSync(pkgPath)) return;

  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  pkg.dependencies = pkg.dependencies || {};
  pkg.devDependencies = pkg.devDependencies || {};

  if (uiLibrary === "shadcn") {
    // 1. Add shadcn / radix dependencies
    pkg.dependencies["clsx"] = "^2.1.1";
    pkg.dependencies["tailwind-merge"] = "^3.0.2";
    pkg.dependencies["lucide-react"] = "^1.16.0";
    pkg.dependencies["class-variance-authority"] = "^0.7.1";

    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf-8");

    // 2. Add components.json
    const componentsConfig = {
      $schema: "https://ui.shadcn.com/schema.json",
      style: "new-york",
      rsc: false,
      tsx: true,
      tailwind: {
        config: "",
        css: "src/index.css",
        baseColor: "neutral",
        cssVariables: true,
      },
      aliases: {
        components: "@/components",
        utils: "@/lib/utils",
        ui: "@/components/ui",
        lib: "@/lib",
        hooks: "@/hooks",
      },
    };
    writeFileSync(
      join(targetDir, "components.json"),
      JSON.stringify(componentsConfig, null, 2) + "\n",
      "utf-8"
    );

    // 2.1 Update src/lib/utils.ts to use clsx and twMerge
    const utilsCode = `import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
`;
    writeFileSync(join(targetDir, "src/lib/utils.ts"), utilsCode, "utf-8");

    // 3. Add Button component
    const uiDir = join(targetDir, "src/components/ui");
    mkdirSync(uiDir, { recursive: true });

    const buttonCode = `import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
  {
    variants: {
      variant: {
        default: "bg-slate-900 text-white shadow hover:bg-slate-900/90 dark:bg-slate-50 dark:text-slate-900",
        destructive: "bg-red-500 text-white shadow-sm hover:bg-red-500/90",
        outline: "border border-slate-200 bg-white shadow-sm hover:bg-slate-100 hover:text-slate-900",
        secondary: "bg-slate-100 text-slate-900 shadow-sm hover:bg-slate-100/80",
        ghost: "hover:bg-slate-100 hover:text-slate-900",
        link: "text-slate-900 underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
`;
    writeFileSync(join(uiDir, "button.tsx"), buttonCode, "utf-8");

    // 4. Update App.tsx showcasing shadcn Button
    const appCode = `import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles, Terminal } from "lucide-react";

export function App() {
  const [count, setCount] = useState(0);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-2xl p-8 shadow-xl border border-slate-100 text-center space-y-6">
        <div className="inline-flex p-3 bg-indigo-50 text-indigo-600 rounded-xl">
          <Sparkles className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">${projectName}</h1>
        <p className="text-sm text-slate-500">
          React 19 + Vite + Tailwind CSS v4 + shadcn/ui
        </p>

        <div className="flex justify-center gap-3">
          <Button onClick={() => setCount((c) => c + 1)}>
            Count is: {count}
          </Button>
          <Button variant="outline" onClick={() => setCount(0)}>
            Reset
          </Button>
        </div>

        <div className="p-3 bg-slate-50 rounded-lg text-left text-xs font-mono text-slate-600 flex items-center gap-2">
          <Terminal className="w-4 h-4 text-slate-400" />
          <span>Edit src/App.tsx to start building</span>
        </div>
      </div>
    </div>
  );
}

export default App;
`;
    writeFileSync(join(targetDir, "src/App.tsx"), appCode, "utf-8");
  } else if (uiLibrary === "antd") {
    // Ant Design recipe
    pkg.dependencies["antd"] = "^5.24.0";
    pkg.dependencies["@ant-design/icons"] = "^5.6.0";
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf-8");

    const appCode = `import { useState } from "react";
import { Button, Card, Space, Typography } from "antd";
import { RocketOutlined, ReloadOutlined } from "@ant-design/icons";

const { Title, Text } = Typography;

export function App() {
  const [count, setCount] = useState(0);

  return (
    <div className="min-h-screen bg-neutral-50 flex items-center justify-center p-6">
      <Card className="max-w-md w-full shadow-lg text-center" bordered={false}>
        <Space direction="vertical" size="large" className="w-full">
          <div>
            <Title level={3}>${projectName}</Title>
            <Text type="secondary">React 19 + Vite + Tailwind CSS + Ant Design</Text>
          </div>

          <Space>
            <Button
              type="primary"
              icon={<RocketOutlined />}
              onClick={() => setCount((c) => c + 1)}
            >
              Clicked {count} times
            </Button>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => setCount(0)}
            >
              Reset
            </Button>
          </Space>

          <Text code className="text-xs">
            Edit src/App.tsx to get started
          </Text>
        </Space>
      </Card>
    </div>
  );
}

export default App;
`;
    writeFileSync(join(targetDir, "src/App.tsx"), appCode, "utf-8");
  }
}

/**
 * Generate a project from template
 */
export async function generateProject(options: CreateProjectOptions): Promise<string[]> {
  const {
    projectName,
    targetDir,
    template,
    config,
    answers = {},
    uiLibrary = "none",
    force = false,
  } = options;

  if (existsSync(targetDir) && !force) {
    const existing = readdirSync(targetDir);
    if (existing.length > 0) {
      throw new Error(
        `Target directory "${targetDir}" already exists and is not empty.`
      );
    }
  }

  mkdirSync(targetDir, { recursive: true });

  // 1. Run beforeRender hook if declared
  if (config?.beforeRender) {
    await config.beforeRender({
      projectName,
      targetDir,
      template,
      answers,
    });
  }

  // Check if template has a nested 'template' folder
  const innerTemplateDir = join(template.dir, "template");
  const sourceDir = existsSync(innerTemplateDir) ? innerTemplateDir : template.dir;

  const createdFiles: string[] = [];

  function copyRecursively(currentSource: string, currentTarget: string) {
    const entries = readdirSync(currentSource, { withFileTypes: true });

    for (const entry of entries) {
      // Ignore root config file or node_modules/dist in template source
      if (
        entry.name === "node_modules" ||
        entry.name === "dist" ||
        entry.name === ".git" ||
        entry.name.startsWith("template.config.") ||
        entry.name === ".gitkeep"
      ) {
        continue;
      }

      const srcPath = join(currentSource, entry.name);
      // Handle _gitignore -> .gitignore, _npmrc -> .npmrc
      let targetName = entry.name;
      if (targetName === "_gitignore") targetName = ".gitignore";
      if (targetName === "_npmrc") targetName = ".npmrc";

      const destPath = join(currentTarget, targetName);

      if (entry.isDirectory()) {
        mkdirSync(destPath, { recursive: true });
        copyRecursively(srcPath, destPath);
      } else {
        if (isBinaryFile(srcPath)) {
          writeFileSync(destPath, readFileSync(srcPath));
        } else {
          let content = readFileSync(srcPath, "utf-8");
          // Standard replacements
          content = content
            .replace(/\{\{projectName\}\}/g, projectName)
            .replace(/\{\{name\}\}/g, projectName)
            .replace(/__PROJECT_NAME__/g, projectName)
            .replace(/__NAME__/g, projectName);

          // Replace any answers keys (e.g. {{author}}, {{port}}, {{dbType}})
          for (const [key, val] of Object.entries(answers)) {
            if (typeof val === "string" || typeof val === "number" || typeof val === "boolean") {
              const reg1 = new RegExp(`\\{\\{${key}\\}\\}`, "g");
              const reg2 = new RegExp(`__${key.toUpperCase()}__`, "g");
              content = content.replace(reg1, String(val)).replace(reg2, String(val));
            }
          }

          writeFileSync(destPath, content, "utf-8");
        }
        createdFiles.push(relative(targetDir, destPath));
      }
    }
  }

  copyRecursively(sourceDir, targetDir);

  // Apply UI Library recipe if chosen for builtin react-vite
  if (template.type === "builtin" && template.name === "react-vite" && uiLibrary !== "none") {
    applyUiLibraryRecipe(targetDir, projectName, uiLibrary);
  }

  // 2. Prepare utils and run afterRender hook if declared
  const utils = {
    removeFile: (relPath: string) => {
      const p = join(targetDir, relPath);
      if (existsSync(p)) {
        rmSync(p, { recursive: true, force: true });
      }
    },
    writeFile: (relPath: string, content: string) => {
      const p = join(targetDir, relPath);
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, content, "utf-8");
    },
    readFile: (relPath: string) => {
      const p = join(targetDir, relPath);
      return existsSync(p) ? readFileSync(p, "utf-8") : null;
    },
    modifyJson: (relPath: string, mutator: (json: any) => any) => {
      const p = join(targetDir, relPath);
      if (existsSync(p)) {
        try {
          const json = JSON.parse(readFileSync(p, "utf-8"));
          const modified = mutator(json) || json;
          writeFileSync(p, JSON.stringify(modified, null, 2) + "\n", "utf-8");
        } catch {}
      }
    },
  };

  if (config?.afterRender) {
    await config.afterRender({
      projectName,
      targetDir,
      template,
      answers,
      utils,
    });
  }

  return createdFiles;
}
