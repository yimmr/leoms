import type { LocaleSchema } from "./schema.js";

export const zh: LocaleSchema = {
  cli: {
    name: "leoms",
    description: "多语言、多独立 Git 仓库混合工作区资产协同与体检编排器",
    version: "输出当前版本号",
    help: "显示命令帮助信息",
    helpCommand: "显示指定命令的帮助信息",
    lang: "设置输出语言（支持: zh, en；默认: zh）",
    titles: {
      usage: "用法:",
      arguments: "参数:",
      options: "选项:",
      globalOptions: "全局选项:",
      commands: "命令:",
    },
  },
  commands: {
    init: {
      description: "初始化工作区脚手架（配置 pnpm workspace、Composer 路径及标准工程骨架）",
      options: {
        yes: "跳过交互式提问，全部采用默认配置",
        config: "生成可选的 leoms.yml 配置文件模版",
        setComposerHome: "持久化写入环境变量 COMPOSER_HOME 到 shell 配置（如 ~/.bashrc）",
        force: "强制覆盖已存在的配置文件",
      },
    },
    doctor: {
      description: "深度体检 Node、pnpm、PHP、Composer 及 Git 环境和工作区配置完整性",
    },
    status: {
      description: "工作区资产全局大盘看板（透视 Git 分支/未提交变更、版本状态、依赖拓扑与风险）",
      options: {
        project: "仅查看指定项目的资产状态详情与上下游关系",
        php: "仅针对 PHP (Composer) 包与依赖",
        npm: "仅针对 Node (npm) 包与依赖",
      },
    },
    list: {
      description: "扫描并分类展示工作区内检测到的所有项目与包",
      options: {
        php: "仅列出 PHP (Composer) 包",
        npm: "仅列出 Node (npm) 包",
      },
    },
    affected: {
      description: "基于 Git 改动和拓扑有向无环图 (DAG)，差量分析直接改动项目及受波及的下游项目",
      options: {
        base: "Git 对比基准分支或 commit（默认: main）",
        plain: "仅输出受影响的项目名称列表（适用于 CI/CD 自动化流水线脚本）",
        type: "按波及影响类型过滤（all: 全部, direct: 直接改动, downstream: 间接下游）",
        php: "仅筛选受影响的 PHP (Composer) 项目",
        npm: "仅筛选受影响的 Node (npm) 项目",
      },
    },
    install: {
      description: "为全工作区或指定项目智能安装依赖（Node + PHP 双生态，根目录并行全装 / 隔离 COMPOSER_HOME）",
      options: {
        project: "目标项目名称或相对路径",
        php: "仅安装 PHP (Composer) 依赖",
        npm: "仅安装 Node (npm) 依赖",
      },
    },
    add: {
      description: "向项目添加外部或内部依赖（支持交互式选择生态与包；内部包默认按规范联动）",
      options: {
        project: "目标项目名称或相对路径",
        dev: "作为开发依赖 (devDependencies / require-dev) 保存",
        php: "指定添加 PHP (Composer) 依赖",
        npm: "指定添加 Node (npm) 依赖",
      },
    },
    remove: {
      description: "从项目中批量移除指定依赖并同步清理清单配置",
      options: {
        project: "目标项目名称或相对路径",
        php: "从 PHP (Composer) 依赖中移除",
        npm: "从 Node (npm) 依赖中移除",
      },
    },
    composer: {
      description: "透明 Composer 代理包装器（自动注入并隔离本工作区专属 COMPOSER_HOME）",
    },
    build: {
      description: "按拓扑依赖图 (DAG) 构建指定项目或受波及项目（防全量滥建，默认联动构建上游依赖包）",
      options: {
        project: "目标项目名称或相对路径",
        all: "显式全量构建工作区内的所有项目",
        affected: "仅构建受 Git 代码变动波及的项目",
        base: "差量波及分析的 Git 对比基准（默认: main）",
        noDeps: "跳过上游内部依赖包的构建，仅构建目标本身",
        php: "仅执行 PHP 构建/优化任务 (dump-autoload -o / 编译脚本)",
        npm: "仅执行 Node 构建任务 (pnpm run build)",
      },
    },
    check: {
      description: "可插拔健康与门禁体检（默认执行日常极速项；-a 包含全量；-i 指定单项）",
      options: {
        project: "指定待体检的目标项目名称或相对路径",
        all: "执行全量体检（包含源码 AST 幽灵依赖深度扫描等耗时规则）",
        only: "仅运行指定的检查规则（如 linkage, git, standalone, dist, phantom 等）",
        skip: "跳过指定的检查规则",
        listRules: "列出所有已注册的体检规则名称及其说明",
        plan: "计算并预览按拓扑依赖排序的发版预检计划",
        php: "仅检查 PHP (Composer) 相关包与依赖",
        npm: "仅检查 Node (npm) 相关包与依赖",
      },
      rulesCatalogTitle: "\n📋 leoms 已注册检查规则清单\n",
      rulesCatalogTable: {
        ruleId: "规则 ID",
        category: "类别",
        name: "规则名称",
        default: "默认执行",
        description: "规则说明",
        yesFast: "是 (极速)",
        allInclude: "--all 包含",
        no: "否",
      },
      planTitle: "\n📦 依赖拓扑发版演练计划 (DAG 拓扑排序):\n",
      planBatch: "批次 {step}: [{names}] (无上游依赖，可并行发布)",
    },
    plan: {
      description: "按有向无环图 (DAG) 计算并输出发布拓扑执行计划",
      options: {
        project: "目标项目名称或相对路径（默认检测当前目录项目）",
      },
    },
    release: {
      description: "多仓库一站式发版：全量门禁预检 -> 版本递增 -> 级联回写下游 -> 创建 Git Tag -> 推送多远端",
      options: {
        project: "目标发版项目名称或相对路径",
        patch: "升级补丁版本号（例如 0.1.0 -> 0.1.1）",
        minor: "升级次版本号（例如 0.1.0 -> 0.2.0）",
        major: "升级主版本号（例如 0.1.0 -> 1.0.0）",
        to: "显式指定目标发版版本号",
        publish: "发版成功后自动调用外部 Registry 制品投递",
        noPush: "仅在本地完成提交与打 Tag，不推送到远程 Git 仓库",
        noTag: "仅递增版本并提交代码，不创建 Git Tag",
        noCascade: "不向工作区内依赖此包的下游项目级联回写更新版本",
        script: "打 Tag 后执行的自定义发版后续脚本路径",
        dryRun: "演练发版流程，不实际修改任何文件或 Git 记录",
        force: "忽略未提交变更与安全警告，强制执行发版",
        message: "自定义 Git 提交说明信息",
      },
    },
    publish: {
      description: "制品投递与发布（自动剥离工作区协议发布到 npm Registry，或同步 Packagist）",
      options: {
        project: "目标发布项目名称或相对路径",
        dryRun: "模拟发布过程，不实际上传制品",
        tag: "npm dist-tag 标签（默认: latest）",
        access: "npm 包发布访问级别 (public / restricted)",
        noBuild: "跳过发布前的编译构建步骤",
        force: "强制发布（即使 package.json 标记了 private）",
      },
    },
    deploy: {
      description: "业务应用一键安全部署：离仓健康全量检查 -> 构建产物 -> 调用部署脚本",
      options: {
        project: "目标部署应用名称或相对路径",
        env: "目标部署环境（默认: production）",
        skipCheck: "跳过部署前置健康与离仓门禁检查（危险）",
        skipBuild: "跳过部署前的产物编译构建步骤",
        script: "显式指定部署脚本路径（覆盖 leoms.yml 中的 deploy.script）",
        dryRun: "模拟部署流程，不实际执行脚本",
      },
    },
    ui: {
      description: "启动可视化工作台控制面板并在浏览器中打开",
      options: {
        port: "指定服务监听端口（默认: 3200）",
        host: "指定服务监听主机地址（默认: localhost）",
        noOpen: "启动服务时不自动在浏览器中打开页面",
      },
    },
  },
  runner: {
    noRoot: "无法定位工作区根目录。",
    noTargetMatch: "\n✖ 工作区中未找到匹配的 {eco}项目。\n",
    targetResolution: "目标匹配",
    noRulesSelected: "\nℹ 没有匹配到任何需要执行的检查项 (No rules selected)。\n",
    autoDetectCwd: "自动识别当前项目上下文: {name} ({dir})",
    runningChecks: "\n🔍 正在对 {targetCount} 个目标项目执行 {ruleCount} 项检查规则 [{badges}]\n",
    ruleException: '规则 "{ruleId}" 执行抛出异常: {message}',
    allPassed: "🎉 全部 {targetCount} 个项目通过了全部 {ruleCount} 项检查规则，未发现问题！\n",
    table: {
      level: "级别",
      rule: "规则",
      target: "目标项目",
      issue: "诊断详情",
      remedy: "建议修复",
    },
    summary: {
      title: "──────── 体检汇总 ────────",
      failed: "❌ 检查未通过：发现 {errors} 个阻断性错误，{warnings} 个警告。",
      failedHint: "   请优先解决上述列表中的阻断性错误。\n",
      passedWithWarnings: "⚠ 检查通过（带警告）：发现 {warnings} 个警告，0 个阻断性错误。",
      passedWithWarningsHint: "   请确认上述警告是否属于预期变动。\n",
    },
  },
  rules: {
    dist: {
      name: "构建产物就绪度",
      description: "检查需要构建的项目是否已生成可用的输出产物（dist / build 目录）",
      missingMessage: "项目声明了构建任务，但缺少产物目录（dist / build）。",
      missingRemedy: "运行 `leoms build {project}` 生成构建产物",
    },
    git: {
      name: "Git 工作区洁净度",
      description: "检查独立 Git 仓库是否存在未提交的修改或未推送的提交",
      dirtyMessage: "工作区有 {count} 个未提交的文件变动 (dirty worktree)。",
      dirtyRemedy: "在 {dir} 下执行 `git add . && git commit` 提交代码",
    },
    linkage: {
      name: "依赖规范联动检查",
      description: "验证跨项目依赖是否遵循规范（Node 内部包使用 workspace:^，PHP 内部包使用规范 SemVer）",
    },
    manifest: {
      name: "清单文件规范性检查",
      description: "验证 package.json 和 composer.json 基础必填字段及格式有效性",
    },
    lockfile: {
      name: "Lockfile 锁定文件完整性",
      description: "检查项目与工作区的依赖锁定文件（pnpm-lock.yaml / composer.lock）是否存在",
      missingNodeMessage: "未找到 Node 依赖锁定文件 (pnpm-lock.yaml)。",
      missingNodeRemedy: "运行 `pnpm install` 生成锁定文件",
      missingPhpMessage: "未找到 composer.lock 文件（应用与交付项目应锁定具体版本）。",
      missingPhpRemedy: "运行 `composer update --lock` 或 `leoms i --php` 生成锁定文件",
    },
    phantom: {
      name: "幽灵依赖深度扫描",
      description: "深度遍历扫描源文件 import / require 语句，检测是否引用了未声明在清单中的幽灵依赖",
    },
    standalone: {
      name: "离仓独立自洽性检查",
      description: "针对交付发布与独立部署的终极门禁：彻底消除工作区软链协议残留、校验绝对路径硬编码、验证独立安装与启动契约",
    },
    upstream: {
      name: "上游依赖发版状态",
      description: "检查所依赖的内部底层公共包是否有未发版的超前提交或未打 Tag 的改动",
      aheadMessage: '依赖的内部包 "{dep}" 存在未发布的新提交 ({commits} commits ahead{dirty})。',
      aheadRemedy: '应先为上游包 "{dep}" 发版并打 Tag (`leoms release {dep}`)',
    },
  },
};
