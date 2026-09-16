import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync, createReadStream, statSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, extname, dirname } from "node:path";
import { homedir } from "node:os";
import {
  getWorkspaceStatus,
  getProjects,
  getTopology,
  getAffected,
  getCheckRules,
  runChecks,
  getComposerIsolation,
  executeTaskAsync,
  getProjectDependencies,
  getProjectOutdated,
  modifyProjectDependency,
  searchRegistry,
  getPublishPlan,
  initWorkspace,
  taskManager,
} from "./api.js";
import type { CheckRunRequest, TaskRunRequest } from "./types.js";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};

export interface ServerOptions {
  port?: number;
  host?: string;
  rootDir: string;
  uiDistDir?: string;
}

export interface ServerInstance {
  port: number;
  host: string;
  url: string;
  close: () => Promise<void>;
}

function setCors(res: ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function sendJson(res: ServerResponse, data: any, statusCode: number = 200) {
  setCors(res);
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function sendError(res: ServerResponse, message: string, statusCode: number = 500) {
  sendJson(res, { error: message, success: false }, statusCode);
}

async function readBody<T = any>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString("utf8");
    });
    req.on("end", () => {
      if (!body.trim()) {
        resolve({} as T);
        return;
      }
      try {
        resolve(JSON.parse(body) as T);
      } catch (err) {
        reject(new Error("Invalid JSON request body"));
      }
    });
    req.on("error", reject);
  });
}

function getDesktopConfigPath(): string {
  const home = homedir();
  return join(home, ".config", "leoms", "desktop.json");
}

function readDesktopConfig(): Record<string, any> {
  const p = getDesktopConfigPath();
  if (existsSync(p)) {
    try {
      return JSON.parse(readFileSync(p, "utf8"));
    } catch {}
  }
  return {};
}

function writeDesktopConfig(cfg: Record<string, any>): void {
  const p = getDesktopConfigPath();
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(cfg, null, 2), "utf8");
}

export async function startServer(options: ServerOptions): Promise<ServerInstance> {
  const { rootDir, host = "localhost" } = options;
  const preferredPort = options.port || 3200;
  const uiDistDir = options.uiDistDir || join(rootDir, "apps/leoms/dist/ui");

  const server = createServer(async (req, res) => {
    setCors(res);

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const parsed = new URL(req.url || "/", `http://${host}:${actualPort}`);
    const pathname = parsed.pathname || "/";

    try {
      // ---------------- API Routes ----------------
      if (pathname.startsWith("/api/")) {
        // Health check
        if (pathname === "/api/health") {
          sendJson(res, { status: "ok", timestamp: Date.now() });
          return;
        }

        // Workspace metadata & onboarding check
        if (pathname === "/api/workspace/meta" && req.method === "GET") {
          const isWorkspace = existsSync(join(rootDir, "pnpm-workspace.yaml")) || existsSync(join(rootDir, "leoms.yml"));
          const hasComposer = existsSync(join(rootDir, ".leoms/composer/config.json"));
          sendJson(res, {
            rootDir,
            port: actualPort,
            isWorkspace,
            hasComposer,
          });
          return;
        }

        // Initialize workspace
        if (pathname === "/api/workspace/init" && req.method === "POST") {
          try {
            const body = await readBody(req);
            const result = await initWorkspace(rootDir, body);
            sendJson(res, result);
          } catch (err: any) {
            sendError(res, err.message || "Failed to initialize workspace", 500);
          }
          return;
        }

        // Desktop Settings Config
        if (pathname === "/api/desktop/config" && req.method === "GET") {
          sendJson(res, readDesktopConfig());
          return;
        }

        if (pathname === "/api/desktop/config" && req.method === "POST") {
          try {
            const body = await readBody(req);
            const current = readDesktopConfig();
            const updated = { ...current, ...body };
            writeDesktopConfig(updated);
            sendJson(res, { success: true, config: updated });
          } catch (err: any) {
            sendError(res, err.message || "Failed to save desktop config", 500);
          }
          return;
        }

        // Topology Release Plan
        if (pathname === "/api/plan" && req.method === "GET") {
          const target = parsed.searchParams.get("target") || undefined;
          try {
            const plan = await getPublishPlan(rootDir, target);
            sendJson(res, plan);
          } catch (err: any) {
            sendError(res, err.message || "Failed to calculate release plan", 500);
          }
          return;
        }

        // Workspace status
        if (pathname === "/api/status" && req.method === "GET") {
          const data = await getWorkspaceStatus(rootDir);
          sendJson(res, data);
          return;
        }

        // Projects list
        if (pathname === "/api/projects" && req.method === "GET") {
          const eco = parsed.searchParams.get("ecosystem") as any;
          const data = await getProjects(rootDir, eco);
          sendJson(res, { projects: data });
          return;
        }

        // Topology graph
        if (pathname === "/api/topology" && req.method === "GET") {
          const data = await getTopology(rootDir);
          sendJson(res, data);
          return;
        }

        // Affected analysis
        if (pathname === "/api/affected" && req.method === "GET") {
          const baseRef = parsed.searchParams.get("baseRef") || undefined;
          const data = await getAffected(rootDir, baseRef);
          sendJson(res, data);
          return;
        }

        // Check rules metadata
        if (pathname === "/api/checks/rules" && req.method === "GET") {
          const data = getCheckRules();
          sendJson(res, { rules: data });
          return;
        }

        // Run checks
        if (pathname === "/api/checks/run" && req.method === "POST") {
          const body = await readBody<CheckRunRequest>(req);
          const data = await runChecks(rootDir, body);
          sendJson(res, data);
          return;
        }

        // Project dependencies inspection & CRUD
        if (pathname === "/api/projects/dependencies") {
          if (req.method === "GET") {
            const project = parsed.searchParams.get("project");
            if (!project) {
              sendError(res, "Missing project query parameter", 400);
              return;
            }
            try {
              const data = await getProjectDependencies(rootDir, project);
              sendJson(res, data);
            } catch (err: any) {
              sendError(res, err.message || "Failed to get project dependencies", 500);
            }
            return;
          }

          if (req.method === "POST") {
            try {
              const body = await readBody(req);
              if (!body.projectName || !body.name || !body.action) {
                sendError(res, "Missing required fields (projectName, name, action)", 400);
                return;
              }
              const result = await modifyProjectDependency(rootDir, body.projectName, body);
              sendJson(res, result);
            } catch (err: any) {
              sendError(res, err.message || "Failed to modify dependency", 500);
            }
            return;
          }
        }

        // Project outdated dependencies inspection
        if (pathname === "/api/projects/outdated" && req.method === "GET") {
          const project = parsed.searchParams.get("project");
          if (!project) {
            sendError(res, "Missing project query parameter", 400);
            return;
          }
          try {
            const data = await getProjectOutdated(rootDir, project);
            sendJson(res, { outdated: data });
          } catch (err: any) {
            sendError(res, err.message || "Failed to get project outdated dependencies", 500);
          }
          return;
        }

        // Community package registry search
        if (pathname === "/api/registry/search" && req.method === "GET") {
          const q = parsed.searchParams.get("q") || "";
          const eco = (parsed.searchParams.get("ecosystem") as any) || "npm";
          try {
            const data = await searchRegistry(q, eco);
            sendJson(res, data);
          } catch (err: any) {
            sendError(res, err.message || "Search failed", 500);
          }
          return;
        }

        // Run task
        if (pathname === "/api/tasks/run" && req.method === "POST") {
          const body = await readBody<TaskRunRequest>(req);
          const task = executeTaskAsync(rootDir, body.action, body.target, body.options || {});
          sendJson(res, { task });
          return;
        }

        // Abort running task: POST /api/tasks/:id/abort
        if (pathname.startsWith("/api/tasks/") && pathname.endsWith("/abort") && req.method === "POST") {
          const parts = pathname.split("/");
          const taskId = parts[3];
          const aborted = taskManager.abortTask(taskId);
          sendJson(res, { success: aborted, message: aborted ? "任务已成功终止" : "任务已结束或不存在" });
          return;
        }

        // Get task status
        if (pathname.startsWith("/api/tasks/") && req.method === "GET") {
          const parts = pathname.split("/");
          const taskId = parts[3];

          // SSE log streaming: /api/tasks/:id/stream
          if (parts[4] === "stream") {
            const task = taskManager.getTask(taskId);
            if (!task) {
              sendError(res, `Task not found: ${taskId}`, 404);
              return;
            }

            res.writeHead(200, {
              "Content-Type": "text/event-stream; charset=utf-8",
              "Cache-Control": "no-cache",
              Connection: "keep-alive",
            });

            // Send existing buffered logs
            for (const log of task.logs) {
              res.write(`data: ${JSON.stringify(log)}\n\n`);
            }

            // Listen for new logs
            const logHandler = (entry: any) => {
              res.write(`data: ${JSON.stringify(entry)}\n\n`);
            };

            const finishHandler = (t: any) => {
              res.write(`event: finish\ndata: ${JSON.stringify({ exitCode: t.exitCode, durationMs: t.durationMs })}\n\n`);
              cleanup();
            };

            const cleanup = () => {
              taskManager.off(`log:${taskId}`, logHandler);
              taskManager.off(`finish:${taskId}`, finishHandler);
            };

            taskManager.on(`log:${taskId}`, logHandler);
            taskManager.on(`finish:${taskId}`, finishHandler);

            req.on("close", cleanup);
            return;
          }

          const task = taskManager.getTask(taskId);
          if (!task) {
            sendError(res, `Task not found: ${taskId}`, 404);
            return;
          }
          sendJson(res, { task });
          return;
        }

        // Composer isolation details
        if (pathname === "/api/composer" && req.method === "GET") {
          const data = await getComposerIsolation(rootDir);
          sendJson(res, data);
          return;
        }

        sendError(res, `API route not found: ${pathname}`, 404);
        return;
      }

      // ---------------- Static File Serving (UI) ----------------
      if (existsSync(uiDistDir)) {
        let filePath = join(uiDistDir, pathname === "/" ? "index.html" : pathname);

        // Security check: ensure filePath is within uiDistDir
        if (!filePath.startsWith(uiDistDir)) {
          sendError(res, "Access Denied", 403);
          return;
        }

        if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
          // SPA fallback to index.html
          filePath = join(uiDistDir, "index.html");
        }

        if (existsSync(filePath)) {
          const ext = extname(filePath).toLowerCase();
          const contentType = MIME_TYPES[ext] || "application/octet-stream";
          res.writeHead(200, { "Content-Type": contentType });
          createReadStream(filePath).pipe(res);
          return;
        }
      }

      // If UI is not yet built, return a friendly placeholder page
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>leoms Workbench - Initializing</title>
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; background: #09090b; color: #f4f4f5; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
            .card { background: rgba(255,255,255,0.05); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 40px; max-width: 500px; text-align: center; box-shadow: 0 20px 40px rgba(0,0,0,0.5); }
            h1 { font-size: 24px; margin-bottom: 12px; background: linear-gradient(135deg, #a78bfa, #38bdf8); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
            p { color: #a1a1aa; line-height: 1.6; font-size: 14px; }
            .badge { display: inline-block; padding: 4px 12px; border-radius: 9999px; background: rgba(56,189,248,0.15); color: #38bdf8; font-size: 12px; font-weight: 600; margin-bottom: 16px; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="badge">🦁 leoms server ready</div>
            <h1>leoms Visual Workbench</h1>
            <p>The backend API server is actively running on this port. The frontend UI assets are currently being bundled.</p>
            <p>Run <code>pnpm --filter leoms-ui build</code> or start the Vite dev server for instant HMR preview.</p>
          </div>
        </body>
        </html>
      `);
    } catch (err: any) {
      sendError(res, err.message || "Internal server error");
    }
  });

  // Try listening on preferredPort, increment if in use
  let actualPort = preferredPort;
  const maxAttempts = 10;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(actualPort, host, () => {
          server.removeListener("error", reject);
          resolve();
        });
      });
      break;
    } catch (err: any) {
      if (err.code === "EADDRINUSE") {
        actualPort++;
      } else {
        throw err;
      }
    }
  }

  const url = `http://${host}:${actualPort}`;

  return {
    port: actualPort,
    host,
    url,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
