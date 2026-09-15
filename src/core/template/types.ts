export type TemplateType = "custom" | "builtin";

export interface TemplateInfo {
  name: string;
  type: TemplateType;
  dir: string;
  description?: string;
  version?: string;
}

export interface TemplateConfigPrompt {
  name: string;
  message: string;
  type: "select" | "confirm" | "input";
  choices?: Array<{ label: string; value: any; hint?: string }>;
  default?: any;
}

export interface TemplateUtils {
  removeFile: (relativePath: string) => void;
  writeFile: (relativePath: string, content: string) => void;
  readFile: (relativePath: string) => string | null;
  modifyJson: (relativePath: string, mutator: (json: any) => any) => void;
}

export interface TemplateContext {
  projectName: string;
  targetDir: string;
  template: TemplateInfo;
  answers: Record<string, any>;
  utils: TemplateUtils;
}

export interface TemplateConfig {
  name?: string;
  description?: string;
  version?: string;
  prompts?: TemplateConfigPrompt[];
  beforeRender?: (ctx: Omit<TemplateContext, "utils">) => Promise<void> | void;
  afterRender?: (ctx: TemplateContext) => Promise<void> | void;
}

export interface CreateProjectOptions {
  projectName: string;
  targetDir: string;
  template: TemplateInfo;
  config?: TemplateConfig | null;
  answers?: Record<string, any>;
  uiLibrary?: "shadcn" | "antd" | "none";
  force?: boolean;
}
