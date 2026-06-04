import { describe, expect, test } from 'bun:test';
import { CLI_DIAGNOSTIC_CODES } from '@wp-typia/project-tools/cli-diagnostics';

import {
  ALL_COMMAND_OPTION_METADATA,
  ADD_OPTION_METADATA,
  buildArgvWalkerRoutingMetadata,
  buildCommandOptionParser,
  COMMAND_OPTION_METADATA_BY_GROUP,
  COMMAND_ROUTING_METADATA,
  CREATE_OPTION_METADATA,
  DOCTOR_OPTION_METADATA,
  extractKnownOptionValuesFromArgv,
  formatPortableCliOptionHelp,
  GLOBAL_OPTION_METADATA,
  INIT_OPTION_METADATA,
  MCP_OPTION_METADATA,
  MIGRATE_OPTION_METADATA,
  parseCommandArgvWithMetadata,
  resolveCommandOptionValues,
  SYNC_OPTION_METADATA,
  TEMPLATES_OPTION_METADATA,
} from '../src/command-option-metadata';
import {
  ADD_KIND_IDS,
  getAddHiddenBooleanSubmitFieldNames,
  getAddHiddenStringSubmitFieldNames,
  getAddVisibleFieldNames,
} from '../src/add-kind-registry';
import { ADD_OPTION_METADATA as FOCUSED_ADD_OPTION_METADATA } from '../src/command-options/add';
import { CREATE_OPTION_METADATA as FOCUSED_CREATE_OPTION_METADATA } from '../src/command-options/create';
import { DOCTOR_OPTION_METADATA as FOCUSED_DOCTOR_OPTION_METADATA } from '../src/command-options/doctor';
import { GLOBAL_OPTION_METADATA as FOCUSED_GLOBAL_OPTION_METADATA } from '../src/command-options/global';
import { INIT_OPTION_METADATA as FOCUSED_INIT_OPTION_METADATA } from '../src/command-options/init';
import { MCP_OPTION_METADATA as FOCUSED_MCP_OPTION_METADATA } from '../src/command-options/mcp';
import { MIGRATE_OPTION_METADATA as FOCUSED_MIGRATE_OPTION_METADATA } from '../src/command-options/migrate';
import { SYNC_OPTION_METADATA as FOCUSED_SYNC_OPTION_METADATA } from '../src/command-options/sync';
import { TEMPLATES_OPTION_METADATA as FOCUSED_TEMPLATES_OPTION_METADATA } from '../src/command-options/templates';

describe('command option metadata helpers', () => {
  function expectDiagnosticCode(
    callback: () => unknown,
    code: string,
    message: string,
  ): void {
    let caught: unknown;
    try {
      callback();
    } catch (error) {
      caught = error;
    }

    expect(caught).toMatchObject({
      code,
      message,
    });
  }

  test('keeps command option declarations single-sourced in focused modules', () => {
    expect(CREATE_OPTION_METADATA).toBe(FOCUSED_CREATE_OPTION_METADATA);
    expect(ADD_OPTION_METADATA).toBe(FOCUSED_ADD_OPTION_METADATA);
    expect(INIT_OPTION_METADATA).toBe(FOCUSED_INIT_OPTION_METADATA);
    expect(SYNC_OPTION_METADATA).toBe(FOCUSED_SYNC_OPTION_METADATA);
    expect(DOCTOR_OPTION_METADATA).toBe(FOCUSED_DOCTOR_OPTION_METADATA);
    expect(MIGRATE_OPTION_METADATA).toBe(FOCUSED_MIGRATE_OPTION_METADATA);
    expect(MCP_OPTION_METADATA).toBe(FOCUSED_MCP_OPTION_METADATA);
    expect(GLOBAL_OPTION_METADATA).toBe(FOCUSED_GLOBAL_OPTION_METADATA);
    expect(TEMPLATES_OPTION_METADATA).toBe(FOCUSED_TEMPLATES_OPTION_METADATA);
    expect(COMMAND_OPTION_METADATA_BY_GROUP.create).toBe(
      FOCUSED_CREATE_OPTION_METADATA,
    );
    expect(COMMAND_OPTION_METADATA_BY_GROUP.add).toBe(
      FOCUSED_ADD_OPTION_METADATA,
    );
    expect(COMMAND_OPTION_METADATA_BY_GROUP.init).toBe(
      FOCUSED_INIT_OPTION_METADATA,
    );
    expect(COMMAND_OPTION_METADATA_BY_GROUP.sync).toBe(
      FOCUSED_SYNC_OPTION_METADATA,
    );
    expect(COMMAND_OPTION_METADATA_BY_GROUP.doctor).toBe(
      FOCUSED_DOCTOR_OPTION_METADATA,
    );
    expect(COMMAND_OPTION_METADATA_BY_GROUP.migrate).toBe(
      FOCUSED_MIGRATE_OPTION_METADATA,
    );
    expect(COMMAND_OPTION_METADATA_BY_GROUP.mcp).toBe(
      FOCUSED_MCP_OPTION_METADATA,
    );
    expect(COMMAND_OPTION_METADATA_BY_GROUP.global).toBe(
      FOCUSED_GLOBAL_OPTION_METADATA,
    );
    expect(COMMAND_OPTION_METADATA_BY_GROUP.templates).toBe(
      FOCUSED_TEMPLATES_OPTION_METADATA,
    );
  });

  test('parses string and boolean flags from shared metadata', () => {
    const parsed = parseCommandArgvWithMetadata(
      ['--dry-run', '-t', 'basic', '-y', 'demo-project'],
      {
        extraBooleanOptionNames: ['help', 'version'],
        parser: buildCommandOptionParser(
          GLOBAL_OPTION_METADATA,
          CREATE_OPTION_METADATA,
        ),
      },
    );

    expect(parsed.flags).toEqual({
      'dry-run': true,
      template: 'basic',
      yes: true,
    });
    expect(parsed.positionals).toEqual(['demo-project']);
  });

  test('merges defaults and flags through metadata-backed resolution', () => {
    const resolved = resolveCommandOptionValues(CREATE_OPTION_METADATA, {
      defaults: {
        'dry-run': true,
        'package-manager': 'npm',
        template: 'basic',
      },
      flags: {
        'package-manager': 'bun',
      },
    });

    expect(resolved['dry-run']).toBe(true);
    expect(resolved['no-install']).toBe(false);
    expect(resolved['package-manager']).toBe('bun');
    expect(resolved.template).toBe('basic');
  });

  test('supports option subsets for add command initial values', () => {
    const resolved = resolveCommandOptionValues(ADD_OPTION_METADATA, {
      defaults: {
        'data-storage': 'post-meta',
        'dry-run': true,
        template: 'persistence',
      },
      flags: {
        'external-layer-source': './layers',
      },
      optionNames: Object.keys(ADD_OPTION_METADATA).filter(
        (optionName) => optionName !== 'dry-run',
      ),
    });

    expect(resolved['data-storage']).toBe('post-meta');
    expect(resolved['external-layer-source']).toBe('./layers');
    expect(resolved.template).toBe('persistence');
    expect('dry-run' in resolved).toBe(false);
  });

  test('parses binding source target flags from shared add metadata', () => {
    const parsed = parseCommandArgvWithMetadata(
      [
        'binding-source',
        'hero-data',
        '--block',
        'counter-card',
        '--attribute',
        'headline',
      ],
      {
        extraBooleanOptionNames: ['help', 'version'],
        parser: buildCommandOptionParser(
          GLOBAL_OPTION_METADATA,
          ADD_OPTION_METADATA,
        ),
      },
    );

    expect(parsed.flags).toEqual({
      attribute: 'headline',
      block: 'counter-card',
    });
    expect(parsed.positionals).toEqual(['binding-source', 'hero-data']);
  });

  test('parses focused add short flags from shared metadata', () => {
    const parsed = parseCommandArgvWithMetadata(
      [
        'block',
        'counter-card',
        '-t',
        'basic',
        '-b',
        'core/group',
        '-n',
        'demo/v1',
        '-d',
      ],
      {
        extraBooleanOptionNames: ['help', 'version'],
        parser: buildCommandOptionParser(
          GLOBAL_OPTION_METADATA,
          ADD_OPTION_METADATA,
        ),
      },
    );

    expect(parsed.flags).toEqual({
      block: 'core/group',
      'dry-run': true,
      namespace: 'demo/v1',
      template: 'basic',
    });
    expect(parsed.positionals).toEqual(['block', 'counter-card']);
  });

  test('parses plugin QA profile flags from shared create and add metadata', () => {
    const createParsed = parseCommandArgvWithMetadata(
      ['--template', 'workspace', '--profile', 'plugin-qa', 'demo-plugin'],
      {
        extraBooleanOptionNames: ['help', 'version'],
        parser: buildCommandOptionParser(
          GLOBAL_OPTION_METADATA,
          CREATE_OPTION_METADATA,
        ),
      },
    );
    const addParsed = parseCommandArgvWithMetadata(
      ['integration-env', 'local-smoke', '--wp-env', '--release-zip'],
      {
        extraBooleanOptionNames: ['help', 'version'],
        parser: buildCommandOptionParser(
          GLOBAL_OPTION_METADATA,
          ADD_OPTION_METADATA,
        ),
      },
    );

    expect(createParsed.flags).toEqual({
      profile: 'plugin-qa',
      template: 'workspace',
    });
    expect(createParsed.positionals).toEqual(['demo-plugin']);
    expect(addParsed.flags).toEqual({
      'release-zip': true,
      'wp-env': true,
    });
    expect(addParsed.positionals).toEqual(['integration-env', 'local-smoke']);
  });

  test('parses transform source and target flags from shared add metadata', () => {
    const parsed = parseCommandArgvWithMetadata(
      [
        'transform',
        'quote-to-counter',
        '--from',
        'core/quote',
        '--to',
        'counter-card',
      ],
      {
        extraBooleanOptionNames: ['help', 'version'],
        parser: buildCommandOptionParser(
          GLOBAL_OPTION_METADATA,
          ADD_OPTION_METADATA,
        ),
      },
    );

    expect(parsed.flags).toEqual({
      from: 'core/quote',
      to: 'counter-card',
    });
    expect(parsed.positionals).toEqual(['transform', 'quote-to-counter']);
  });

  test('accumulates repeatable pattern tag flags from shared add metadata', () => {
    const parsed = parseCommandArgvWithMetadata(
      [
        'pattern',
        'hero-photo',
        '--catalog-title',
        'Hero Photo',
        '--tags',
        'hero,landing',
        '--tag',
        'featured',
        '--tag=hero',
        '--tags',
        'gallery',
      ],
      {
        extraBooleanOptionNames: ['help', 'version'],
        parser: buildCommandOptionParser(
          GLOBAL_OPTION_METADATA,
          ADD_OPTION_METADATA,
        ),
      },
    );

    expect(parsed.flags).toEqual({
      'catalog-title': 'Hero Photo',
      tag: ['featured', 'hero'],
      tags: ['hero,landing', 'gallery'],
    });
    expect(parsed.positionals).toEqual(['pattern', 'hero-photo']);
  });

  test('keeps repeatable option arrays available through opt-in resolution', () => {
    const flags = {
      tag: ['featured', 'hero'],
      tags: ['hero,landing', 'gallery'],
    };
    const flattened = resolveCommandOptionValues(ADD_OPTION_METADATA, {
      flags,
      optionNames: ['tag', 'tags'],
    });
    const preserved = resolveCommandOptionValues(ADD_OPTION_METADATA, {
      flags,
      optionNames: ['tag', 'tags'],
      preserveArrays: true,
    });

    expect(flattened).toEqual({
      tag: 'featured,hero',
      tags: 'hero,landing,gallery',
    });
    expect(preserved).toEqual({
      tag: ['featured', 'hero'],
      tags: ['hero,landing', 'gallery'],
    });
  });

  test('parses manual REST secret flags from shared add metadata', () => {
    const parsed = parseCommandArgvWithMetadata(
      [
        'rest-resource',
        'integration-settings',
        '--manual',
        '--method',
        'POST',
        '--secret-field',
        'apiKey',
        '--secret-has-value-field',
        'hasApiKey',
        '--secret-preserve-on-empty',
        'false',
      ],
      {
        extraBooleanOptionNames: ['help', 'version'],
        parser: buildCommandOptionParser(
          GLOBAL_OPTION_METADATA,
          ADD_OPTION_METADATA,
        ),
      },
    );

    expect(parsed.flags).toEqual({
      manual: true,
      method: 'POST',
      'secret-field': 'apiKey',
      'secret-has-value-field': 'hasApiKey',
      'secret-preserve-on-empty': 'false',
    });
    expect(parsed.positionals).toEqual([
      'rest-resource',
      'integration-settings',
    ]);
  });

  test('documents manual REST secret-field prerequisites in shared help metadata', () => {
    expect(ADD_OPTION_METADATA['secret-field'].description).toContain(
      'requires --manual and a request body',
    );
    expect(ADD_OPTION_METADATA['secret-field'].description).toContain(
      'POST, PUT, or PATCH',
    );
    expect(formatPortableCliOptionHelp(ADD_OPTION_METADATA)).toContain(
      '- --secret-field <value>: Write-only request body field for manual settings REST contracts; requires --manual and a request body, typically generated by POST, PUT, or PATCH.',
    );
    expect(formatPortableCliOptionHelp(ADD_OPTION_METADATA)).toContain(
      '- --secret-preserve-on-empty <value>: Whether blank manual settings secret submissions should preserve the stored secret (true by default).',
    );
    expect(formatPortableCliOptionHelp(ADD_OPTION_METADATA)).toContain(
      '- --template <value>, -t <value>: Built-in block family for add block; one of basic, interactivity, persistence, or compound. Defaults to basic in non-interactive runs; interactive runs prompt when omitted.',
    );
    expect(formatPortableCliOptionHelp(ADD_OPTION_METADATA)).toContain(
      '- --dry-run, -d: Preview workspace file updates and completion guidance without writing them.',
    );
    expect(formatPortableCliOptionHelp(ADD_OPTION_METADATA)).not.toContain(
      '- --tag: Legacy repeatable single-tag alias for typed pattern catalog entries; prefer --tags.',
    );
  });

  test('parses sync preview flags from shared metadata', () => {
    const parsed = parseCommandArgvWithMetadata(['--dry-run', '--check'], {
      extraBooleanOptionNames: ['help', 'version'],
      parser: buildCommandOptionParser(
        GLOBAL_OPTION_METADATA,
        SYNC_OPTION_METADATA,
      ),
    });

    expect(parsed.flags).toEqual({
      check: true,
      'dry-run': true,
    });
    expect(parsed.positionals).toEqual([]);
  });

  test('parses init apply/package-manager flags from shared metadata', () => {
    const parsed = parseCommandArgvWithMetadata(
      ['init', '--apply', '--package-manager', 'pnpm', 'demo-plugin'],
      {
        extraBooleanOptionNames: ['help', 'version'],
        parser: buildCommandOptionParser(
          GLOBAL_OPTION_METADATA,
          INIT_OPTION_METADATA,
        ),
      },
    );

    expect(parsed.flags).toEqual({
      apply: true,
      'package-manager': 'pnpm',
    });
    expect(parsed.positionals).toEqual(['init', 'demo-plugin']);
  });

  test('parses doctor structured output flags from shared metadata', () => {
    const parsed = parseCommandArgvWithMetadata(
      ['doctor', '--format', 'json', '--workspace-only'],
      {
        extraBooleanOptionNames: ['help', 'version'],
        parser: buildCommandOptionParser(
          GLOBAL_OPTION_METADATA,
          DOCTOR_OPTION_METADATA,
        ),
      },
    );

    expect(parsed.flags).toEqual({
      format: 'json',
      'workspace-only': true,
    });
    expect(parsed.positionals).toEqual(['doctor']);
  });

  test('parses mcp output-dir flags from shared metadata', () => {
    const spaced = parseCommandArgvWithMetadata(
      ['mcp', 'sync', '--output-dir', '.wp-typia/generated-mcp'],
      {
        extraBooleanOptionNames: ['help', 'version'],
        parser: buildCommandOptionParser(
          GLOBAL_OPTION_METADATA,
          MCP_OPTION_METADATA,
        ),
      },
    );
    const inline = parseCommandArgvWithMetadata(
      ['mcp', 'sync', '--output-dir=.cache/mcp'],
      {
        extraBooleanOptionNames: ['help', 'version'],
        parser: buildCommandOptionParser(
          GLOBAL_OPTION_METADATA,
          MCP_OPTION_METADATA,
        ),
      },
    );

    expect(spaced.flags['output-dir']).toBe('.wp-typia/generated-mcp');
    expect(spaced.positionals).toEqual(['mcp', 'sync']);
    expect(inline.flags['output-dir']).toBe('.cache/mcp');
    expect(inline.positionals).toEqual(['mcp', 'sync']);
  });

  test('derives canonical routing metadata from every command option group', () => {
    const expectedRoutingMetadata = buildArgvWalkerRoutingMetadata(
      ...Object.values(COMMAND_OPTION_METADATA_BY_GROUP),
    );

    expect(COMMAND_ROUTING_METADATA).toEqual(expectedRoutingMetadata);
    expect(ALL_COMMAND_OPTION_METADATA.check).toEqual(
      SYNC_OPTION_METADATA.check,
    );
    expect(COMMAND_ROUTING_METADATA.longValueOptions).toContain('--config');
    expect(COMMAND_ROUTING_METADATA.longValueOptions).toContain('--output-dir');
    expect(COMMAND_ROUTING_METADATA.longValueOptions).toContain('--profile');
    expect(COMMAND_ROUTING_METADATA.shortValueOptions).toContain('-c');
  });

  test('extracts selected global options while preserving command argv', () => {
    const parser = buildCommandOptionParser(ALL_COMMAND_OPTION_METADATA);
    const extracted = extractKnownOptionValuesFromArgv(
      [
        '--format',
        'json',
        'templates',
        '--id=basic',
        'inspect',
        '--',
        '--format',
      ],
      {
        optionNames: ['format', 'id'],
        parser,
      },
    );

    expect(extracted.flags).toEqual({
      format: 'json',
      id: 'basic',
    });
    expect(extracted.argv).toEqual(['templates', 'inspect', '--', '--format']);
  });

  test('keeps loose extraction permissive for unknown options', () => {
    const parser = buildCommandOptionParser(ALL_COMMAND_OPTION_METADATA);
    const extracted = extractKnownOptionValuesFromArgv(
      [
        '--unknown',
        'value',
        '--format=json',
        '-c',
        'wp-typia.config.ts',
        '-z',
        '--',
        '--id',
        'literal',
      ],
      {
        optionNames: ['config', 'format', 'id'],
        parser,
      },
    );

    expect(extracted.flags).toEqual({
      config: 'wp-typia.config.ts',
      format: 'json',
    });
    expect(extracted.argv).toEqual([
      '--unknown',
      'value',
      '-z',
      '--',
      '--id',
      'literal',
    ]);
  });

  test('keeps strict parsing terminator and repeatable option behavior stable', () => {
    const parsed = parseCommandArgvWithMetadata(
      [
        'pattern',
        'hero-photo',
        '--tag',
        'featured',
        '--tag=landing',
        '--',
        '--tag',
        'literal',
      ],
      {
        parser: buildCommandOptionParser(
          GLOBAL_OPTION_METADATA,
          ADD_OPTION_METADATA,
        ),
      },
    );

    expect(parsed.flags).toEqual({
      tag: ['featured', 'landing'],
    });
    expect(parsed.positionals).toEqual([
      'pattern',
      'hero-photo',
      '--tag',
      'literal',
    ]);
  });

  test('keeps registered add-kind fields covered by option metadata', () => {
    const metadataOptionNames = new Set(Object.keys(ADD_OPTION_METADATA));
    const registeredFieldNames = new Set<string>();
    const nonOptionFieldNames = new Set(['kind', 'name']);

    for (const kind of ADD_KIND_IDS) {
      for (const template of [
        undefined,
        'basic',
        'interactivity',
        'persistence',
        'compound',
        'query-loop',
      ] as const) {
        for (const fieldName of getAddVisibleFieldNames({ kind, template })) {
          registeredFieldNames.add(fieldName);
        }
      }
      for (const fieldName of getAddHiddenBooleanSubmitFieldNames(kind)) {
        registeredFieldNames.add(fieldName);
      }
      for (const fieldName of getAddHiddenStringSubmitFieldNames(kind)) {
        registeredFieldNames.add(fieldName);
      }
    }

    const missingMetadata = [...registeredFieldNames]
      .filter(
        (fieldName) =>
          !nonOptionFieldNames.has(fieldName) &&
          !metadataOptionNames.has(fieldName),
      )
      .sort();

    expect(missingMetadata).toEqual([]);
  });

  test('throws diagnostic-coded errors for parser option failures', () => {
    const parser = buildCommandOptionParser(
      GLOBAL_OPTION_METADATA,
      DOCTOR_OPTION_METADATA,
    );

    expectDiagnosticCode(
      () =>
      parseCommandArgvWithMetadata(['doctor', '--format'], {
        parser,
      }),
      CLI_DIAGNOSTIC_CODES.MISSING_ARGUMENT,
      '`--format` requires a value.',
    );
    expectDiagnosticCode(
      () =>
      parseCommandArgvWithMetadata(['doctor', '--unknown'], {
        parser,
      }),
      CLI_DIAGNOSTIC_CODES.INVALID_ARGUMENT,
      'Unknown option `--unknown`.',
    );
  });

  test('throws diagnostic-coded errors for missing extracted global option values', () => {
    const parser = buildCommandOptionParser(ALL_COMMAND_OPTION_METADATA);

    expectDiagnosticCode(
      () =>
      extractKnownOptionValuesFromArgv(
        ['templates', '--id', '--format', 'json'],
        {
          optionNames: ['format', 'id'],
          parser,
        },
      ),
      CLI_DIAGNOSTIC_CODES.MISSING_ARGUMENT,
      '`--id` requires a value.',
    );
  });
});
