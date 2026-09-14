export interface LocaleSchema {
  cli: {
    name: string;
    description: string;
    version: string;
    help: string;
    helpCommand: string;
    lang: string;
    titles: {
      usage: string;
      arguments: string;
      options: string;
      globalOptions: string;
      commands: string;
    };
  };
  commands: {
    init: {
      description: string;
      options: {
        yes: string;
        config: string;
        setComposerHome: string;
        force: string;
      };
    };
    doctor: {
      description: string;
    };
    status: {
      description: string;
      options: {
        project: string;
        php: string;
        npm: string;
      };
    };
    list: {
      description: string;
      options: {
        php: string;
        npm: string;
      };
    };
    affected: {
      description: string;
      options: {
        base: string;
        plain: string;
        type: string;
        php: string;
        npm: string;
      };
    };
    install: {
      description: string;
      options: {
        project: string;
        php: string;
        npm: string;
      };
    };
    add: {
      description: string;
      options: {
        project: string;
        dev: string;
        php: string;
        npm: string;
      };
    };
    remove: {
      description: string;
      options: {
        project: string;
        php: string;
        npm: string;
      };
    };
    composer: {
      description: string;
    };
    build: {
      description: string;
      options: {
        project: string;
        all: string;
        affected: string;
        base: string;
        noDeps: string;
        php: string;
        npm: string;
      };
    };
    check: {
      description: string;
      options: {
        project: string;
        all: string;
        only: string;
        skip: string;
        listRules: string;
        plan: string;
        php: string;
        npm: string;
      };
      rulesCatalogTitle: string;
      rulesCatalogTable: {
        ruleId: string;
        category: string;
        name: string;
        default: string;
        description: string;
        yesFast: string;
        allInclude: string;
        no: string;
      };
      planTitle: string;
      planBatch: string;
    };
    plan: {
      description: string;
      options: {
        project: string;
      };
    };
    release: {
      description: string;
      options: {
        project: string;
        patch: string;
        minor: string;
        major: string;
        to: string;
        publish: string;
        noPush: string;
        noTag: string;
        noCascade: string;
        script: string;
        dryRun: string;
        force: string;
        message: string;
      };
    };
    publish: {
      description: string;
      options: {
        project: string;
        dryRun: string;
        tag: string;
        access: string;
        noBuild: string;
        force: string;
      };
    };
    deploy: {
      description: string;
      options: {
        project: string;
        env: string;
        skipCheck: string;
        skipBuild: string;
        script: string;
        dryRun: string;
      };
    };
    ui: {
      description: string;
      options: {
        port: string;
        host: string;
        noOpen: string;
      };
    };
  };
  runner: {
    noRoot: string;
    noTargetMatch: string;
    targetResolution: string;
    noRulesSelected: string;
    autoDetectCwd: string;
    runningChecks: string;
    ruleException: string;
    allPassed: string;
    table: {
      level: string;
      rule: string;
      target: string;
      issue: string;
      remedy: string;
    };
    summary: {
      title: string;
      failed: string;
      failedHint: string;
      passedWithWarnings: string;
      passedWithWarningsHint: string;
    };
  };
  rules: {
    dist: {
      name: string;
      description: string;
      missingMessage: string;
      missingRemedy: string;
    };
    git: {
      name: string;
      description: string;
      dirtyMessage: string;
      dirtyRemedy: string;
    };
    linkage: {
      name: string;
      description: string;
    };
    manifest: {
      name: string;
      description: string;
    };
    lockfile: {
      name: string;
      description: string;
      missingNodeMessage: string;
      missingNodeRemedy: string;
      missingPhpMessage: string;
      missingPhpRemedy: string;
    };
    phantom: {
      name: string;
      description: string;
    };
    standalone: {
      name: string;
      description: string;
    };
    upstream: {
      name: string;
      description: string;
      aheadMessage: string;
      aheadRemedy: string;
    };
  };
}

type DotPrefix<T extends string> = T extends "" ? "" : `.${T}`;
export type DotNestedKeys<T> = (
  T extends object
    ? {
        [K in Exclude<keyof T, symbol>]: `${K}${DotPrefix<DotNestedKeys<T[K]>>}`;
      }[Exclude<keyof T, symbol>]
    : ""
) extends infer D
  ? Extract<D, string>
  : never;

export type TranslationKey = DotNestedKeys<LocaleSchema>;
