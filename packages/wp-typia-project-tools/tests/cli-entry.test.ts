import { afterAll, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as http from "node:http";
import * as path from "node:path";
import { cleanupScaffoldTempRoot, createBlockExternalFixturePath, createBlockSubsetFixturePath, createScaffoldTempRoot, entryPath, getCommandErrorMessage, runCapturedCli, runCli, scaffoldOfficialWorkspace, templateLayerAmbiguousFixturePath, templateLayerFixturePath } from "./helpers/scaffold-test-harness.js";
import { CLI_DIAGNOSTIC_CODE_METADATA, CLI_DIAGNOSTIC_CODES, createCliCommandError, createCliDiagnosticCodeError, getCliDiagnosticCodeMetadata, serializeCliDiagnosticError } from "../src/runtime/cli-diagnostics.js";
import { formatHelpText, getDoctorChecks, getNextSteps, getOptionalOnboarding, runScaffoldFlow } from "../src/runtime/cli-core.js";
import { assertValidEditorPluginSlot } from "../src/runtime/cli-add-shared.js";
import { resolveNonEmptyNormalizedBlockSlug, resolveValidatedPhpPrefix } from "../src/runtime/scaffold-identifiers.js";
import { collectScaffoldAnswers } from "../src/runtime/scaffold.js";
import { getQuickStartWorkflowNote } from "../src/runtime/scaffold-onboarding.js";

describe("@wp-typia/project-tools scaffold CLI flow", () => {
  const tempRoot = createScaffoldTempRoot("wp-typia-scaffold-cli-");

  afterAll(() => {
    cleanupScaffoldTempRoot(tempRoot);
  });

  async function startNotFoundRegistry(): Promise<{
    close: () => Promise<void>;
    url: string;
  }> {
    const server = http.createServer((_request, response) => {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "not_found" }));
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected test npm registry to listen on a numeric port.");
    }

    return {
      close: () =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => {
            if (error) {
              reject(error);
              return;
            }
            resolve();
          });
        }),
      url: `http://127.0.0.1:${address.port}`,
    };
  }

  type StructuredCliFailurePayload = {
    error: {
      code: string;
      command?: string;
      detailLines?: string[];
      kind: string;
      message: string;
      name: string;
      summary?: string;
      tag: string;
    };
    ok: false;
  };

  function parseStructuredCliFailure(output: string): StructuredCliFailurePayload {
    for (let startIndex = output.indexOf("{"); startIndex !== -1; startIndex = output.indexOf("{", startIndex + 1)) {
      let depth = 0;
      let escaped = false;
      let inString = false;

      for (let index = startIndex; index < output.length; index += 1) {
        const character = output[index];

        if (escaped) {
          escaped = false;
          continue;
        }
        if (character === "\\") {
          escaped = true;
          continue;
        }
        if (character === "\"") {
          inString = !inString;
          continue;
        }
        if (inString) {
          continue;
        }
        if (character === "{") {
          depth += 1;
          continue;
        }
        if (character !== "}") {
          continue;
        }

        depth -= 1;
        if (depth !== 0) {
          continue;
        }

        try {
          const parsed = JSON.parse(
            output.slice(startIndex, index + 1)
          ) as StructuredCliFailurePayload;
          if (parsed.ok === false && typeof parsed.error?.code === "string") {
            return parsed;
          }
        } catch {}

        break;
      }
    }

    throw new Error(`Expected a structured CLI failure payload in output: ${output}`);
  }

  function readStructuredCliFailure(
    command: "bun" | "node",
    args: string[],
    options: Parameters<typeof runCli>[2] = {}
  ): StructuredCliFailurePayload {
    const output = getCommandErrorMessage(() =>
      runCli(command, args, {
        stdio: "pipe",
        ...options,
      })
    );

    return parseStructuredCliFailure(output);
  }

  function catchDiagnosticCodeError(callback: () => unknown): Error & { code?: string } {
    try {
      callback();
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      return error as Error & { code?: string };
    }

    throw new Error("Expected callback to throw.");
  }

test("CLI diagnostics do not classify unknown template variants as missing templates", () => {
  const diagnostic = serializeCliDiagnosticError(
    createCliCommandError({
      command: "create",
      error: new Error('Unknown template variant "hero". Expected one of: standard'),
    }),
  );

  expect(diagnostic.code).toBe("invalid-argument");
});

test("CLI diagnostics preserve explicit throw-site codes without message inference", () => {
  const diagnostic = serializeCliDiagnosticError(
    createCliCommandError({
      command: "create",
      error: createCliDiagnosticCodeError(
        CLI_DIAGNOSTIC_CODES.MISSING_ARGUMENT,
        "Opaque scaffold preflight failure.",
      ),
    }),
  );

  expect(diagnostic.code).toBe("missing-argument");
  expect(diagnostic.message).toContain("Opaque scaffold preflight failure.");
});

test("scaffold identifier validation failures carry explicit diagnostic codes", () => {
  const invalidPrefix = catchDiagnosticCodeError(() =>
    resolveValidatedPhpPrefix("123 invalid")
  );
  expect(invalidPrefix.code).toBe(CLI_DIAGNOSTIC_CODES.INVALID_ARGUMENT);
  expect(invalidPrefix.message).toContain(
    "PHP prefix: Use letters, numbers, and underscores only"
  );

  const missingSlug = catchDiagnosticCodeError(() =>
    resolveNonEmptyNormalizedBlockSlug({
      input: "   ",
      label: "Block name",
      usage: "wp-typia add block <name>",
    })
  );
  expect(missingSlug.code).toBe(CLI_DIAGNOSTIC_CODES.MISSING_ARGUMENT);
  expect(missingSlug.message).toBe(
    "Block name is required. Use `wp-typia add block <name>`."
  );

  const emptyNormalizedSlug = catchDiagnosticCodeError(() =>
    resolveNonEmptyNormalizedBlockSlug({
      input: "!!!",
      label: "Block name",
      usage: "wp-typia add block <name>",
    })
  );
  expect(emptyNormalizedSlug.code).toBe(CLI_DIAGNOSTIC_CODES.INVALID_ARGUMENT);
  expect(emptyNormalizedSlug.message).toContain(
    'Block name "!!!" normalizes to an empty slug.'
  );
});

test("CLI diagnostic metadata covers every stable code", () => {
  const codes = Object.values(CLI_DIAGNOSTIC_CODES).sort();

  expect(Object.keys(CLI_DIAGNOSTIC_CODE_METADATA).sort()).toEqual(codes);
  for (const code of codes) {
    const metadata = getCliDiagnosticCodeMetadata(code);
    expect(metadata.cause.length).toBeGreaterThan(0);
    expect(metadata.recovery.length).toBeGreaterThan(0);
  }
});

test("node and bun entries keep structured diagnostic envelopes stable", () => {
  for (const command of ["node", "bun"] as const) {
    const payload = readStructuredCliFailure(command, [
      entryPath,
      "create",
      "--format",
      "json",
    ]);

    expect(payload.ok).toBe(false);
    expect(payload.error.code).toBe("missing-argument");
    expect(payload.error.command).toBe("create");
    expect(payload.error.kind).toBe("command-execution");
    expect(payload.error.name).toBe("CliDiagnosticError");
    expect(payload.error.summary).toBe(
      "Unable to complete the requested create workflow."
    );
    expect(payload.error.tag).toBe("CommandExecutionError");
    expect(payload.error.detailLines).toContain(
      "`wp-typia create` requires <project-dir>."
    );
  }
});

test("structured diagnostic codes cover representative CLI command failures", () => {
  expect(
    readStructuredCliFailure("node", [
      entryPath,
      "create",
      "--format",
      "json",
    ]).error.code
  ).toBe("missing-argument");

  expect(
    readStructuredCliFailure("node", [
      entryPath,
      "add",
      "block",
      "--format",
      "json",
    ]).error.code
  ).toBe("missing-argument");

  expect(
    readStructuredCliFailure("node", [
      entryPath,
      "sync",
      "legacy",
      "--format",
      "json",
    ]).error.code
  ).toBe("invalid-command");

  const invalidInitDir = path.join(tempRoot, "invalid-init-package-json");
  fs.mkdirSync(invalidInitDir, { recursive: true });
  fs.writeFileSync(path.join(invalidInitDir, "package.json"), "{", "utf8");
  expect(
    readStructuredCliFailure(
      "node",
      [entryPath, "init", "--format", "json"],
      {
        cwd: invalidInitDir,
      }
    ).error.code
  ).toBe("invalid-argument");

  const unwritableDoctorDir = path.join(tempRoot, "doctor-unwritable-cwd");
  fs.mkdirSync(unwritableDoctorDir, { recursive: true });
  fs.chmodSync(unwritableDoctorDir, 0o555);
  try {
    const payload = readStructuredCliFailure(
      "node",
      [entryPath, "doctor", "--format", "json"],
      {
        cwd: unwritableDoctorDir,
      }
    );

    expect(payload.error.code).toBe("doctor-check-failed");
    expect(payload.error.kind).toBe("command-execution");
    expect(payload.error.tag).toBe("CommandExecutionError");
  } finally {
    fs.chmodSync(unwritableDoctorDir, 0o755);
  }
});

test("editor plugin slot validation rejects inherited object keys", () => {
  expect(assertValidEditorPluginSlot("PluginSidebar")).toBe("sidebar");
  expect(assertValidEditorPluginSlot("PluginDocumentSettingPanel")).toBe(
    "document-setting-panel"
  );
  expect(() => assertValidEditorPluginSlot("toString")).toThrow(
    "Editor plugin slot must be one of:"
  );
});

test("runScaffoldFlow defaults persistence scaffolds to custom-table and authenticated in non-interactive mode", async () => {
  const projectInput = "demo-persistence-default";
  const flow = await runScaffoldFlow({
    cwd: tempRoot,
    noInstall: true,
    packageManager: "npm",
    projectInput,
    templateId: "persistence",
    yes: true,
  });

  const pluginBootstrap = fs.readFileSync(
    path.join(flow.projectDir, `${projectInput}.php`),
    "utf8"
  );

  expect(flow.result.variables.dataStorageMode).toBe("custom-table");
  expect(flow.result.variables.persistencePolicy).toBe("authenticated");
  expect(pluginBootstrap).toContain("custom-table");
  expect(flow.nextSteps).toEqual([
    `cd ${projectInput}`,
    "npm install --no-audit",
    "npm run dev",
  ]);
  expect(flow.optionalOnboarding.steps).toEqual(["npm run sync"]);
});

test("runScaffoldFlow accepts prompted persistence policy selections in interactive mode", async () => {
  const projectInput = "demo-persistence-prompted";
  const flow = await runScaffoldFlow({
    cwd: tempRoot,
    isInteractive: true,
    noInstall: true,
    packageManager: "npm",
    projectInput,
    promptText: async (_message, defaultValue) => defaultValue,
    selectDataStorage: async () => "post-meta",
    selectPersistencePolicy: async () => "public",
    selectWithTestPreset: async () => true,
    selectWithWpEnv: async () => false,
    templateId: "persistence",
  });

  const pluginBootstrap = fs.readFileSync(
    path.join(flow.projectDir, `${projectInput}.php`),
    "utf8"
  );
  const restPublicHelper = fs.readFileSync(
    path.join(flow.projectDir, "inc", "rest-public.php"),
    "utf8"
  );

  expect(flow.result.variables.dataStorageMode).toBe("post-meta");
  expect(flow.result.variables.persistencePolicy).toBe("public");
  expect(pluginBootstrap).toContain(
    "require_once __DIR__ . '/inc/rest-public.php';"
  );
  expect(restPublicHelper).toContain(
    "function demo_persistence_prompted_verify_public_write_token"
  );
  expect(fs.existsSync(path.join(flow.projectDir, ".wp-env.json"))).toBe(
    false
  );
  expect(fs.existsSync(path.join(flow.projectDir, ".wp-env.test.json"))).toBe(
    true
  );
  expect(flow.optionalOnboarding.steps).toEqual(["npm run sync"]);
});

test("interactive scaffold answers recover when the project name normalizes to an empty slug", async () => {
  const answers = await collectScaffoldAnswers({
    projectName: "!!!",
    promptText: async (message, defaultValue) => {
      if (message === "Block slug") {
        return "demo-recovered";
      }

      return defaultValue || "Recovered";
    },
    templateId: "basic",
  });

  expect(answers.slug).toBe("demo-recovered");
  expect(answers.phpPrefix).toBe("demo_recovered");
  expect(answers.textDomain).toBe("demo-recovered");
  expect(answers.title).toBe("Demo Recovered");
});

test("runScaffoldFlow avoids duplicate namespace segments without colliding with core wrapper classes", async () => {
  const projectInput = "demo-default-class";
  const flow = await runScaffoldFlow({
    cwd: tempRoot,
    noInstall: true,
    packageManager: "npm",
    projectInput,
    templateId: "basic",
    yes: true,
  });

  const blockJson = JSON.parse(
    fs.readFileSync(path.join(flow.projectDir, "src", "block.json"), "utf8")
  );
  const generatedEdit = fs.readFileSync(
    path.join(flow.projectDir, "src", "edit.tsx"),
    "utf8"
  );
  const generatedSave = fs.readFileSync(
    path.join(flow.projectDir, "src", "save.tsx"),
    "utf8"
  );
  const generatedStyle = fs.readFileSync(
    path.join(flow.projectDir, "src", "style.scss"),
    "utf8"
  );

  expect(blockJson.name).toBe("demo-default-class/demo-default-class");
  expect(generatedStyle).toContain(".wp-block-demo-default-class-block");
  expect(generatedStyle).not.toContain(
    ".wp-block-demo-default-class-demo-default-class"
  );
  expect(generatedStyle).not.toContain(".wp-block-demo-default-class {");
  expect(generatedEdit).toContain(
    "className: `wp-block-demo-default-class-block${isVisible ? '' : ' is-hidden'}`"
  );
  expect(generatedSave).toContain(
    "className: `wp-block-demo-default-class-block${isVisible ? '' : ' is-hidden'}`"
  );
  expect(generatedEdit).toContain(
    'className="wp-block-demo-default-class-block__content"'
  );
  expect(generatedSave).toContain(
    'className="wp-block-demo-default-class-block__content"'
  );
});

test("runScaffoldFlow keeps compound next steps minimal while surfacing optional sync guidance", async () => {
  const projectInput = "demo-compound-flow";
  const flow = await runScaffoldFlow({
    cwd: tempRoot,
    noInstall: true,
    packageManager: "npm",
    projectInput,
    templateId: "compound",
    yes: true,
  });

  expect(flow.nextSteps).toEqual([
    `cd ${projectInput}`,
    "npm install --no-audit",
    "npm run dev",
  ]);
  expect(flow.optionalOnboarding.steps).toEqual(["npm run sync"]);
  expect(flow.optionalOnboarding.note).toContain(
    "do not create migration history"
  );
});

test("runScaffoldFlow composes a built-in scaffold with an external layer package", async () => {
  const flow = await runScaffoldFlow({
    cwd: tempRoot,
    externalLayerSource: templateLayerFixturePath,
    noInstall: true,
    packageManager: "npm",
    projectInput: "demo-layered-basic",
    templateId: "basic",
    yes: true,
  });

  expect(flow.result.warnings).toContain(
    `Applied external layer "acme/basic-observability" from "${templateLayerFixturePath}".`
  );
  expect(
    fs.existsSync(path.join(flow.projectDir, "inc", "observability.php"))
  ).toBe(true);
  expect(
    fs.readFileSync(path.join(flow.projectDir, "src", "observability.ts"), "utf8")
  ).toContain("demo-layered-basic-observability");
});

test("runScaffoldFlow honors explicit external layer ids when a package exposes multiple public roots", async () => {
  const flow = await runScaffoldFlow({
    cwd: tempRoot,
    externalLayerId: "acme/beta",
    externalLayerSource: templateLayerAmbiguousFixturePath,
    noInstall: true,
    packageManager: "npm",
    projectInput: "demo-layered-beta",
    templateId: "basic",
    yes: true,
  });

  expect(flow.result.warnings).toContain(
    `Applied external layer "acme/beta" from "${templateLayerAmbiguousFixturePath}".`
  );
  expect(fs.readFileSync(path.join(flow.projectDir, "beta.txt"), "utf8")).toContain(
    "beta layer"
  );
});

test("runScaffoldFlow prompts for an external layer when multiple public roots are available", async () => {
  let promptedOptions: Array<{
    description?: string;
    extends: string[];
    id: string;
  }> = [];

  const flow = await runScaffoldFlow({
    cwd: tempRoot,
    externalLayerSource: templateLayerAmbiguousFixturePath,
    isInteractive: true,
    noInstall: true,
    packageManager: "npm",
    projectInput: "demo-layered-ambiguous-prompt",
    promptText: async (_message, defaultValue) => defaultValue,
    selectExternalLayerId: async (options) => {
      promptedOptions = options;
      return "acme/beta";
    },
    templateId: "basic",
  });

  expect(promptedOptions).toEqual([
    {
      description: "Alpha external layer",
      extends: ["acme/internal-base"],
      id: "acme/alpha",
    },
    {
      description: "Beta external layer",
      extends: ["acme/internal-base"],
      id: "acme/beta",
    },
  ]);
  expect(flow.result.warnings).toContain(
    `Applied external layer "acme/beta" from "${templateLayerAmbiguousFixturePath}".`
  );
  expect(
    fs.readFileSync(path.join(flow.projectDir, "base.txt"), "utf8")
  ).toContain("base external layer");
  expect(fs.readFileSync(path.join(flow.projectDir, "beta.txt"), "utf8")).toContain(
    "beta layer"
  );
});

test("runScaffoldFlow surfaces explicit trust warnings for executable external templates", async () => {
  const flow = await runScaffoldFlow({
    cwd: tempRoot,
    noInstall: true,
    packageManager: "npm",
    projectInput: "demo-external-template-warning",
    templateId: createBlockExternalFixturePath,
    yes: true,
  });

  expect(
    flow.result.warnings.some((warning) =>
      warning.includes(
        "External template configs execute trusted JavaScript during scaffolding."
      )
    )
  ).toBe(true);
});

test("optional onboarding derives sync steps from available custom-template scripts", () => {
  const onboarding = getOptionalOnboarding({
    availableScripts: ["sync-types", "sync-rest"],
    packageManager: "npm",
    templateId: "/tmp/custom-template",
  });

  expect(onboarding.steps).toEqual([
    "npm run sync-types",
    "npm run sync-rest",
  ]);
  expect(onboarding.note).toContain(
    "Run npm run sync-types then npm run sync-rest manually before build, typecheck"
  );
  expect(onboarding.note).toContain(
    "npm run sync-types -- --check verifies the current type-derived artifacts without rewriting them."
  );
  expect(onboarding.note).toContain("npx --yes wp-typia@");
  expect(onboarding.note).toContain("doctor");
  expect(onboarding.note).not.toContain("npm run sync -- --check");
});

test("optional onboarding avoids synthesized sync commands for custom templates without sync scripts", () => {
  const onboarding = getOptionalOnboarding({
    availableScripts: [],
    packageManager: "npm",
    templateId: "/tmp/custom-template",
  });

  expect(onboarding.steps).toEqual([]);
  expect(onboarding.note).toContain(
    "No optional sync command was detected for this custom template."
  );
  expect(onboarding.note).toContain("npx --yes wp-typia@");
  expect(onboarding.note).toContain("doctor");
  expect(onboarding.note).not.toContain("npm run sync");
  expect(onboarding.note).not.toContain("npm run sync-types");
});

test("quick-start guidance handles start-only templates without repeating the same command", () => {
  const note = getQuickStartWorkflowNote("npm", "/tmp/custom-template");

  expect(note).toContain("npm run start is the primary local entry point");
  expect(note).not.toContain("Use npm run start");
});

test("runScaffoldFlow rejects unsupported persistence policies", async () => {
  const projectInput = "demo-persistence-invalid-policy";

  await expect(
    runScaffoldFlow({
      cwd: tempRoot,
      noInstall: true,
      packageManager: "npm",
      projectInput,
      templateId: "persistence",
      persistencePolicy: "invalid",
      yes: true,
    })
  ).rejects.toThrow(
    'Unsupported persistence policy "invalid". Expected one of: authenticated, public'
  );
});

test("runScaffoldFlow rejects persistence-only create flags for non-persistence templates", async () => {
  await expect(
    runScaffoldFlow({
      cwd: tempRoot,
      dataStorageMode: "custom-table",
      noInstall: true,
      packageManager: "npm",
      projectInput: "demo-basic-invalid-persistence-flags",
      templateId: "basic",
      yes: true,
    })
  ).rejects.toThrow(
    "`--data-storage` and `--persistence-policy` are supported only for `wp-typia create --template persistence` or `--template compound`."
  );
});

test("runScaffoldFlow rejects alternate render targets for non-persistence templates", async () => {
  await expect(
    runScaffoldFlow({
      alternateRenderTargets: "email,mjml",
      cwd: tempRoot,
      noInstall: true,
      packageManager: "npm",
      projectInput: "demo-basic-invalid-alternate-render-targets",
      templateId: "basic",
      yes: true,
    })
  ).rejects.toThrow(
    "`--alternate-render-targets` is supported only for `wp-typia create --template persistence` or persistence-enabled `--template compound` scaffolds."
  );
});

test("runScaffoldFlow accepts compound InnerBlocks presets for compound scaffolds", async () => {
  const projectInput = "demo-compound-horizontal";
  const flow = await runScaffoldFlow({
    cwd: tempRoot,
    innerBlocksPreset: "horizontal",
    noInstall: true,
    packageManager: "npm",
    projectInput,
    templateId: "compound",
    yes: true,
  });

  const parentChildren = fs.readFileSync(
    path.join(flow.projectDir, "src", "blocks", projectInput, "children.ts"),
    "utf8",
  );

  expect(flow.result.variables.compoundInnerBlocksPreset).toBe("horizontal");
  expect(parentChildren).toContain("ROOT_INNER_BLOCKS_PRESET_ID = 'horizontal'");
  expect(parentChildren).toContain("directInsert: true");
  expect(parentChildren).toContain("orientation: 'horizontal'");
});

test("runScaffoldFlow applies locked-structure presets to compound scaffolds", async () => {
  const projectInput = "demo-compound-locked-structure";
  const flow = await runScaffoldFlow({
    cwd: tempRoot,
    innerBlocksPreset: "locked-structure",
    noInstall: true,
    packageManager: "npm",
    projectInput,
    templateId: "compound",
    yes: true,
  });

  const parentChildren = fs.readFileSync(
    path.join(flow.projectDir, "src", "blocks", projectInput, "children.ts"),
    "utf8",
  );

  expect(flow.result.variables.compoundInnerBlocksPreset).toBe("locked-structure");
  expect(parentChildren).toContain("ROOT_INNER_BLOCKS_PRESET_ID = 'locked-structure'");
  expect(parentChildren).toContain("templateLock: 'all'");
  expect(parentChildren).toContain("directInsert: false");
});

test("runScaffoldFlow rejects InnerBlocks presets for non-compound templates", async () => {
  await expect(
    runScaffoldFlow({
      cwd: tempRoot,
      innerBlocksPreset: "horizontal",
      noInstall: true,
      packageManager: "npm",
      projectInput: "demo-basic-invalid-inner-blocks-preset",
      templateId: "basic",
      yes: true,
    }),
  ).rejects.toThrow(
    "`--inner-blocks-preset` is supported only for `wp-typia create --template compound`.",
  );
});

test("runScaffoldFlow rejects compound alternate render targets without persistence flags", async () => {
  await expect(
    runScaffoldFlow({
      alternateRenderTargets: "plain-text",
      cwd: tempRoot,
      noInstall: true,
      packageManager: "npm",
      projectInput: "demo-compound-invalid-alternate-render-targets",
      templateId: "compound",
      yes: true,
    })
  ).rejects.toThrow(
    "`--alternate-render-targets` on `wp-typia create --template compound` requires the persistence-enabled server render path. Add `--data-storage <post-meta|custom-table>` or `--persistence-policy <authenticated|public>` first."
  );
});

test("runScaffoldFlow rejects built-in variant flags before template rendering", async () => {
  await expect(
    runScaffoldFlow({
      cwd: tempRoot,
      noInstall: true,
      packageManager: "npm",
      projectInput: "demo-basic-invalid-variant",
      templateId: "basic",
      variant: "hero",
      yes: true,
    })
  ).rejects.toThrow(
    '--variant is only supported for official external template configs. Received variant "hero" for built-in template "basic".'
  );
});

test("runScaffoldFlow warns about awkward project directory names", async () => {
  const projectInput = "my cool block!";
  const flow = await runScaffoldFlow({
    cwd: tempRoot,
    noInstall: true,
    packageManager: "npm",
    projectInput,
    templateId: "basic",
    yes: true,
  });

  expect(flow.result.warnings).toContain(
    'Project directory "my cool block!" contains spaces. The generated next-step commands will be quoted, but a simple kebab-case directory name is usually easier to use with shells and downstream tooling.'
  );
  expect(flow.result.warnings).toContain(
    'Project directory "my cool block!" contains shell-sensitive characters (!). Prefer letters, numbers, ".", "_" and "-" when possible.'
  );
  expect(flow.nextSteps[0]).toBe(`cd 'my cool block!'`);
});

test("runScaffoldFlow carries query-loop post type overrides into the generated variation scaffold", async () => {
  const projectInput = "demo-query-loop";
  const flow = await runScaffoldFlow({
    cwd: tempRoot,
    noInstall: true,
    packageManager: "npm",
    projectInput,
    queryPostType: "book",
    templateId: "query-loop",
    yes: true,
  });

  const variationSource = fs.readFileSync(
    path.join(flow.projectDir, "src", "index.ts"),
    "utf8",
  );

  expect(flow.result.variables.queryPostType).toBe("book");
  expect(flow.nextSteps).toEqual([
    `cd ${projectInput}`,
    "npm install --no-audit",
    "npm run dev",
  ]);
  expect(flow.optionalOnboarding.steps).toEqual([]);
  expect(variationSource).toMatch(/postType:\s*["']book["']/);
  expect(variationSource).toMatch(
    /registerBlockVariation\('core\/query', queryLoopVariation\);/,
  );
});

test("runScaffoldFlow warns when query-loop-only flags are passed to other templates", async () => {
  const flow = await runScaffoldFlow({
    cwd: tempRoot,
    noInstall: true,
    packageManager: "npm",
    projectInput: "demo-basic-ignored-query-post-type",
    queryPostType: "book",
    templateId: "basic",
    yes: true,
  });

  expect(flow.result.warnings).toContain(
    '`--query-post-type` only applies to `wp-typia create --template query-loop`, which scaffolds a create-time `core/query` variation instead of a standalone block. "basic" will ignore "book".'
  );
});

test("runScaffoldFlow explains invalid query post type input with the original value", async () => {
  await expect(
    runScaffoldFlow({
      cwd: tempRoot,
      noInstall: true,
      packageManager: "npm",
      projectInput: "demo-invalid-query-post-type",
      queryPostType: "Books!",
      templateId: "query-loop",
      yes: true,
    })
  ).rejects.toThrow(
    'Query post type "Books!" normalizes to "books!", which is invalid. Use lowercase, 1-20 chars, and only a-z, 0-9, "_" or "-".'
  );
});

test("runScaffoldFlow dry-run previews scaffold output without writing the target directory", async () => {
  const projectInput = "demo-dry-run-plan";
  const targetDir = path.join(tempRoot, projectInput);
  const flow = await runScaffoldFlow({
    cwd: tempRoot,
    dryRun: true,
    packageManager: "npm",
    projectInput,
    templateId: "basic",
    yes: true,
  });

  expect(flow.dryRun).toBe(true);
  expect(flow.plan?.files).toContain("package.json");
  expect(flow.plan?.files).toContain("src/block.json");
  expect(flow.plan?.dependencyInstall).toBe("would-install");
  expect(flow.result.templateId).toBe("basic");
  expect(fs.existsSync(targetDir)).toBe(false);
});

test("runScaffoldFlow applies the plugin-qa profile to the official workspace template", async () => {
  const projectInput = "demo-plugin-qa-profile";
  const flow = await runScaffoldFlow({
    cwd: tempRoot,
    noInstall: true,
    packageManager: "npm",
    profile: "plugin-qa",
    projectInput,
    templateId: "workspace",
    yes: true,
  });

  const packageJson = JSON.parse(
    fs.readFileSync(path.join(flow.projectDir, "package.json"), "utf8")
  ) as {
    devDependencies: Record<string, string>;
    scripts: Record<string, string>;
  };

  expect(flow.result.templateId).toBe("@wp-typia/create-workspace-template");
  expect(fs.existsSync(path.join(flow.projectDir, ".wp-env.json"))).toBe(true);
  expect(fs.existsSync(path.join(flow.projectDir, ".env.example"))).toBe(true);
  expect(
    fs.existsSync(
      path.join(
        flow.projectDir,
        "scripts",
        "integration-smoke",
        "local-smoke.mjs"
      )
    )
  ).toBe(true);
  expect(packageJson.devDependencies["@wordpress/env"]).toBe("^11.2.0");
  expect(packageJson.scripts["wp-env:start"]).toBe("wp-env start");
  expect(packageJson.scripts["smoke:local-smoke"]).toBe(
    "node scripts/integration-smoke/local-smoke.mjs"
  );
  expect(packageJson.scripts["release:zip"]).toBe(
    "npm run sync-rest:package && npm run build && wp-scripts plugin-zip"
  );
  expect(packageJson.scripts["release:zip:check"]).toBe(
    "npm run sync-rest:package:check && npm run build"
  );
  expect(packageJson.scripts["qa:check"]).toBe(
    "npm run wp-typia:doctor:workspace && npm run release:zip:check"
  );
});

test("runScaffoldFlow rejects plugin-qa profile outside the official workspace template", async () => {
  await expect(
    runScaffoldFlow({
      cwd: tempRoot,
      noInstall: true,
      packageManager: "npm",
      profile: "plugin-qa",
      projectInput: "demo-plugin-qa-basic",
      templateId: "basic",
      yes: true,
    })
  ).rejects.toThrow("supports only the official workspace template");
});

test("runScaffoldFlow rejects removed built-in template ids", async () => {
  await expect(
    runScaffoldFlow({
      cwd: tempRoot,
      noInstall: true,
      packageManager: "npm",
      projectInput: "demo-removed-template",
      templateId: "data",
      yes: true,
    })
  ).rejects.toThrow(
    'Built-in template "data" was removed. Use --template persistence --persistence-policy public instead.'
  );
});

test("runScaffoldFlow rejects mistyped built-in template ids before external lookup noise", async () => {
  await expect(
    runScaffoldFlow({
      cwd: tempRoot,
      noInstall: true,
      packageManager: "npm",
      projectInput: "demo-mistyped-template",
      templateId: "basicc",
      yes: true,
    })
  ).rejects.toThrow(
    'Unknown template "basicc". Did you mean "basic"? Use `--template basic` for the built-in scaffold'
  );
});

test("runScaffoldFlow reports missing npm templates before prompt fallback", async () => {
  const registry = await startNotFoundRegistry();
  const originalRegistry = process.env.NPM_CONFIG_REGISTRY;

  try {
    process.env.NPM_CONFIG_REGISTRY = registry.url;
    await expect(
      runScaffoldFlow({
        cwd: tempRoot,
        noInstall: true,
        packageManager: "npm",
        projectInput: "demo-missing-npm-template",
        templateId: "nonexistent",
      })
    ).rejects.toThrow(
      'Unknown template "nonexistent". Expected one of: basic, interactivity, persistence, compound, query-loop, workspace.'
    );
  } finally {
    if (originalRegistry === undefined) {
      delete process.env.NPM_CONFIG_REGISTRY;
    } else {
      process.env.NPM_CONFIG_REGISTRY = originalRegistry;
    }
    await registry.close();
  }
});

test("runScaffoldFlow rejects external layers for non-built-in templates", async () => {
  await expect(
    runScaffoldFlow({
      cwd: tempRoot,
      externalLayerSource: templateLayerFixturePath,
      noInstall: true,
      packageManager: "npm",
      projectInput: "demo-external-layer-on-custom-template",
      templateId: createBlockSubsetFixturePath,
      yes: true,
    })
  ).rejects.toThrow(
    "External template layers currently compose only with built-in templates"
  );
});

test("runScaffoldFlow rejects external layer ids without a layer source", async () => {
  await expect(
    runScaffoldFlow({
      cwd: tempRoot,
      externalLayerId: "acme/basic-observability",
      noInstall: true,
      packageManager: "npm",
      projectInput: "demo-layer-id-only",
      templateId: "basic",
      yes: true,
    })
  ).rejects.toThrow(
    "externalLayerId requires externalLayerSource when composing built-in template layers."
  );
});

test("runScaffoldFlow rejects missing local external layer paths before template resolution", async () => {
  const missingLayerPath = "./missing-template-layer";

  await expect(
    runScaffoldFlow({
      cwd: tempRoot,
      externalLayerSource: missingLayerPath,
      noInstall: true,
      packageManager: "npm",
      projectInput: "demo-missing-local-external-layer",
      templateId: "basic",
      yes: true,
    })
  ).rejects.toThrow(
    `\`--external-layer-source\` path does not exist: ${path.resolve(tempRoot, missingLayerPath)}.`
  );
});

test("runScaffoldFlow keeps multi-layer external packages fail-fast outside interactive mode", async () => {
  await expect(
    runScaffoldFlow({
      cwd: tempRoot,
      externalLayerSource: templateLayerAmbiguousFixturePath,
      noInstall: true,
      packageManager: "npm",
      projectInput: "demo-layered-ambiguous-noninteractive",
      templateId: "basic",
      yes: true,
    })
  ).rejects.toThrow(
    "External layer package defines multiple selectable layers (acme/internal-base, acme/alpha, acme/beta). Pass an explicit externalLayerId or rerun through the interactive CLI selector."
  );
});

test("formatHelpText keeps migration UI flags out of external template usage", () => {
  const helpText = formatHelpText();
  const usageLines = helpText
    .split("\n")
    .filter((line) => line.startsWith("  wp-typia "));
  const externalPathLine = usageLines.find((line) =>
    line.includes("./path|github:owner/repo/path[#ref]>")
  );
  const externalPackageLine = usageLines.find((line) =>
    line.includes("<npm-package>")
  );

  expect(externalPathLine).toBeDefined();
  expect(externalPathLine).not.toContain("--with-migration-ui");
  expect(externalPathLine).not.toContain("--external-layer-source");
  expect(externalPackageLine).toBeDefined();
  expect(externalPackageLine).not.toContain("--with-migration-ui");
  expect(externalPackageLine).not.toContain("--external-layer-source");
  expect(helpText).toContain("--alternate-render-targets");
  expect(helpText).toContain("--inner-blocks-preset");
  expect(helpText).toContain("--template workspace");
  expect(helpText).toContain("--profile <plugin-qa>");
  expect(helpText).toContain("--external-layer-source");
  expect(helpText).toContain("--external-layer-id");
  expect(helpText).toContain("@wp-typia/create-workspace-template");
  expect(helpText).toContain("WP_TYPIA_ASCII=1 forces ASCII status markers");
  expect(helpText).toContain("non-empty NO_COLOR requests ASCII-safe markers");
  expect(helpText).toContain("`query-loop` is create-only.");
  expect(helpText).toContain("wp-typia add admin-view <name>");
  expect(helpText).toContain("src/admin-views/");
  expect(helpText).toContain("@wp-typia/dataviews");
  expect(helpText).toContain("opt-in dependencies");
  expect(helpText).toContain("wp-typia add integration-env <name>");
  expect(helpText).toContain("scripts/integration-smoke/");
  expect(helpText).toContain("release:zip");
  expect(helpText).not.toContain("Public installs currently gate");
  expect(helpText).toContain("wp-typia add ai-feature <name>");
  expect(helpText).toContain(
    "wp-typia add ai-feature <name> [--namespace <vendor/v1>]"
  );
  expect(helpText).toContain("wp-typia add editor-plugin <name>");
  expect(helpText).toContain(
    "wp-typia add editor-plugin <name> [--slot <sidebar|document-setting-panel>]"
  );
  expect(helpText).toContain("wp-typia add rest-resource <name>");
  expect(helpText).toContain("wp-typia add post-meta <name>");
  expect(helpText).toContain("[--tags <tag,...>] [--tag <tag>...]");
  expect(helpText).toContain('pass `--catalog-title "Hero Photo"`');
  expect(helpText).toContain(
    "pass `--tags hero,landing` for a comma-separated tag list"
  );
  expect(helpText).toContain("--methods <method[,method...]>");
  expect(helpText).toContain("src/ai-features/");
  expect(helpText).toContain("inc/ai-features/");
  expect(helpText).toContain("src/rest/");
  expect(helpText).toContain("inc/rest/");
  expect(helpText).toContain("src/post-meta/");
  expect(helpText).toContain("inc/post-meta/");
  expect(helpText).toContain("src/editor-plugins/");
});

test("cli-core barrel preserves doctor helper exports", () => {
  expect(typeof getDoctorChecks).toBe("function");
});

test("getNextSteps quotes project paths with spaces", () => {
  expect(
    getNextSteps({
      noInstall: true,
      packageManager: "bun",
      projectDir: "/tmp/demo project",
      projectInput: "demo project",
      templateId: "basic",
    })
  ).toEqual(["cd 'demo project'", "bun install", "bun run dev"]);
  expect(
    getNextSteps({
      noInstall: false,
      packageManager: "bun",
      projectDir: "/tmp/-demo",
      projectInput: "-demo",
      templateId: "basic",
    })
  ).toEqual(["cd '-demo'", "bun run dev"]);
});

test("runScaffoldFlow does not prompt for migration UI on external templates", async () => {
  let promptedForMigrationUi = false;

  const flow = await runScaffoldFlow({
    cwd: tempRoot,
    isInteractive: true,
    noInstall: true,
    packageManager: "npm",
    projectInput: "demo-external-no-migration-ui-prompt",
    promptText: async (_message, defaultValue) => defaultValue,
    withMigrationUi: true,
    selectWithMigrationUi: async () => {
      promptedForMigrationUi = true;
      return true;
    },
    templateId: createBlockSubsetFixturePath,
  });

  expect(promptedForMigrationUi).toBe(false);
  expect(flow.result.variables.needsMigration).toBe("{{needsMigration}}");
  expect(flow.result.warnings).toContain(
    `\`--with-migration-ui\` was ignored for "${createBlockSubsetFixturePath}". Migration UI currently scaffolds built-in templates and the official \`--template workspace\` flow; external templates still need to opt into that surface explicitly.`
  );
});

test("node entry exposes templates and doctor commands", () => {
  const templatesOutput = runCli("node", [entryPath, "templates", "list"]);
  const doctorOutput = runCli("node", [entryPath, "doctor", "--format", "json"]);

  expect(templatesOutput).toContain("basic");
  expect(templatesOutput).toContain("interactivity");
  expect(templatesOutput).toContain("persistence");
  expect(templatesOutput).toContain("compound");
  expect(templatesOutput).toContain("workspace");
  expect(templatesOutput).not.toContain("@wp-typia/create-workspace-template");
  expect(templatesOutput).not.toContain("advanced");
  expect(templatesOutput).not.toContain("full");
  expect(doctorOutput).toContain('"label": "Bun"');
  expect(doctorOutput).toContain('"label": "Template basic"');
});

test("node entry supports the explicit create command", () => {
  const targetDir = path.join(tempRoot, "demo-node-create-command");

  const output = runCli("node", [
    entryPath,
    "create",
    targetDir,
    "--template",
    "basic",
    "--package-manager",
    "npm",
    "--yes",
    "--no-install",
  ]);

  expect(fs.existsSync(path.join(targetDir, "package.json"))).toBe(true);
  expect(fs.existsSync(path.join(targetDir, "src", "block.json"))).toBe(true);
  expect(output).toContain("Verify and sync (optional):");
  expect(output).toContain("npx --yes wp-typia@");
  expect(output).toContain("doctor");
});

test("node entry supports dry-run create previews without writing files", () => {
  const targetDir = path.join(tempRoot, "demo-node-create-dry-run");
  const output = runCli("node", [
    entryPath,
    "create",
    targetDir,
    "--template",
    "basic",
    "--package-manager",
    "npm",
    "--dry-run",
  ]);

  expect(output).toContain("Dry run");
  expect(output).toContain(`Project directory: ${targetDir}`);
  expect(output).toContain("Planned files");
  expect(output).toContain("write package.json");
  expect(fs.existsSync(targetDir)).toBe(false);
});

test("node entry rejects unknown create templates before prompt fallback", async () => {
  const targetDir = path.join(tempRoot, "demo-node-create-unknown-template");
  let errorMessage = "";

  errorMessage = getCommandErrorMessage(() =>
    runCli(
      "node",
      [
        entryPath,
        "create",
        targetDir,
        "--template",
        "bad template",
        "--package-manager",
        "npm",
        "--no-install",
        "--format",
        "json",
      ],
      {
        stdio: "pipe",
      }
    )
  );

  expect(errorMessage).toContain('"code": "unknown-template"');
  expect(errorMessage).toContain('Unknown template \\"bad template\\". Expected one of:');
  expect(errorMessage).toContain("Run `wp-typia templates list`");
  expect(errorMessage).not.toContain("Failed to fetch npm template metadata");
  expect(errorMessage).not.toContain("Interactive answers require a promptText callback");
});

test("node entry fails early for sync when scaffold dependencies are missing", () => {
  const targetDir = path.join(tempRoot, "demo-node-sync-no-install");

  runCli("node", [
    entryPath,
    "create",
    targetDir,
    "--template",
    "basic",
    "--package-manager",
    "npm",
    "--yes",
    "--no-install",
  ]);

  const errorMessage = getCommandErrorMessage(() =>
    runCli("node", [entryPath, "sync"], {
      cwd: targetDir,
      stdio: "pipe",
    })
  );

  expect(errorMessage).toContain("npm install");
  expect(errorMessage).toContain("wp-typia sync");
  expect(errorMessage).toContain("tsx");
});

test("node entry supports external layer flags for built-in create scaffolds", () => {
  const targetDir = path.join(tempRoot, "demo-node-create-layered");

  runCli("node", [
    entryPath,
    "create",
    targetDir,
    "--template",
    "basic",
    "--external-layer-source",
    templateLayerFixturePath,
    "--package-manager",
    "npm",
    "--yes",
    "--no-install",
  ]);

  expect(fs.existsSync(path.join(targetDir, "inc", "observability.php"))).toBe(true);
  expect(fs.readFileSync(path.join(targetDir, "src", "observability.ts"), "utf8")).toContain(
    "demo-node-create-layered-observability"
  );
});

test("node entry exposes fallback help and rejects the removed migrations alias", () => {
  const helpOutput = runCli("node", [entryPath, "--help"]);
  const doctorHelpOutput = runCli("node", [entryPath, "doctor", "--help"]);
  const doctorHelpAliasOutput = runCli("node", [entryPath, "help", "doctor"]);
  const errorMessage = getCommandErrorMessage(() =>
    runCli("node", [entryPath, "migrations", "init"], { stdio: "pipe" })
  );

  expect(helpOutput).toContain("Runtime: Node fallback");
  expect(helpOutput).toContain("Scaffold a new wp-typia project.");
  expect(helpOutput).toContain("Run migration workflows.");
  expect(helpOutput).toContain(
    "Inspect or sync schema-driven MCP metadata."
  );
  expect(doctorHelpOutput).toContain(
    "Usage: wp-typia doctor [--format json] [--workspace-only]"
  );
  expect(doctorHelpOutput).toContain("Supported flags:");
  expect(doctorHelpOutput).toContain("--format");
  expect(doctorHelpOutput).toContain("--workspace-only");
  expect(doctorHelpOutput).toContain("machine-readable doctor check output");
  expect(doctorHelpAliasOutput).toContain(
    "Usage: wp-typia doctor [--format json] [--workspace-only]"
  );
  expect(errorMessage).toContain(
    "`wp-typia migrations` was removed in favor of `wp-typia migrate`."
  );
});

test("bun entry exposes templates and doctor commands", () => {
  const templatesOutput = runCli("bun", [entryPath, "templates", "list"]);
  const doctorOutput = runCli("bun", [entryPath, "doctor", "--format", "json"]);

  expect(templatesOutput).toContain("basic");
  expect(templatesOutput).toContain("interactivity");
  expect(templatesOutput).toContain("persistence");
  expect(templatesOutput).toContain("compound");
  expect(templatesOutput).toContain("workspace");
  expect(templatesOutput).not.toContain("@wp-typia/create-workspace-template");
  expect(templatesOutput).not.toContain("advanced");
  expect(templatesOutput).not.toContain("full");
  expect(doctorOutput).toContain('"label": "Bun"');
  expect(doctorOutput).toContain('"label": "Template basic"');
});

test("bun entry exposes fallback help and rejects the removed migrations alias", () => {
  const helpOutput = runCli("bun", [entryPath, "--help"]);
  const doctorHelpOutput = runCli("bun", [entryPath, "doctor", "--help"]);
  const errorMessage = getCommandErrorMessage(() =>
    runCli("bun", [entryPath, "migrations", "init"], { stdio: "pipe" })
  );

  expect(helpOutput).toContain("Runtime: Node fallback");
  expect(helpOutput).toContain("Scaffold a new wp-typia project.");
  expect(helpOutput).toContain("Run migration workflows.");
  expect(helpOutput).toContain(
    "Inspect or sync schema-driven MCP metadata."
  );
  expect(doctorHelpOutput).toContain(
    "Usage: wp-typia doctor [--format json] [--workspace-only]"
  );
  expect(doctorHelpOutput).toContain("Supported flags:");
  expect(doctorHelpOutput).toContain("--format");
  expect(doctorHelpOutput).toContain("--workspace-only");
  expect(doctorHelpOutput).toContain("machine-readable doctor check output");
  expect(errorMessage).toContain(
    "`wp-typia migrations` was removed in favor of `wp-typia migrate`."
  );
});

test(
  "bun entry translates kebab-case identifier flags while scaffolding",
  () => {
    const targetDir = path.join(tempRoot, "demo-bun-entry");

    runCli(
      "bun",
      [
        entryPath,
        targetDir,
        "--template",
        "persistence",
        "--namespace",
        "experiments",
        "--text-domain",
        "demo-bun-entry-text",
        "--php-prefix",
        "demo_bun_entry_php",
        "--yes",
        "--no-install",
        "--package-manager",
        "bun",
      ],
      {
        stdio: "inherit",
      }
    );

    const packageJson = JSON.parse(
      fs.readFileSync(path.join(targetDir, "package.json"), "utf8")
    );
    const blockJson = JSON.parse(
      fs.readFileSync(path.join(targetDir, "src", "block.json"), "utf8")
    );
    const pluginBootstrap = fs.readFileSync(
      path.join(targetDir, "demo-bun-entry.php"),
      "utf8"
    );

    expect(packageJson.packageManager).toBe("bun@1.3.11");
    expect(blockJson.name).toBe("experiments/demo-bun-entry");
    expect(blockJson.textdomain).toBe("demo-bun-entry-text");
    expect(pluginBootstrap).toContain("Text Domain:       demo-bun-entry-text");
    expect(pluginBootstrap).toContain(
      "function demo_bun_entry_php_get_counter"
    );
    expect(fs.existsSync(path.join(targetDir, "README.md"))).toBe(true);
  },
  { timeout: 15_000 }
);

test("node entry defaults --yes scaffolds to npm when package manager is omitted", () => {
  const targetDir = path.join(tempRoot, "demo-default-pm");

  runCli(
    "node",
    [
      entryPath,
      targetDir,
      "--template",
      "basic",
      "--yes",
      "--no-install",
    ],
    {
      stdio: "pipe",
    }
  );

  const packageJson = JSON.parse(
    fs.readFileSync(path.join(targetDir, "package.json"), "utf8")
  );

  expect(packageJson.packageManager).toBeUndefined();
});

test("node entry rejects persistence-only flags for basic create scaffolds", () => {
  const errorMessage = getCommandErrorMessage(() =>
    runCli(
      "node",
      [
        entryPath,
        "demo-basic-invalid-persistence",
        "--template",
        "basic",
        "--data-storage",
        "custom-table",
        "--yes",
        "--no-install",
      ],
      {
        stdio: "pipe",
      }
    )
  );

  expect(errorMessage).toContain(
    "`--data-storage` and `--persistence-policy` are supported only for `wp-typia create --template persistence` or `--template compound`."
  );
});

test("node entry rejects built-in variant flags before scaffolding", () => {
  const errorMessage = getCommandErrorMessage(() =>
    runCli(
      "node",
      [
        entryPath,
        "demo-basic-invalid-variant",
        "--template",
        "basic",
        "--variant",
        "hero",
        "--yes",
        "--no-install",
      ],
      {
        stdio: "pipe",
      }
    )
  );

  expect(errorMessage).toContain(
    '--variant is only supported for official external template configs. Received variant "hero" for built-in template "basic".'
  );
});

test("node entry rejects create . as an explicit project directory", () => {
  const errorMessage = getCommandErrorMessage(() =>
    runCli("node", [entryPath, "create", ".", "--template", "basic", "--yes"], {
      stdio: "pipe",
    })
  );

  expect(errorMessage).toContain(
    "`wp-typia create` requires a new project directory. Use an explicit child directory instead of `.` or `..`."
  );
});

test("node entry rejects create ./ as an explicit project directory", () => {
  const errorMessage = getCommandErrorMessage(() =>
    runCli("node", [entryPath, "create", "./", "--template", "basic", "--yes"], {
      stdio: "pipe",
    })
  );

  expect(errorMessage).toContain(
    "`wp-typia create` requires a new project directory. Use an explicit child directory instead of `.` or `..`."
  );
});

test("node entry warns about awkward project directory names", () => {
  const targetDir = path.join(tempRoot, "node cool block!");
  const result = runCapturedCli(
    "node",
    [entryPath, "create", targetDir, "--template", "basic", "--yes", "--no-install"],
    {
      stdio: "pipe",
    }
  );

  expect(result.status).toBe(0);
  expect(result.stderr).toContain('Project directory "node cool block!" contains spaces.');
  expect(result.stderr).toContain(
    'Project directory "node cool block!" contains shell-sensitive characters (!).'
  );
});

test("node entry rejects non-empty target directories with actionable guidance", () => {
  const targetDir = path.join(tempRoot, "node-non-empty-target");
  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(path.join(targetDir, "existing.txt"), "already here\n", "utf8");

  const errorMessage = getCommandErrorMessage(() =>
    runCli(
      "node",
      [entryPath, "create", targetDir, "--template", "basic", "--yes", "--no-install"],
      {
        stdio: "pipe",
      }
    )
  );

  expect(errorMessage).toContain(`Target directory is not empty: ${targetDir}.`);
  expect(errorMessage).toContain("Choose a new project directory");
  expect(errorMessage).toContain("empty this directory before rerunning the scaffold");
});

test("node entry rejects add block before workspace dependencies are installed", async () => {
  const targetDir = path.join(tempRoot, "node-workspace-add-without-install");

  await scaffoldOfficialWorkspace(targetDir);

  const errorMessage = getCommandErrorMessage(() =>
    runCli(
      "node",
      [entryPath, "add", "block", "counter-card", "--template", "basic"],
      {
        cwd: targetDir,
        stdio: "pipe",
      }
    )
  );

  expect(errorMessage).toContain("Workspace dependencies have not been installed yet.");
  expect(errorMessage).toContain("Run `npm install --no-audit` from the workspace root");
  expect(errorMessage).toContain("`wp-typia add block ...`");
});

test("node entry rejects unknown add-block templates before workspace dependency checks", async () => {
  const targetDir = path.join(tempRoot, "node-workspace-add-unknown-template");

  await scaffoldOfficialWorkspace(targetDir);

  const errorMessage = getCommandErrorMessage(() =>
    runCli(
      "node",
      [
        entryPath,
        "add",
        "block",
        "counter-card",
        "--template",
        "nonexistent",
        "--format",
        "json",
      ],
      {
        cwd: targetDir,
        stdio: "pipe",
      }
    )
  );

  expect(errorMessage).toContain('"code": "unknown-template"');
  expect(errorMessage).toContain('Unknown add-block template \\"nonexistent\\".');
  expect(errorMessage).toContain("Expected one of: basic, interactivity, persistence, compound");
  expect(errorMessage).toContain("Run `wp-typia templates list`");
  expect(errorMessage).not.toContain("Workspace dependencies have not been installed yet.");
  expect(errorMessage).not.toContain("Interactive answers require a promptText callback");
});

test("node entry suggests close add-block template ids before workspace dependency checks", async () => {
  const targetDir = path.join(tempRoot, "node-workspace-add-template-suggestion");

  await scaffoldOfficialWorkspace(targetDir);

  const errorMessage = getCommandErrorMessage(() =>
    runCli(
      "node",
      [
        entryPath,
        "add",
        "block",
        "counter-card",
        "--template",
        "interactiv",
        "--format",
        "json",
      ],
      {
        cwd: targetDir,
        stdio: "pipe",
      }
    )
  );

  expect(errorMessage).toContain('"code": "unknown-template"');
  expect(errorMessage).toContain(
    'Unknown add-block template \\"interactiv\\". Did you mean \\"interactivity\\"? Use `--template interactivity`'
  );
  expect(errorMessage).not.toContain("Workspace dependencies have not been installed yet.");
});

test("node entry rejects missing values for identifier override flags", () => {
  expect(() => {
    runCli(
      "node",
      [
        entryPath,
        "demo-missing-namespace",
        "--template",
        "basic",
        "--namespace",
        "--yes",
        "--no-install",
        "--package-manager",
        "npm",
      ],
      {
        stdio: "pipe",
      }
    );
  }).toThrow();
});
});
