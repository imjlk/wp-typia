import { afterAll, describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import packageJson from '../package.json';

import {
  buildCreateCompletionPayload,
  buildCreateDryRunPayload,
  type CreateProgressPayload as BridgeCreateProgressPayload,
  executeMigrateCommand,
  formatCreateProgressLine,
  buildMigrationCompletionPayload,
  printCompletionPayload,
} from '../src/runtime-bridge';
import {
  buildAddCompletionPayload,
  buildAddDryRunPayload,
  buildStructuredCompletionSuccessPayload,
  buildStructuredInitSuccessPayload,
  buildSyncDryRunPayload,
  type CreateProgressPayload as OutputCreateProgressPayload,
} from '../src/runtime-bridge-output';
import { buildCreateCompletionPayload as buildFocusedCreateCompletionPayload } from '../src/runtime-output/create';

type ExpectTrue<TValue extends true> = TValue;
type IsEqual<TLeft, TRight> =
  (<TValue>() => TValue extends TLeft ? 1 : 2) extends <
    TValue,
  >() => TValue extends TRight ? 1 : 2
    ? true
    : false;
type CreateProgressPayloadCompatibility = ExpectTrue<
  IsEqual<BridgeCreateProgressPayload, OutputCreateProgressPayload>
>;

const runtimeBridgeOutputTypeCompatibilityChecks = {
  createProgressPayload: true,
} satisfies {
  createProgressPayload: CreateProgressPayloadCompatibility;
};

const UNICODE_MARKER_OPTIONS = {
  env: {
    LANG: 'en_US.UTF-8',
  },
} as const;
const tempRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), 'wp-typia-completion-output-'),
);

function writeCompletionProjectFixture(options: {
  files?: string[];
  name: string;
}): string {
  const projectDir = path.join(tempRoot, options.name);
  fs.mkdirSync(projectDir, { recursive: true });
  fs.writeFileSync(
    path.join(projectDir, 'package.json'),
    `${JSON.stringify({ name: options.name }, null, 2)}\n`,
    'utf8',
  );
  for (const file of options.files ?? []) {
    fs.writeFileSync(path.join(projectDir, file), '', 'utf8');
  }
  return projectDir;
}

afterAll(() => {
  fs.rmSync(tempRoot, { force: true, recursive: true });
});

describe('runtime completion output helpers', () => {
  test('keeps create progress payload type single-sourced across bridge exports', () => {
    expect(runtimeBridgeOutputTypeCompatibilityChecks).toEqual({
      createProgressPayload: true,
    });
  });

  test('create completion payload preserves reviewable next steps and optional onboarding', () => {
    const payload = buildCreateCompletionPayload(
      {
        nextSteps: ['cd demo-block', 'npm install --no-audit', 'npm run dev'],
        optionalOnboarding: {
          note: 'Run npm run sync before your first commit if you edited types.',
          shortNote:
            'Skip npm run sync during normal npm run dev work. Re-run it before build, typecheck, or doctor when you want a reviewable refresh.',
          steps: ['npm run sync'],
        },
        packageManager: 'npm',
        projectDir: '/tmp/demo-block',
        result: {
          selectedVariant: 'hero',
          variables: {
            title: 'Demo Block',
          },
          warnings: ['This template enables optional migration UI.'],
        },
      },
      UNICODE_MARKER_OPTIONS,
    );

    expect(payload.title).toBe('✅ Created Demo Block in /tmp/demo-block');
    expect(payload.preambleLines).toEqual(['Template variant: hero']);
    expect(payload.warningLines).toEqual([
      'This template enables optional migration UI.',
    ]);
    expect(payload.nextSteps).toEqual([
      'cd demo-block',
      'npm install --no-audit',
      'npm run dev',
    ]);
    expect(payload.optionalTitle).toBe('Verify and sync (optional):');
    expect(payload.optionalLines).toEqual([
      `npx --yes wp-typia@${packageJson.version} doctor`,
      'npm run sync',
    ]);
    expect(payload.optionalNote).toContain(
      'Skip npm run sync during normal npm run dev work.',
    );
  });

  test('focused create output builder preserves the public facade payload shape', () => {
    const flow = {
      nextSteps: ['cd demo-block', 'npm install --no-audit', 'npm run dev'],
      optionalOnboarding: {
        note: 'Run npm run sync before your first commit if you edited types.',
        steps: ['npm run sync'],
      },
      packageManager: 'npm',
      projectDir: '/tmp/demo-block',
      result: {
        selectedVariant: 'hero',
        variables: {
          title: 'Demo Block',
        },
        warnings: ['This template enables optional migration UI.'],
      },
    };

    expect(buildFocusedCreateCompletionPayload(flow, UNICODE_MARKER_OPTIONS))
      .toEqual(buildCreateCompletionPayload(flow, UNICODE_MARKER_OPTIONS));
  });

  test('create completion payload keeps package-manager doctor commands stable', () => {
    const expectedDoctorCommands = {
      bun: `bunx wp-typia@${packageJson.version} doctor`,
      npm: `npx --yes wp-typia@${packageJson.version} doctor`,
      pnpm: `pnpm dlx wp-typia@${packageJson.version} doctor`,
      yarn: `yarn dlx wp-typia@${packageJson.version} doctor`,
    } as const;

    for (const [packageManager, expectedDoctorCommand] of Object.entries(
      expectedDoctorCommands,
    )) {
      const payload = buildCreateCompletionPayload({
        nextSteps: ['cd demo-block'],
        optionalOnboarding: {
          note: 'Run sync when needed.',
          steps: [],
        },
        packageManager,
        projectDir: '/tmp/demo-block',
        result: {
          variables: {
            title: 'Demo Block',
          },
          warnings: [],
        },
      });

      expect(payload.optionalLines?.[0]).toBe(expectedDoctorCommand);
    }
  });

  test('create completion payload normalizes recognizable package-manager metadata', () => {
    const payload = buildCreateCompletionPayload({
      nextSteps: ['cd demo-block'],
      optionalOnboarding: {
        note: 'Run sync when needed.',
        steps: [],
      },
      packageManager: 'corepack pnpm@9.12.3 workspace-root',
      projectDir: '/tmp/demo-block',
      result: {
        variables: {
          title: 'Demo Block',
        },
        warnings: [],
      },
    });

    expect(payload.optionalLines?.[0]).toBe(
      `pnpm dlx wp-typia@${packageJson.version} doctor`,
    );
  });

  test('create completion payload rejects unknown package managers clearly', () => {
    let error: Error | undefined;
    try {
      buildCreateCompletionPayload({
        nextSteps: ['cd demo-block'],
        optionalOnboarding: {
          note: 'Run sync when needed.',
          steps: [],
        },
        packageManager: 'deno',
        projectDir: '/tmp/demo-block',
        result: {
          variables: {
            title: 'Demo Block',
          },
          warnings: [],
        },
      });
    } catch (caught) {
      error = caught as Error;
    }

    expect(error).toBeInstanceOf(Error);
    expect((error as { code?: string } | undefined)?.code).toBe(
      'invalid-argument',
    );
    expect(error?.message).toContain('Unsupported package manager "deno"');
    expect(error?.message).toContain('Expected one of: bun, npm, pnpm, yarn');
  });

  test('completion printer keeps warning and next-step ordering stable', () => {
    const printed: string[] = [];
    const warned: string[] = [];

    printCompletionPayload(
      {
        nextSteps: ['cd demo-block', 'npm install --no-audit'],
        optionalLines: [
          `npx --yes wp-typia@${packageJson.version} doctor`,
          'npm run sync',
        ],
        optionalNote:
          'Skip npm run sync during normal npm run dev work. Re-run it before build, typecheck, or doctor when you want a reviewable refresh.',
        optionalTitle: 'Verify and sync (optional):',
        preambleLines: ['Template variant: hero'],
        summaryLines: ['Project directory: /tmp/demo-block'],
        title: '✅ Created Demo Block in /tmp/demo-block',
        warningLines: ['This template enables optional migration UI.'],
      },
      {
        markerOptions: UNICODE_MARKER_OPTIONS,
        printLine: (line) => printed.push(line),
        warnLine: (line) => warned.push(line),
      },
    );

    expect(warned).toEqual(['⚠️ This template enables optional migration UI.']);
    expect(printed).toEqual([
      'Template variant: hero',
      '\n✅ Created Demo Block in /tmp/demo-block',
      'Project directory: /tmp/demo-block',
      'Next steps:',
      '  cd demo-block',
      '  npm install --no-audit',
      '\nVerify and sync (optional):',
      `  npx --yes wp-typia@${packageJson.version} doctor`,
      '  npm run sync',
      'Note: Skip npm run sync during normal npm run dev work. Re-run it before build, typecheck, or doctor when you want a reviewable refresh.',
    ]);
  });

  test('completion printer keeps warnings on the same stream by default', () => {
    const printed: string[] = [];

    printCompletionPayload(
      {
        summaryLines: ['Project directory: /tmp/demo-block'],
        title: '✅ Created Demo Block in /tmp/demo-block',
        warningLines: ['This template enables optional migration UI.'],
      },
      {
        markerOptions: UNICODE_MARKER_OPTIONS,
        printLine: (line) => printed.push(line),
      },
    );

    expect(printed).toEqual([
      '⚠️ This template enables optional migration UI.',
      '\n✅ Created Demo Block in /tmp/demo-block',
      'Project directory: /tmp/demo-block',
    ]);
  });

  test('completion printer avoids a leading blank line when no preamble or warnings were emitted', () => {
    const printed: string[] = [];

    printCompletionPayload(
      {
        summaryLines: ['Project directory: /tmp/demo-block'],
        title: '✅ Created Demo Block in /tmp/demo-block',
      },
      {
        printLine: (line) => printed.push(line),
      },
    );

    expect(printed).toEqual([
      '✅ Created Demo Block in /tmp/demo-block',
      'Project directory: /tmp/demo-block',
    ]);
  });

  test('migration completion payload keeps rendered lines reviewable in order', () => {
    const payload = buildMigrationCompletionPayload(
      {
        command: 'plan',
        lines: [
          'Current migration version: v3',
          'Selected migration edge: v1 -> v3',
          'Next steps:',
          '  wp-typia migrate scaffold --from-migration-version v1',
        ],
      },
      UNICODE_MARKER_OPTIONS,
    );

    expect(payload.title).toBe('✅ Completed wp-typia migrate plan');
    expect(payload.summaryLines).toEqual([
      'Current migration version: v3',
      'Selected migration edge: v1 -> v3',
      'Next steps:',
      '  wp-typia migrate scaffold --from-migration-version v1',
    ]);
  });

  test('migrate help output uses the injected renderLine when provided', async () => {
    const lines: string[] = [];

    await executeMigrateCommand({
      cwd: tempRoot,
      flags: {},
      renderLine: (line) => {
        lines.push(line);
      },
    });

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('wp-typia migrate init');
  });

  test('migrate help output uses the injected printLine without console fallback', async () => {
    const originalLog = console.log;
    const lines: string[] = [];
    console.log = () => {
      throw new Error('migrate help should use the injected printLine');
    };

    try {
      await executeMigrateCommand({
        cwd: tempRoot,
        flags: {},
        printLine: (line) => {
          lines.push(line);
        },
      });
    } finally {
      console.log = originalLog;
    }

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('wp-typia migrate init');
  });

  test('create progress formatter keeps portable CLI status lines readable', () => {
    expect(
      formatCreateProgressLine(
        {
          detail: 'Copying scaffold files into the target project directory.',
          title: 'Generating project files',
        },
        UNICODE_MARKER_OPTIONS,
      ),
    ).toBe(
      '⏳ Generating project files: Copying scaffold files into the target project directory.',
    );
  });

  test('dry-run create payload summarizes the planned scaffold without next steps', () => {
    const payload = buildCreateDryRunPayload(
      {
        packageManager: 'npm',
        plan: {
          dependencyInstall: 'would-install',
          files: ['README.md', 'package.json', 'src/index.tsx'],
        },
        projectDir: '/tmp/demo-block',
        result: {
          selectedVariant: null,
          templateId: 'basic',
          variables: {
            title: 'Demo Block',
          },
          warnings: [],
        },
      },
      UNICODE_MARKER_OPTIONS,
    );

    expect(payload.title).toBe('🧪 Dry run for Demo Block at /tmp/demo-block');
    expect(payload.summaryLines).toEqual([
      'Project directory: /tmp/demo-block',
      'Template: basic',
      'Package manager: npm',
      'Dependency install: would run during a real scaffold',
    ]);
    expect(payload.optionalTitle).toBe('Planned files (3):');
    expect(payload.optionalLines).toEqual([
      'write README.md',
      'write package.json',
      'write src/index.tsx',
    ]);
    expect(payload.nextSteps).toBeUndefined();
    expect(payload.optionalNote).toContain('--dry-run');
  });

  test('dry-run create payload preserves the skipped-by-flag dependency wording', () => {
    const payload = buildCreateDryRunPayload(
      {
        packageManager: 'npm',
        plan: {
          dependencyInstall: 'skipped-by-flag',
          files: ['package.json'],
        },
        projectDir: '/tmp/demo-block',
        result: {
          selectedVariant: null,
          templateId: 'basic',
          variables: {
            title: 'Demo Block',
          },
          warnings: [],
        },
      },
      UNICODE_MARKER_OPTIONS,
    );

    expect(payload.summaryLines).toContain(
      'Dependency install: already skipped via --no-install',
    );
  });

  test('add completion payload now includes reviewable next steps and doctor guidance', () => {
    const payload = buildAddCompletionPayload(
      {
        kind: 'binding-source',
        packageManager: 'npm',
        projectDir: '/tmp/demo-workspace',
        values: {
          bindingSourceSlug: 'hero-data',
        },
      },
      UNICODE_MARKER_OPTIONS,
    );

    expect(payload.title).toBe('✅ Added binding source');
    expect(payload.summaryLines).toEqual([
      'Binding source: hero-data',
      'Project directory: /tmp/demo-workspace',
    ]);
    expect(payload.nextSteps).toEqual([
      'Review src/bindings/hero-data/server.php and src/bindings/hero-data/editor.ts.',
      'Run your workspace build or dev command to verify the binding source hooks and editor registration.',
    ]);
    expect(payload.optionalTitle).toBe('Verify workspace health (optional):');
    expect(payload.optionalLines).toEqual([
      `npx --yes wp-typia@${packageJson.version} doctor`,
    ]);
    expect(payload.optionalNote).toContain(
      'inventory and generated-artifact check',
    );
  });

  test('add completion payload infers Yarn PnP doctor guidance without an explicit package manager', () => {
    const projectDir = writeCompletionProjectFixture({
      files: ['.pnp.loader.mjs'],
      name: 'demo-yarn-pnp-workspace',
    });
    const payload = buildAddCompletionPayload(
      {
        kind: 'block',
        projectDir,
        values: {
          blockSlugs: 'promo-card',
          templateId: 'basic',
        },
      },
      UNICODE_MARKER_OPTIONS,
    );

    expect(payload.optionalLines).toEqual([
      `yarn dlx wp-typia@${packageJson.version} doctor`,
    ]);
  });

  test('dry-run add payload preserves the richer add completion guidance', () => {
    const payload = buildAddDryRunPayload(
      {
        completion: buildAddCompletionPayload(
          {
            kind: 'block',
            packageManager: 'npm',
            projectDir: '/tmp/demo-workspace',
            values: {
              blockSlugs: 'faq, faq-item',
              templateId: 'compound',
            },
          },
          UNICODE_MARKER_OPTIONS,
        ),
        fileOperations: ['write src/blocks/faq/block.json'],
      },
      UNICODE_MARKER_OPTIONS,
    );

    expect(payload.title).toBe('🧪 Dry run for workspace block');
    expect(payload.summaryLines).toEqual([
      'Blocks: faq, faq-item',
      'Template family: compound',
      'Project directory: /tmp/demo-workspace',
    ]);
    expect(payload.warningLines).toBeUndefined();
    expect(payload.optionalTitle).toBe('Planned workspace updates (1):');
    expect(payload.optionalLines).toEqual(['write src/blocks/faq/block.json']);
  });

  test('structured completion files include all dry-run file operations', () => {
    const payload = buildStructuredCompletionSuccessPayload('add', {
      optionalLines: [
        'write src/blocks/promo-card/block.json',
        'update scripts/block-config.ts',
        'delete src/blocks/old-card/block.json',
        `npx --yes wp-typia@${packageJson.version} doctor`,
      ],
      title: 'Dry run for workspace add command',
    });

    expect(payload.data.files).toEqual([
      'src/blocks/promo-card/block.json',
      'scripts/block-config.ts',
      'src/blocks/old-card/block.json',
    ]);
    expect(payload.data).not.toHaveProperty('title');
    expect(payload.data).not.toHaveProperty('summaryLines');
    expect(payload.data).not.toHaveProperty('nextSteps');
  });

  test('structured init success payload uses the standard CLI envelope', () => {
    const payload = buildStructuredInitSuccessPayload({
      commandMode: 'preview-only',
      detectedLayout: {
        blockNames: ['demo-space/promo-card'],
        description: 'Single block layout',
        kind: 'single-block',
      },
      generatedArtifacts: ['src/typia.manifest.json', 'src/typia.schema.json'],
      nextSteps: ['npm run sync -- --check', 'npm run typecheck'],
      notes: ['Preview only: no files were written.'],
      packageChanges: {
        addDevDependencies: [
          {
            action: 'add',
            name: '@wp-typia/project-tools',
            requiredValue: '^0.0.0-test',
          },
        ],
        scripts: [
          {
            action: 'add',
            name: 'sync',
            requiredValue: 'tsx scripts/sync-project.ts',
          },
        ],
      },
      packageManager: 'npm',
      plannedFiles: [
        {
          action: 'add',
          path: 'scripts/sync-project.ts',
          purpose: 'Project-level sync entrypoint',
        },
      ],
      projectDir: '/tmp/demo-workspace',
      projectName: 'demo-workspace',
      status: 'preview',
      summary: 'Preview the minimum retrofit surface.',
    });

    expect(payload.ok).toBe(true);
    expect(payload.data.command).toBe('init');
    expect(payload.data.mode).toBe('preview');
    expect(payload.data.projectDir).toBe('/tmp/demo-workspace');
    expect(payload.data.plan.commandMode).toBe('preview-only');
    expect(payload.data.files).toEqual([
      'scripts/sync-project.ts',
      'src/typia.manifest.json',
      'src/typia.schema.json',
    ]);
    expect(payload.data.completion.nextSteps).toEqual([
      'npm run sync -- --check',
      'npm run typecheck',
    ]);
    expect(payload.data.completion.title).toContain('Retrofit init plan');
    expect(payload.data).not.toHaveProperty('nextSteps');
    expect(payload.data).not.toHaveProperty('warnings');
    expect(payload.data).not.toHaveProperty('title');
  });

  test('dry-run sync payload previews the generated sync commands', () => {
    const payload = buildSyncDryRunPayload(
      {
        check: true,
        packageManager: 'npm',
        plannedCommands: [
          {
            displayCommand: 'npm run sync -- --check',
          },
        ],
        projectDir: '/tmp/demo-workspace',
        target: 'default',
      },
      UNICODE_MARKER_OPTIONS,
    );

    expect(payload.title).toBe('🧪 Dry run for wp-typia sync');
    expect(payload.summaryLines).toEqual([
      'Project directory: /tmp/demo-workspace',
      'Package manager: npm',
      'Sync target: generated project defaults.',
      'Execution mode: would run generated sync scripts in verification mode.',
    ]);
    expect(payload.optionalTitle).toBe('Planned sync commands (1):');
    expect(payload.optionalLines).toEqual(['npm run sync -- --check']);
    expect(payload.optionalNote).toContain('--dry-run');
    expect(payload.optionalNote).toContain('--check');
  });

  test('dry-run sync payload can describe the AI-only target', () => {
    const payload = buildSyncDryRunPayload(
      {
        check: false,
        packageManager: 'npm',
        plannedCommands: [
          {
            displayCommand: 'npm run sync-ai',
          },
        ],
        projectDir: '/tmp/demo-workspace',
        target: 'ai',
      },
      UNICODE_MARKER_OPTIONS,
    );

    expect(payload.title).toBe('🧪 Dry run for wp-typia sync ai');
    expect(payload.summaryLines).toEqual([
      'Project directory: /tmp/demo-workspace',
      'Package manager: npm',
      'Sync target: AI artifacts only.',
      'Execution mode: would run generated sync scripts in apply mode.',
    ]);
    expect(payload.optionalLines).toEqual(['npm run sync-ai']);
    expect(payload.optionalNote).toContain('wp-typia sync ai');
  });

  test('completion helpers expose ASCII-friendly markers when requested', () => {
    const payload = buildCreateCompletionPayload(
      {
        nextSteps: ['cd demo-block'],
        optionalOnboarding: {
          note: 'Run npm run sync before your first commit if you edited types.',
          shortNote:
            'Skip npm run sync during normal npm run dev work. Re-run it before build, typecheck, or doctor when you want a reviewable refresh.',
          steps: ['npm run sync'],
        },
        packageManager: 'npm',
        projectDir: '/tmp/demo-block',
        result: {
          variables: {
            title: 'Demo Block',
          },
          warnings: ['This template enables optional migration UI.'],
        },
      },
      { forceAscii: true },
    );
    const printed: string[] = [];

    printCompletionPayload(payload, {
      markerOptions: { forceAscii: true },
      printLine: (line) => printed.push(line),
    });

    expect(payload.title).toBe('[ok] Created Demo Block in /tmp/demo-block');
    expect(printed).toContain(
      '[!] This template enables optional migration UI.',
    );
    expect(printed).toContain('\n[ok] Created Demo Block in /tmp/demo-block');
    expect(
      formatCreateProgressLine(
        {
          detail: 'Copying scaffold files into the target project directory.',
          title: 'Generating project files',
        },
        { forceAscii: true },
      ),
    ).toBe(
      '[...] Generating project files: Copying scaffold files into the target project directory.',
    );
  });

  test('dry-run payloads can render ASCII-friendly titles', () => {
    const createPayload = buildCreateDryRunPayload(
      {
        packageManager: 'npm',
        plan: {
          dependencyInstall: 'would-install',
          files: ['README.md'],
        },
        projectDir: '/tmp/demo-block',
        result: {
          selectedVariant: null,
          templateId: 'basic',
          variables: {
            title: 'Demo Block',
          },
          warnings: [],
        },
      },
      { forceAscii: true },
    );
    const addPayload = buildAddDryRunPayload(
      {
        completion: buildAddCompletionPayload(
          {
            kind: 'block',
            packageManager: 'npm',
            projectDir: '/tmp/demo-workspace',
            values: {
              blockSlugs: 'faq, faq-item',
              templateId: 'compound',
            },
          },
          { forceAscii: true },
        ),
        fileOperations: ['write src/blocks/faq/block.json'],
      },
      { forceAscii: true },
    );

    expect(createPayload.title).toBe(
      '[dry-run] Dry run for Demo Block at /tmp/demo-block',
    );
    expect(addPayload.title).toBe('[dry-run] Dry run for workspace block');
  });
});
