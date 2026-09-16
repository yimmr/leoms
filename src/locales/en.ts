import type { LocaleSchema } from "./schema.js";

export const en: LocaleSchema = {
  cli: {
    name: "leoms",
    description: "Inspector and orchestrator for multi-language, multi-repo workspace",
    version: "output the version number",
    help: "display help for command",
    helpCommand: "display help for command",
    lang: "Set output language (supported: zh, en; default: zh)",
    titles: {
      usage: "Usage:",
      arguments: "Arguments:",
      options: "Options:",
      globalOptions: "Global Options:",
      commands: "Commands:",
    },
  },
  commands: {
    init: {
      description: "Bootstrap workspace with pnpm workspaces, Composer path config, and standard directory skeleton",
      options: {
        yes: "Skip interactive prompts and use defaults",
        config: "Generate optional starter leoms.yml config file",
        setComposerHome: "Persistently set COMPOSER_HOME in shell profile (~/.bashrc)",
        force: "Overwrite existing configuration files",
      },
    },
    doctor: {
      description: "Diagnose Node, pnpm, PHP, Composer environment and workspace configuration",
    },
    status: {
      description: "Workspace asset status overview with Git state, dependencies, and risk detection",
      options: {
        project: "Show detailed status for a specific project",
        php: "Target only PHP (Composer) packages",
        npm: "Target only Node (npm) packages",
      },
    },
    list: {
      description: "List all detected packages and projects in the workspace",
      options: {
        php: "Target only PHP (Composer) packages",
        npm: "Target only Node (npm) packages",
      },
    },
    affected: {
      description: "Analyze directly changed and downstream affected projects via Git diff and DAG",
      options: {
        base: "Git base reference to compare against (default: main)",
        plain: "Output plain list of affected project names for CI/scripts",
        type: "Filter by impact type (all, direct, downstream)",
        php: "Filter only PHP (Composer) affected projects",
        npm: "Filter only Node (npm) affected projects",
      },
    },
    install: {
      description: "Install dependencies for the entire workspace or a specific project (Node + PHP)",
      options: {
        project: "Target project name or relative path",
        php: "Install only PHP (Composer) dependencies",
        npm: "Install only Node (npm) dependencies",
      },
    },
    add: {
      description: "Add dependencies to a project with interactive project/ecosystem selection",
      options: {
        project: "Target project name or relative path",
        dev: "Save package as development dependency",
        php: "Target PHP (Composer) dependency",
        npm: "Target Node (npm) dependency",
      },
    },
    remove: {
      description: "Remove dependencies from a project",
      options: {
        project: "Target project name or relative path",
        php: "Remove from PHP (Composer) dependencies",
        npm: "Remove from Node (npm) dependencies",
      },
    },
    composer: {
      description: "Run Composer with COMPOSER_HOME automatically configured for this workspace",
    },
    build: {
      description: "Build specified project(s) or affected projects across Node and PHP",
      options: {
        project: "Target project name or relative path to build",
        all: "Explicitly build all projects in the workspace",
        affected: "Build only projects affected by git changes",
        base: "Git base reference for affected analysis (default: main)",
        noDeps: "Do not build upstream internal dependencies",
        php: "Run only PHP build tasks (dump-autoload -o / script)",
        npm: "Run only Node build tasks (pnpm run build)",
      },
    },
    check: {
      description: "Pluggable health & gatekeeper check (default: fast checks; -a: all including phantom; -i: only rules)",
      options: {
        project: "Target project name or relative path to check",
        all: "Run all checks including heavy rules (e.g. phantom dependencies)",
        only: "Run only specified check rule(s) (e.g. linkage, git, standalone, dist, phantom)",
        skip: "Skip specified check rule(s)",
        listRules: "List all registered check rules and their descriptions",
        plan: "Calculate and preview release plan sorted by dependency DAG topology",
        php: "Target only PHP (Composer) packages and dependencies",
        npm: "Target only Node (npm) packages and dependencies",
      },
      rulesCatalogTitle: "\n📋 Registered Check Rules in leoms\n",
      rulesCatalogTable: {
        ruleId: "Rule ID",
        category: "Category",
        name: "Name",
        default: "Default",
        description: "Description",
        yesFast: "yes (fast)",
        allInclude: "--all",
        no: "no",
      },
      planTitle: "\n📦 Release Topology Simulation Plan (DAG Topo Order):\n",
      planBatch: "Batch {step}: [{names}] (independent, can release concurrently)",
    },
    plan: {
      description: "Calculate and display release execution plan based on dependency DAG topology",
      options: {
        project: "Target project name or relative path",
      },
    },
    release: {
      description: "Release a project: bump version, cascade downstream dependencies, git tag, and push to remote(s)",
      options: {
        project: "Target project name or relative path to release",
        patch: "Bump patch version (e.g. 0.1.0 -> 0.1.1)",
        minor: "Bump minor version (e.g. 0.1.0 -> 0.2.0)",
        major: "Bump major version (e.g. 0.1.0 -> 1.0.0)",
        to: "Explicit target version to set",
        publish: "Automatically publish package to registry after release",
        noPush: "Commit and tag locally without pushing to remote git",
        noTag: "Update version and commit without creating git tag",
        noCascade: "Do not cascade version update to dependent workspace projects",
        script: "Specify custom release script to execute after tagging",
        dryRun: "Preview release actions without modifying files or git",
        force: "Bypass uncommitted git changes warning",
        message: "Custom git commit message",
      },
    },
    publish: {
      description: "Publish a package to external package registry (pnpm publish for Node / Packagist sync for PHP)",
      options: {
        project: "Target package name or relative path to publish",
        dryRun: "Simulate the publish process without uploading",
        tag: "npm dist-tag (default: latest)",
        access: "npm package access level",
        noBuild: "Skip pre-publish build step",
        force: "Force publish even if marked private",
      },
    },
    deploy: {
      description: "Deploy application to server: security pre-flight check, build artifacts, and execute deploy script",
      options: {
        project: "Target application name or relative path to deploy",
        env: "Target deployment environment (default: production)",
        skipCheck: "Bypass pre-deployment security gatekeeper",
        skipBuild: "Bypass build step before deploying",
        script: "Specify explicit deploy script path (overrides leoms.yml deploy.script)",
        dryRun: "Simulate deployment without executing scripts",
        opt: "Custom deploy options (key=value format, can be repeated, injected as LEOMS_OPT_* temporary env vars)",
      },
    },
    ui: {
      description: "Launch the visual interactive workbench dashboard in browser",
      options: {
        port: "Specify server port (default: 3200)",
        host: "Specify server host (default: localhost)",
        noOpen: "Do not automatically open the browser on start",
      },
    },
    create: {
      description: "Scaffold a new project from a template (supports :prefix for custom templates)",
      options: {
        force: "Force overwrite if target directory exists and is not empty",
      },
    },
    template: {
      description: "Manage project templates in workspace (list, create, delete)",
      commands: {
        list: "List all available project templates (builtin and workspace custom)",
        create: "Scaffold a custom template skeleton in .leoms/templates/",
        delete: "Remove a custom template from .leoms/templates/",
      },
    },
  },
  runner: {
    noRoot: "Cannot locate workspace root.",
    noTargetMatch: "\n✖ No matching {eco}project found in workspace.\n",
    targetResolution: "Target Resolution",
    noRulesSelected: "\nℹ No rules selected to execute.\n",
    autoDetectCwd: "Auto-detected current project context: {name} ({dir})",
    runningChecks: "\n🔍 Running {ruleCount} Check(s) on {targetCount} Project(s) [{badges}]\n",
    ruleException: 'Rule "{ruleId}" threw an exception: {message}',
    allPassed: "🎉 All {targetCount} project(s) passed all {ruleCount} check rule(s) without issues!\n",
    table: {
      level: "Level",
      rule: "Rule",
      target: "Project",
      issue: "Issue",
      remedy: "Remedy",
    },
    summary: {
      title: "──────── Check Summary ────────",
      failed: "❌ FAILED: Found {errors} blocking error(s) and {warnings} warning(s).",
      failedHint: "   Please resolve the blocking issues listed above.\n",
      passedWithWarnings: "⚠ PASSED WITH WARNINGS: Found {warnings} warning(s), 0 blocking errors.",
      passedWithWarningsHint: "   Review the warnings above to ensure changes are intended.\n",
    },
  },
  rules: {
    dist: {
      name: "Artifact Readiness",
      description: "Verify that projects declaring build targets have valid output files (dist / build)",
      missingMessage: "Project declares build scripts but missing output directory (dist / build).",
      missingRemedy: "Run `leoms build {project}` to compile artifacts",
    },
    git: {
      name: "Git Worktree Hygiene",
      description: "Verify that independent git repositories do not have uncommitted changes",
      dirtyMessage: "Working directory has {count} uncommitted file change(s) (dirty worktree).",
      dirtyRemedy: "Run `git add . && git commit` inside {dir}",
    },
    linkage: {
      name: "Dependency Linkage",
      description: "Verify internal dependencies follow workspace convention (workspace:^ for Node, SemVer for PHP)",
    },
    manifest: {
      name: "Manifest Hygiene",
      description: "Validate package.json and composer.json essential fields and formatting",
    },
    lockfile: {
      name: "Lockfile Integrity",
      description: "Check existence of lockfiles (pnpm-lock.yaml / composer.lock)",
      missingNodeMessage: "Missing Node dependency lockfile (pnpm-lock.yaml).",
      missingNodeRemedy: "Run `pnpm install` to generate lockfile",
      missingPhpMessage: "Missing composer.lock file (apps and delivery packages should lock versions).",
      missingPhpRemedy: "Run `composer update --lock` or `leoms i --php` to generate lockfile",
    },
    phantom: {
      name: "Phantom Dependency Scan",
      description: "Deep AST source code scan detecting undeclared phantom dependencies",
    },
    standalone: {
      name: "Standalone Portability",
      description: "Gatekeeper check: eliminate workspace protocol leaks, absolute paths, and ensure independent portability",
    },
    upstream: {
      name: "Upstream Dependency State",
      description: "Verify upstream internal packages do not have unreleased commits or uncommitted changes",
      aheadMessage: 'Dependent internal package "{dep}" has unreleased commits ({commits} commits ahead{dirty}).',
      aheadRemedy: 'Release and tag upstream package "{dep}" first (`leoms release {dep}`)',
    },
  },
};
