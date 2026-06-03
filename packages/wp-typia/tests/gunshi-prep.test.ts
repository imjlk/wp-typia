import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CLI_DIAGNOSTIC_CODES } from '@wp-typia/project-tools/cli-diagnostics';

import {
  WP_TYPIA_CANONICAL_CREATE_USAGE,
  WP_TYPIA_CANONICAL_MIGRATE_USAGE,
  WP_TYPIA_FUTURE_COMMAND_TREE,
  WP_TYPIA_POSITIONAL_ALIAS_USAGE,
  WP_TYPIA_TOP_LEVEL_COMMAND_NAMES,
  normalizeWpTypiaArgv,
} from '../src/command-contract';
import { ADD_KIND_IDS } from '../src/add-kind-registry';
import { shouldUseGunshiCompletion } from '../src/gunshi-cli';
import { syncMcpSchemas } from '../src/mcp';

const packageRoot = path.resolve(import.meta.dir, '..');
const packageManifest = JSON.parse(
  fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'),
);
const runtimeDependencyHelperSource = fs.readFileSync(
  path.join(packageRoot, 'scripts', 'runtime-build-dependencies.ts'),
  'utf8',
);

describe('wp-typia Gunshi runtime preparation', () => {
  function expectMissingOptionValue(callback: () => unknown): void {
    let caught: unknown;
    try {
      callback();
    } catch (error) {
      caught = error;
    }

    expect(caught).toMatchObject({
      code: CLI_DIAGNOSTIC_CODES.MISSING_ARGUMENT,
    });
  }

  function expectInvalidArgument(
    callback: () => unknown,
    message: RegExp,
  ): void {
    let caught: unknown;
    try {
      callback();
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    expect(caught).toMatchObject({
      code: CLI_DIAGNOSTIC_CODES.INVALID_ARGUMENT,
    });
    expect((caught as Error).message).toMatch(message);
  }

  test('ships the Node-first Gunshi runtime without Bunli package surfaces', () => {
    expect(packageManifest.bin['wp-typia']).toBe('bin/wp-typia.js');
    expect(packageManifest.files).toContain('dist/');
    expect(packageManifest.files).not.toContain('dist-bunli/');
    expect(packageManifest.dependencies.gunshi).toBe('0.32.0');
    expect(packageManifest.dependencies['@gunshi/plugin-completion']).toBe(
      '0.32.0',
    );
    expect(packageManifest.dependencies['@bunli/core']).toBeUndefined();
    expect(packageManifest.devDependencies.bunli).toBeUndefined();
    expect(packageManifest.optionalDependencies).toBeUndefined();
    expect(packageManifest.scripts.generate).toBe('bun scripts/build-runtime.ts');
    expect(packageManifest.scripts.build).toBe('bun run generate');
    expect(packageManifest.scripts['generate:routing']).toBeUndefined();
    expect(packageManifest.scripts['validate:routing']).toBeUndefined();
    expect(fs.existsSync(path.join(packageRoot, 'src', 'gunshi-cli.ts'))).toBe(
      true,
    );
    expect(fs.existsSync(path.join(packageRoot, 'src', 'cli.ts'))).toBe(false);
    expect(fs.existsSync(path.join(packageRoot, 'bunli.config.ts'))).toBe(
      false,
    );
  });

  test('routes completion plugin usage to Node runtimes only', () => {
    const nodeVersions = { ...process.versions, bun: undefined };
    const bunVersions = { ...process.versions, bun: '1.3.11' };

    expect(shouldUseGunshiCompletion(['complete', 'bash'], nodeVersions)).toBe(
      true,
    );
    expect(shouldUseGunshiCompletion(['complete', 'bash'], bunVersions)).toBe(
      false,
    );
    expect(
      shouldUseGunshiCompletion(['completions', 'bash'], nodeVersions),
    ).toBe(true);
    expect(shouldUseGunshiCompletion(['complete', '--help'], nodeVersions)).toBe(
      false,
    );
  });

  test('future command tree preserves the reserved top-level taxonomy', () => {
    const commandNames = WP_TYPIA_FUTURE_COMMAND_TREE.map(
      (command) => command.name,
    );

    expect(commandNames).toEqual([...WP_TYPIA_TOP_LEVEL_COMMAND_NAMES]);
    expect(commandNames).toContain('mcp');
    expect(WP_TYPIA_FUTURE_COMMAND_TREE).toContainEqual({
      description: 'Scaffold a new wp-typia project.',
      name: 'create',
      subcommands: undefined,
    });
  });

  test('future command tree exposes every supported add kind', () => {
    const addCommand = WP_TYPIA_FUTURE_COMMAND_TREE.find(
      (command) => command.name === 'add',
    );

    expect(addCommand?.subcommands).toEqual([...ADD_KIND_IDS]);
  });

  test('normalizes canonical create and migrate aliases before runtime dispatch', () => {
    expect(normalizeWpTypiaArgv(['demo-block'])).toEqual(['create', 'demo-block']);
    expect(normalizeWpTypiaArgv(['storybook'])).toEqual([
      'create',
      'storybook',
    ]);
    expectInvalidArgument(
      () => normalizeWpTypiaArgv(['migrations', 'plan']),
      /`wp-typia migrations` was removed/,
    );
    expectInvalidArgument(
      () => normalizeWpTypiaArgv(['docotr']),
      /Did you mean "doctor"/,
    );
    expect(WP_TYPIA_CANONICAL_CREATE_USAGE).toBe(
      'wp-typia create <project-dir>',
    );
    expect(WP_TYPIA_POSITIONAL_ALIAS_USAGE).toBe('wp-typia <project-dir>');
    expect(WP_TYPIA_CANONICAL_MIGRATE_USAGE).toBe(
      'wp-typia migrate <subcommand>',
    );
  });

  test('preserves value-taking option parsing for command normalization', () => {
    expectMissingOptionValue(() =>
      normalizeWpTypiaArgv(['create', 'demo-block', '--config']),
    );
    expectInvalidArgument(
      () => normalizeWpTypiaArgv(['--template', 'basic', 'temlates', 'list']),
      /positional alias only accepts a single project directory/,
    );
    expect(normalizeWpTypiaArgv(['mcp', 'sync', '--output-dir=.cache/mcp']))
      .toEqual(['mcp', 'sync', '--output-dir=.cache/mcp']);
  });

  test('runtime build dependency helper keeps package runtime aliases explicit', () => {
    expect(runtimeDependencyHelperSource).toContain(
      '"@wp-typia/project-tools/cli-diagnostics"',
    );
    expect(runtimeDependencyHelperSource).toContain('WP_TYPIA_EXTERNALS');
  });

  test('publish source-map helper uses the neutral dist runtime', () => {
    const source = fs.readFileSync(
      path.join(packageRoot, 'scripts', 'publish-runtime-maps.mjs'),
      'utf8',
    );

    expect(source).toContain('path.join(packageRoot, "dist")');
    expect(source).not.toContain('dist-bunli');
  });

  test('mcp sync defaults to the wp-typia metadata directory', async () => {
    const tempRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'wp-typia-gunshi-mcp-default-'),
    );
    const schemaPath = path.join(tempRoot, 'tools.json');

    try {
      fs.writeFileSync(
        schemaPath,
        `${JSON.stringify([{ name: 'CreateBlock' }], null, 2)}\n`,
        'utf8',
      );

      const result = await syncMcpSchemas(tempRoot, [
        { namespace: 'wp', path: schemaPath },
      ]);

      expect(result.outputDir).toBe(path.join(tempRoot, '.wp-typia', 'mcp'));
      expect(fs.existsSync(path.join(result.outputDir, 'registry.json'))).toBe(
        true,
      );
      expect(fs.existsSync(path.join(result.outputDir, 'mcp-wp.gen.ts'))).toBe(
        true,
      );
    } finally {
      fs.rmSync(tempRoot, { force: true, recursive: true });
    }
  });
});
