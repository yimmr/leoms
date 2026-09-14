export interface CompanionServiceConfig {
  command: string;
  port?: number;
  healthCheck?: string;
  autoLaunch?: boolean;
}

export interface DesktopConfig {
  engine?: "tauri" | "electron";
  srcDir?: string;
  port?: number;
  cacheDir?: string;
  outDir?: string;
  frontendBuildScript?: string;
  frontendDevScript?: string;
  companion?: CompanionServiceConfig;
}

export interface DesktopDevOptions {
  project?: string;
  port?: string | number;
  targetDir?: string;
  companion?: boolean;
  noCompanion?: boolean;
  open?: boolean;
}

export interface DesktopBuildOptions {
  project?: string;
  outDir?: string;
  clean?: boolean;
  skipUi?: boolean;
}

export interface DesktopDoctorItem {
  name: string;
  status: "ok" | "warn" | "error";
  message: string;
  remedy?: string;
}

export interface DetectedDesktopProject {
  projectDir: string;
  projectName: string;
  srcTauriDir: string;
  devUrl: string;
  devPort: number;
  devScript: string;
  buildScript: string;
  companion?: CompanionServiceConfig;
}
