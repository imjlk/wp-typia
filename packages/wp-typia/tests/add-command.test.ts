import { afterAll, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type { ReadlinePrompt } from '@wp-typia/project-tools/cli-prompt';
import { CLI_DIAGNOSTIC_CODES } from '@wp-typia/project-tools/cli-diagnostics';
import {
  ADD_KIND_IDS,
  ADD_KIND_REGISTRY,
  supportsAddKindDryRun,
  type AddKindExecutionContext,
} from '../src/add-kind-registry';
import { WP_TYPIA_COMMAND_REGISTRY } from '../src/command-registry';
import {
  executeAddCommand,
  loadAddWorkspaceBlockOptions,
} from '../src/runtime-bridge';
import { ensureWorkspaceInstallMarker } from '../src/runtime-bridge-add-dry-run';
import {
  linkWorkspaceNodeModules,
  scaffoldOfficialWorkspace,
} from '../../wp-typia-project-tools/tests/helpers/scaffold-test-harness.js';

describe('wp-typia add command bridge', () => {
  const tempRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'wp-typia-add-bridge-'),
  );

  afterAll(() => {
    fs.rmSync(tempRoot, { force: true, recursive: true });
  });

  async function expectRejectedAddBlockTemplate(options: {
    code: string;
    interactive: boolean;
    message: string;
    prompt?: ReadlinePrompt;
    template: string;
  }) {
    let error: unknown;

    try {
      await executeAddCommand({
        cwd: tempRoot,
        emitOutput: false,
        flags: {
          template: options.template,
        },
        interactive: options.interactive,
        kind: 'block',
        name: 'promo-card',
        ...(options.prompt ? { prompt: options.prompt } : {}),
      });
    } catch (caughtError) {
      error = caughtError;
    }

    expect(error).toBeInstanceOf(Error);
    expect((error as { code?: string }).code).toBe(options.code);
    expect((error as Error).message).toContain(options.message);
  }

  test('defaults add block to the basic template in non-interactive runs', async () => {
    const projectDir = path.join(tempRoot, 'demo-add-basic-default');

    await scaffoldOfficialWorkspace(projectDir);
    linkWorkspaceNodeModules(projectDir);

    const payload = await executeAddCommand({
      cwd: projectDir,
      emitOutput: false,
      flags: {},
      interactive: false,
      kind: 'block',
      name: 'promo-card',
    });

    expect(payload?.title).toContain('Added workspace block');
    expect(payload?.summaryLines).toContain('Template family: basic');
    expect(
      fs.existsSync(
        path.join(projectDir, 'src', 'blocks', 'promo-card', 'block.json'),
      ),
    ).toBe(true);
    await expect(loadAddWorkspaceBlockOptions(projectDir)).resolves.toEqual([
      {
        description: 'src/blocks/promo-card/types.ts',
        name: 'promo-card',
        value: 'promo-card',
      },
    ]);
  });

  test('scaffolds interactivity block templates with typed store helpers', async () => {
    const projectDir = path.join(tempRoot, 'demo-add-interactivity-template');

    await scaffoldOfficialWorkspace(projectDir);
    linkWorkspaceNodeModules(projectDir);

    const payload = await executeAddCommand({
      cwd: projectDir,
      emitOutput: false,
      flags: {
        template: 'interactivity',
      },
      interactive: false,
      kind: 'block',
      name: 'signal-board',
    });

    const blockDir = path.join(projectDir, 'src', 'blocks', 'signal-board');
    const generatedInteractivityStore = fs.readFileSync(
      path.join(blockDir, 'interactivity-store.ts'),
      'utf8',
    );
    const generatedInteractivityRuntime = fs.readFileSync(
      path.join(blockDir, 'interactivity.ts'),
      'utf8',
    );
    const generatedSave = fs.readFileSync(
      path.join(blockDir, 'save.tsx'),
      'utf8',
    );

    expect(payload?.summaryLines).toContain('Template family: interactivity');
    expect(fs.existsSync(path.join(blockDir, 'interactivity-store.ts'))).toBe(
      true,
    );
    expect(fs.existsSync(path.join(blockDir, 'interactivity.ts'))).toBe(true);
    expect(generatedInteractivityStore).toContain(
      "type InteractivityCallable =\n  | ((...args: unknown[]) => unknown)\n  | ReturnType<typeof import('@wordpress/interactivity').withSyncEvent>;",
    );
    expect(generatedInteractivityStore).toContain(
      'type InteractivityActionHandler = InteractivityCallable;',
    );
    expect(generatedInteractivityStore).not.toContain(
      'type InteractivityCallable = Function;',
    );
    expect(generatedInteractivityStore).not.toContain(
      'type InteractivityActionHandler = Function;',
    );
    expect(generatedInteractivityStore).not.toContain('CallableFunction');
    expect(generatedInteractivityStore).toContain(
      'action<Key extends InteractivityMethodKey<Actions>>',
    );
    expect(generatedInteractivityStore).toContain(
      'callback<Key extends InteractivityMethodKey<Callbacks>>',
    );
    expect(generatedInteractivityStore).toContain(
      'context<Key extends InteractivityKey<Context>>',
    );
    expect(generatedInteractivityStore).toContain(
      'negate<Path extends string>(',
    );
    expect(generatedInteractivityStore).toContain(
      'export interface SignalBoardStoreActions',
    );
    expect(generatedInteractivityStore).toContain(
      'export interface SignalBoardStoreCallbacks {}',
    );
    expect(generatedInteractivityStore).toContain(
      'export const signalBoardStore = defineInteractivityStore({',
    );
    expect(generatedInteractivityRuntime).toContain(
      "import {\n  signalBoardStore,\n  type SignalBoardStoreActions,\n} from './interactivity-store';",
    );
    expect(generatedInteractivityRuntime).toContain(
      'const actions: SignalBoardStoreActions = {',
    );
    expect(generatedInteractivityRuntime).toContain(
      'store(signalBoardStore.namespace, {',
    );
    expect(generatedInteractivityRuntime).toContain(
      'callbacks: signalBoardStore.callbacks,',
    );
    expect(generatedSave).toContain(
      "const clickActionDirective = signalBoardStore.directive.action('handleClick');",
    );
    expect(generatedSave).toContain(
      'const visibilityHiddenDirective = signalBoardStore.directive.negate(',
    );
    expect(generatedSave).toContain(
      "signalBoardStore.directive.state('isVisible')",
    );
    expect(generatedSave).toContain(
      "const clampedClicksDirective = signalBoardStore.directive.state('clampedClicks');",
    );
    expect(generatedSave).toContain(
      "const resetActionDirective = signalBoardStore.directive.action('reset');",
    );
    expect(generatedSave).toContain(
      "'data-wp-interactive': signalBoardStore.directive.interactive,",
    );
    expect(generatedSave).toContain(
      'data-wp-bind--aria-valuenow={clampedClicksDirective}',
    );
    expect(generatedSave).toContain('data-wp-on--click={clickActionDirective}');
  }, 15_000);

  test('rejects invalid block template ids before workspace mutation', async () => {
    await expectRejectedAddBlockTemplate({
      code: CLI_DIAGNOSTIC_CODES.UNKNOWN_TEMPLATE,
      interactive: false,
      message:
        'Unknown add-block template "unknown". Expected one of: basic, interactivity, persistence, compound.',
      template: 'unknown',
    });
  });

  test('suggests close add block template ids before workspace mutation', async () => {
    const cases = [
      {
        message:
          'Unknown add-block template "basicc". Did you mean "basic"? Use `--template basic`',
        template: 'basicc',
      },
      {
        message:
          'Unknown add-block template "interactiv". Did you mean "interactivity"? Use `--template interactivity`',
        template: 'interactiv',
      },
    ];

    for (const { message, template } of cases) {
      await expectRejectedAddBlockTemplate({
        code: CLI_DIAGNOSTIC_CODES.UNKNOWN_TEMPLATE,
        interactive: false,
        message,
        template,
      });
    }
  });

  test('rejects query-loop add block templates with create-time guidance', async () => {
    await expectRejectedAddBlockTemplate({
      code: CLI_DIAGNOSTIC_CODES.INVALID_ARGUMENT,
      interactive: false,
      message:
        '`wp-typia add block --template query-loop` is not supported. Query Loop is a create-time `core/query` variation scaffold',
      template: 'query-loop',
    });
  });

  test('interactive add block rejects invalid explicit templates before prompting', async () => {
    const selectedPrompts: string[] = [];
    const prompt: ReadlinePrompt = {
      close() {},
      async select(message: string) {
        selectedPrompts.push(message);
        throw new Error('select() should not be called for invalid templates');
      },
      async text() {
        throw new Error('text() should not be called for invalid templates');
      },
    };

    await expectRejectedAddBlockTemplate({
      code: CLI_DIAGNOSTIC_CODES.UNKNOWN_TEMPLATE,
      interactive: true,
      message:
        'Unknown add-block template "unknown". Expected one of: basic, interactivity, persistence, compound.',
      prompt,
      template: 'unknown',
    });
    expect(selectedPrompts).toEqual([]);
  });

  test('passes binding-source target flags through the add bridge', async () => {
    const projectDir = path.join(tempRoot, 'demo-add-binding-target');

    await scaffoldOfficialWorkspace(projectDir);
    linkWorkspaceNodeModules(projectDir);
    await expect(
      executeAddCommand({
        cwd: projectDir,
        emitOutput: false,
        flags: {
          block: 'counter-card',
        },
        interactive: false,
        kind: 'binding-source',
        name: 'hero-data',
      }),
    ).rejects.toThrow(
      '`wp-typia add binding-source` requires --block and --attribute to be provided together.',
    );
    await executeAddCommand({
      cwd: projectDir,
      emitOutput: false,
      flags: {
        template: 'basic',
      },
      interactive: false,
      kind: 'block',
      name: 'counter-card',
    });

    const payload = await executeAddCommand({
      cwd: projectDir,
      emitOutput: false,
      flags: {
        attribute: 'headline',
        block: 'counter-card',
      },
      interactive: false,
      kind: 'binding-source',
      name: 'hero-data',
    });

    expect(payload?.summaryLines).toContain('Target: counter-card.headline');
    expect(
      fs.existsSync(
        path.join(projectDir, 'src', 'bindings', 'hero-data', 'server.php'),
      ),
    ).toBe(true);
    const blockJson = JSON.parse(
      fs.readFileSync(
        path.join(projectDir, 'src', 'blocks', 'counter-card', 'block.json'),
        'utf8',
      ),
    );
    expect(blockJson.attributes.headline).toEqual({ type: 'string' });
  }, 30_000);

  test('passes binding-source post-meta flags through the add bridge', async () => {
    const capturedOptions: Record<string, unknown>[] = [];
    const plan =
      await ADD_KIND_REGISTRY['binding-source'].prepareExecution({
        addRuntime: ({
          runAddBindingSourceCommand: async (options: Record<string, unknown>) => {
            capturedOptions.push(options);

            return {
              bindingSourceSlug: String(options.bindingSourceName),
              metaKey: '_demo_space_integration_state',
              metaPath: String(options.metaPath),
              postMetaSlug: String(options.postMetaName),
              postType: 'post',
              projectDir: String(options.cwd),
              schemaFile: 'src/post-meta/integration-state/meta.schema.json',
            };
          },
        } as unknown) as AddKindExecutionContext['addRuntime'],
        cwd: '/tmp/wp-typia-binding-post-meta',
        flags: {
          'from-post-meta': 'integration-state',
          'meta-path': 'status',
        },
        getOrCreatePrompt: async () => {
          throw new Error('prompt should not be used');
        },
        isInteractiveSession: false,
        name: 'integration-state-source',
        warnLine: () => {},
      });

    const result = await plan.execute('/tmp/wp-typia-binding-post-meta');

    expect(capturedOptions).toEqual([
      {
        bindingSourceName: 'integration-state-source',
        cwd: '/tmp/wp-typia-binding-post-meta',
        metaPath: 'status',
        postMetaName: 'integration-state',
      },
    ]);
    expect(plan.getValues(result)).toMatchObject({
      bindingSourceSlug: 'integration-state-source',
      metaPath: 'status',
      postMetaSlug: 'integration-state',
      schemaFile: 'src/post-meta/integration-state/meta.schema.json',
    });
  });

  test('passes block style and transform flags through the add bridge', async () => {
    const projectDir = path.join(tempRoot, 'demo-add-style-transform');

    await scaffoldOfficialWorkspace(projectDir);
    linkWorkspaceNodeModules(projectDir);
    await executeAddCommand({
      cwd: projectDir,
      emitOutput: false,
      flags: {
        template: 'basic',
      },
      interactive: false,
      kind: 'block',
      name: 'counter-card',
    });
    await expect(
      executeAddCommand({
        cwd: projectDir,
        emitOutput: false,
        flags: {},
        interactive: false,
        kind: 'style',
        name: 'callout-emphasis',
      }),
    ).rejects.toThrow('`wp-typia add style` requires --block <block-slug>.');

    const stylePayload = await executeAddCommand({
      cwd: projectDir,
      emitOutput: false,
      flags: {
        block: 'counter-card',
      },
      interactive: false,
      kind: 'style',
      name: 'callout-emphasis',
    });
    const transformPayload = await executeAddCommand({
      cwd: projectDir,
      emitOutput: false,
      flags: {
        from: 'core/quote',
        to: 'counter-card',
      },
      interactive: false,
      kind: 'transform',
      name: 'quote-to-counter',
    });

    expect(stylePayload?.summaryLines).toContain(
      'Block style: callout-emphasis',
    );
    expect(transformPayload?.summaryLines).toContain(
      'Block transform: quote-to-counter',
    );
    expect(transformPayload?.summaryLines).toContain('From: core/quote');
    expect(transformPayload?.summaryLines).toContain(
      'To: demo-space/counter-card',
    );
    expect(
      fs.existsSync(
        path.join(
          projectDir,
          'src',
          'blocks',
          'counter-card',
          'styles',
          'callout-emphasis.ts',
        ),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(
          projectDir,
          'src',
          'blocks',
          'counter-card',
          'transforms',
          'quote-to-counter.ts',
        ),
      ),
    ).toBe(true);
  }, 15_000);

  test('interactive add block can select a template when --template is omitted', async () => {
    const projectDir = path.join(
      tempRoot,
      'demo-add-interactive-template-prompt',
    );
    const selectedPrompts: string[] = [];
    const prompt: ReadlinePrompt = {
      close() {},
      async select<T extends string>(
        message: string,
        options: Array<{ value: T }>,
      ) {
        selectedPrompts.push(message);
        expect(options.map((option) => String(option.value))).toEqual([
          'basic',
          'interactivity',
          'persistence',
          'compound',
        ]);
        return 'compound' as T;
      },
      async text() {
        throw new Error('text() should not be called for template selection');
      },
    };

    await scaffoldOfficialWorkspace(projectDir);
    linkWorkspaceNodeModules(projectDir);

    const payload = await executeAddCommand({
      cwd: projectDir,
      emitOutput: false,
      flags: {},
      interactive: true,
      kind: 'block',
      name: 'faq-stack',
      prompt,
    });

    expect(selectedPrompts).toEqual(['Select a block template']);
    expect(payload?.summaryLines).toContain('Template family: compound');
    expect(
      fs.existsSync(
        path.join(projectDir, 'src', 'blocks', 'faq-stack', 'children.ts'),
      ),
    ).toBe(true);
  }, 30_000);

  test('interactive add block validates the missing name before prompting', async () => {
    const projectDir = path.join(tempRoot, 'demo-add-interactive-missing-name');
    const selectedPrompts: string[] = [];
    const prompt: ReadlinePrompt = {
      close() {},
      async select(message: string) {
        selectedPrompts.push(message);
        throw new Error('select() should not be called before name validation');
      },
      async text() {
        throw new Error('text() should not be called before name validation');
      },
    };

    await scaffoldOfficialWorkspace(projectDir);
    linkWorkspaceNodeModules(projectDir);

    await expect(
      executeAddCommand({
        cwd: projectDir,
        emitOutput: false,
        flags: {},
        interactive: true,
        kind: 'block',
        prompt,
      }),
    ).rejects.toThrow(
      '`wp-typia add block` requires <name>. Usage: wp-typia add block <name> [--template <basic|interactivity|persistence|compound>]',
    );
    expect(selectedPrompts).toEqual([]);
  }, 15_000);

  test('aligns missing kind help output with the bridge emitOutput context', async () => {
    const printedHumanLines: string[] = [];
    let humanError: unknown;

    try {
      await executeAddCommand({
        cwd: tempRoot,
        emitOutput: true,
        flags: {},
        interactive: false,
        printLine: (line) => printedHumanLines.push(line),
      });
    } catch (error) {
      humanError = error;
    }

    expect(humanError).toBeInstanceOf(Error);
    expect((humanError as { code?: string }).code).toBe(
      CLI_DIAGNOSTIC_CODES.MISSING_ARGUMENT,
    );
    expect(printedHumanLines.join('\n')).toContain('Usage:');
    expect(printedHumanLines.join('\n')).toContain('wp-typia add block <name>');

    const printedStructuredLines: string[] = [];
    let structuredError: unknown;

    try {
      await executeAddCommand({
        cwd: tempRoot,
        emitOutput: false,
        flags: {},
        interactive: false,
        printLine: (line) => printedStructuredLines.push(line),
      });
    } catch (error) {
      structuredError = error;
    }

    expect(structuredError).toBeInstanceOf(Error);
    expect((structuredError as { code?: string }).code).toBe(
      CLI_DIAGNOSTIC_CODES.MISSING_ARGUMENT,
    );
    expect(printedStructuredLines).toEqual([]);
  });

  test('named add commands validate the missing name before flag-specific errors', async () => {
    const projectDir = path.join(
      tempRoot,
      'demo-add-missing-name-validation-order',
    );

    await scaffoldOfficialWorkspace(projectDir);
    linkWorkspaceNodeModules(projectDir);

    const cases = [
      {
        flags: {
          block: 'counter-card',
        },
        kind: 'variation' as const,
        message:
          '`wp-typia add variation` requires <name>. Usage: wp-typia add variation <name> --block <block-slug>',
      },
      {
        flags: {},
        kind: 'style' as const,
        message:
          '`wp-typia add style` requires <name>. Usage: wp-typia add style <name> --block <block-slug>.',
      },
      {
        flags: {
          to: 'counter-card',
        },
        kind: 'transform' as const,
        message:
          '`wp-typia add transform` requires <name>. Usage: wp-typia add transform <name> --from <namespace/block> --to <block-slug|namespace/block-slug>.',
      },
      {
        flags: {
          position: 'after',
        },
        kind: 'hooked-block' as const,
        message:
          '`wp-typia add hooked-block` requires <block-slug>. Usage: wp-typia add hooked-block <block-slug> --anchor <anchor-block-name> --position <before|after|firstChild|lastChild>.',
      },
      {
        flags: {
          block: 'counter-card',
        },
        kind: 'binding-source' as const,
        message:
          '`wp-typia add binding-source` requires <name>. Usage: wp-typia add binding-source <name> [--block <block-slug|namespace/block-slug> --attribute <attribute>] [--from-post-meta <post-meta> --meta-path <field>].',
      },
    ] satisfies Array<{
      flags: Record<string, unknown>;
      kind:
        | 'binding-source'
        | 'hooked-block'
        | 'style'
        | 'transform'
        | 'variation';
      message: string;
    }>;

    for (const { flags, kind, message } of cases) {
      await expect(
        executeAddCommand({
          cwd: projectDir,
          emitOutput: false,
          flags,
          interactive: false,
          kind,
        }),
      ).rejects.toThrow(message);
    }
  }, 15_000);

  test('rest-resource missing-name guidance separates generated and manual modes', async () => {
    let error: unknown;

    try {
      await executeAddCommand({
        cwd: tempRoot,
        emitOutput: false,
        flags: {},
        interactive: false,
        kind: 'rest-resource',
      });
    } catch (caughtError) {
      error = caughtError;
    }

    expect(error).toBeInstanceOf(Error);
    expect((error as { code?: string }).code).toBe(
      CLI_DIAGNOSTIC_CODES.MISSING_ARGUMENT,
    );
    expect((error as Error).message).toContain(
      '`wp-typia add rest-resource` requires <name>. Usage:',
    );
    expect((error as Error).message).toContain(
      'Generated: wp-typia add rest-resource <name> [--namespace <vendor/v1>] [--methods <list,read,create,update,delete>] [--route-pattern <route-pattern>]',
    );
    expect((error as Error).message).toContain(
      'Manual: wp-typia add rest-resource <name> --manual [--namespace <vendor/v1>] [--method <GET|POST|PUT|PATCH|DELETE>] [--auth <public|authenticated|public-write-protected>] [--path <route-pattern>|--route-pattern <route-pattern>]',
    );
  });

  test('validates pattern scope and section-role flags before workspace resolution', async () => {
    const cases = [
      {
        code: CLI_DIAGNOSTIC_CODES.INVALID_ARGUMENT,
        flags: {
          scope: 'sidebar',
        },
        message:
          '`--scope` must be one of: full, section. Usage: wp-typia add pattern <name> --scope <full|section>.',
      },
      {
        code: CLI_DIAGNOSTIC_CODES.MISSING_ARGUMENT,
        flags: {
          scope: 'section',
        },
        message:
          '`wp-typia add pattern --scope section` requires --section-role <role> because section-scoped patterns need a typed catalog section role.',
      },
      {
        code: CLI_DIAGNOSTIC_CODES.INVALID_ARGUMENT,
        flags: {
          'section-role': 'hero',
        },
        message:
          '`--section-role` only applies with `--scope section`. Use `--scope section --section-role <role>` or omit `--section-role` for full patterns.',
      },
      {
        code: CLI_DIAGNOSTIC_CODES.INVALID_ARGUMENT,
        flags: {
          scope: 'section',
          'section-role': '1hero',
        },
        message:
          '`--section-role` must start with a lowercase letter and contain only lowercase letters, numbers, and hyphens. Section roles apply only with `--scope section`.',
      },
      {
        code: CLI_DIAGNOSTIC_CODES.INVALID_ARGUMENT,
        flags: {
          scope: 'section',
          'section-role': '!!!',
        },
        message:
          '`--section-role` must start with a lowercase letter and contain only lowercase letters, numbers, and hyphens. Section roles apply only with `--scope section`.',
      },
    ];

    for (const { code, flags, message } of cases) {
      let error: unknown;

      try {
        await executeAddCommand({
          cwd: path.join(tempRoot, 'outside-workspace'),
          emitOutput: false,
          flags,
          interactive: false,
          kind: 'pattern',
          name: 'hero-pattern',
        });
      } catch (caughtError) {
        error = caughtError;
      }

      expect(error).toBeInstanceOf(Error);
      expect((error as { code?: string }).code).toBe(code);
      expect((error as Error).message).toBe(message);
    }
  });

  test('every registered add kind currently advertises dry-run support', () => {
    expect(ADD_KIND_IDS.every((kind) => supportsAddKindDryRun(kind))).toBe(
      true,
    );
  });

  test('reports install marker setup context when every dry-run fallback fails', () => {
    const calls: string[] = [];
    const sourceMarker = path.join(tempRoot, 'demo-marker-source', '.pnp.cjs');
    const targetMarker = path.join(tempRoot, 'demo-marker-target', '.pnp.cjs');
    const fsAdapter = {
      copyFileSync() {
        calls.push('copy');
        throw new Error('copy denied');
      },
      linkSync() {
        calls.push('hard link');
        throw new Error('hard link denied');
      },
      symlinkSync() {
        calls.push('symlink');
        throw new Error('symlink denied');
      },
    } satisfies Parameters<typeof ensureWorkspaceInstallMarker>[0]['fsAdapter'];

    let error: unknown;

    try {
      ensureWorkspaceInstallMarker({
        fsAdapter,
        sourceMarker,
        targetMarker,
      });
    } catch (caughtError) {
      error = caughtError;
    }

    expect(error).toBeInstanceOf(Error);
    const message = (error as Error).message;
    expect(message).toContain('Failed to prepare dry-run install marker.');
    expect(message).toContain(`Source: ${sourceMarker}`);
    expect(message).toContain(`Target: ${targetMarker}`);
    expect(message).toContain('symlink: symlink denied');
    expect(message).toContain('hard link: hard link denied');
    expect(message).toContain('copy: copy denied');
    expect(calls).toEqual(['symlink', 'hard link', 'copy']);
  });

  test('keeps the canonical add kind order stable', () => {
    expect(ADD_KIND_IDS).toEqual([
      'admin-view',
      'block',
      'integration-env',
      'core-variation',
      'variation',
      'style',
      'transform',
      'pattern',
      'binding-source',
      'contract',
      'rest-resource',
      'post-meta',
      'ability',
      'ai-feature',
      'hooked-block',
      'editor-plugin',
    ]);
  });

  test('derives add subcommands from the canonical add-kind registry', () => {
    expect(
      WP_TYPIA_COMMAND_REGISTRY.find((command) => command.name === 'add')
        ?.subcommands,
    ).toEqual([...ADD_KIND_IDS]);
  });
});
