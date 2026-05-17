import { expect, test } from 'bun:test';
import {
  normalizeBlockSlug,
  PATTERN_CATALOG_SCOPE_IDS,
  PATTERN_SECTION_ROLE_PATTERN,
} from '@wp-typia/project-tools/cli-add';

import {
  ADD_KIND_IDS,
  ADD_KIND_REGISTRY,
  type AddKindId,
  type AddKindExecutionContext,
  type AddKindExecutionPlanFor,
  getAddKindUsage,
  getAddVisibleFieldNames,
} from '../src/add-kind-registry';

type ExpectTrue<TValue extends true> = TValue;
type IsEqual<TLeft, TRight> =
  (<TValue>() => TValue extends TLeft ? 1 : 2) extends <
    TValue,
  >() => TValue extends TRight ? 1 : 2
    ? true
    : false;

type AdminViewPlanCompatibility = ExpectTrue<
  IsEqual<
    Awaited<ReturnType<AddKindExecutionPlanFor<'admin-view'>['execute']>>,
    Parameters<AddKindExecutionPlanFor<'admin-view'>['getValues']>[0]
  >
>;

type BlockPlanCompatibility = ExpectTrue<
  IsEqual<
    Awaited<ReturnType<AddKindExecutionPlanFor<'block'>['execute']>>,
    Parameters<AddKindExecutionPlanFor<'block'>['getValues']>[0]
  >
>;

type VariationPlanCompatibility = ExpectTrue<
  IsEqual<
    Awaited<ReturnType<AddKindExecutionPlanFor<'variation'>['execute']>>,
    Parameters<AddKindExecutionPlanFor<'variation'>['getValues']>[0]
  >
>;

type CoreVariationPlanCompatibility = ExpectTrue<
  IsEqual<
    Awaited<
      ReturnType<AddKindExecutionPlanFor<'core-variation'>['execute']>
    >,
    Parameters<AddKindExecutionPlanFor<'core-variation'>['getValues']>[0]
  >
>;

type StylePlanCompatibility = ExpectTrue<
  IsEqual<
    Awaited<ReturnType<AddKindExecutionPlanFor<'style'>['execute']>>,
    Parameters<AddKindExecutionPlanFor<'style'>['getValues']>[0]
  >
>;

type TransformPlanCompatibility = ExpectTrue<
  IsEqual<
    Awaited<ReturnType<AddKindExecutionPlanFor<'transform'>['execute']>>,
    Parameters<AddKindExecutionPlanFor<'transform'>['getValues']>[0]
  >
>;

type PatternPlanCompatibility = ExpectTrue<
  IsEqual<
    Awaited<ReturnType<AddKindExecutionPlanFor<'pattern'>['execute']>>,
    Parameters<AddKindExecutionPlanFor<'pattern'>['getValues']>[0]
  >
>;

type BindingSourcePlanCompatibility = ExpectTrue<
  IsEqual<
    Awaited<ReturnType<AddKindExecutionPlanFor<'binding-source'>['execute']>>,
    Parameters<AddKindExecutionPlanFor<'binding-source'>['getValues']>[0]
  >
>;

type ContractPlanCompatibility = ExpectTrue<
  IsEqual<
    Awaited<ReturnType<AddKindExecutionPlanFor<'contract'>['execute']>>,
    Parameters<AddKindExecutionPlanFor<'contract'>['getValues']>[0]
  >
>;

type RestResourcePlanCompatibility = ExpectTrue<
  IsEqual<
    Awaited<ReturnType<AddKindExecutionPlanFor<'rest-resource'>['execute']>>,
    Parameters<AddKindExecutionPlanFor<'rest-resource'>['getValues']>[0]
  >
>;

type PostMetaPlanCompatibility = ExpectTrue<
  IsEqual<
    Awaited<ReturnType<AddKindExecutionPlanFor<'post-meta'>['execute']>>,
    Parameters<AddKindExecutionPlanFor<'post-meta'>['getValues']>[0]
  >
>;

type AbilityPlanCompatibility = ExpectTrue<
  IsEqual<
    Awaited<ReturnType<AddKindExecutionPlanFor<'ability'>['execute']>>,
    Parameters<AddKindExecutionPlanFor<'ability'>['getValues']>[0]
  >
>;

type AiFeaturePlanCompatibility = ExpectTrue<
  IsEqual<
    Awaited<ReturnType<AddKindExecutionPlanFor<'ai-feature'>['execute']>>,
    Parameters<AddKindExecutionPlanFor<'ai-feature'>['getValues']>[0]
  >
>;

type HookedBlockPlanCompatibility = ExpectTrue<
  IsEqual<
    Awaited<ReturnType<AddKindExecutionPlanFor<'hooked-block'>['execute']>>,
    Parameters<AddKindExecutionPlanFor<'hooked-block'>['getValues']>[0]
  >
>;

type EditorPluginPlanCompatibility = ExpectTrue<
  IsEqual<
    Awaited<ReturnType<AddKindExecutionPlanFor<'editor-plugin'>['execute']>>,
    Parameters<AddKindExecutionPlanFor<'editor-plugin'>['getValues']>[0]
  >
>;

type IntegrationEnvPlanCompatibility = ExpectTrue<
  IsEqual<
    Awaited<
      ReturnType<AddKindExecutionPlanFor<'integration-env'>['execute']>
    >,
    Parameters<AddKindExecutionPlanFor<'integration-env'>['getValues']>[0]
  >
>;

type SharedAddKindIdCompatibility = ExpectTrue<
  IsEqual<keyof typeof ADD_KIND_REGISTRY, AddKindId>
>;

const PATTERN_FLAG_RUNTIME_HELPERS = {
  normalizeBlockSlug,
  PATTERN_CATALOG_SCOPE_IDS,
  PATTERN_SECTION_ROLE_PATTERN,
};

const addKindPlanCompatibilityChecks = {
  'admin-view': true,
  block: true,
  'integration-env': true,
  'core-variation': true,
  variation: true,
  style: true,
  transform: true,
  pattern: true,
  'binding-source': true,
  contract: true,
  'rest-resource': true,
  'post-meta': true,
  ability: true,
  'ai-feature': true,
  'hooked-block': true,
  'editor-plugin': true,
  registryKeys: true,
} satisfies {
  'admin-view': AdminViewPlanCompatibility;
  block: BlockPlanCompatibility;
  'core-variation': CoreVariationPlanCompatibility;
  'integration-env': IntegrationEnvPlanCompatibility;
  variation: VariationPlanCompatibility;
  style: StylePlanCompatibility;
  transform: TransformPlanCompatibility;
  pattern: PatternPlanCompatibility;
  'binding-source': BindingSourcePlanCompatibility;
  contract: ContractPlanCompatibility;
  'rest-resource': RestResourcePlanCompatibility;
  'post-meta': PostMetaPlanCompatibility;
  ability: AbilityPlanCompatibility;
  'ai-feature': AiFeaturePlanCompatibility;
  'hooked-block': HookedBlockPlanCompatibility;
  'editor-plugin': EditorPluginPlanCompatibility;
  registryKeys: SharedAddKindIdCompatibility;
};

test('preserves compile-time compatibility between execute and getValues for every add kind', () => {
  expect(addKindPlanCompatibilityChecks).toEqual({
    'admin-view': true,
    block: true,
    'core-variation': true,
    'integration-env': true,
    variation: true,
    style: true,
    transform: true,
    pattern: true,
    'binding-source': true,
    contract: true,
    'rest-resource': true,
    'post-meta': true,
    ability: true,
    'ai-feature': true,
    'hooked-block': true,
    'editor-plugin': true,
    registryKeys: true,
  });
});

test('aggregates one registry entry for every canonical add kind', () => {
  expect(Object.keys(ADD_KIND_REGISTRY).sort()).toEqual(
    [...ADD_KIND_IDS].sort(),
  );

  for (const kind of ADD_KIND_IDS) {
    const entry = ADD_KIND_REGISTRY[kind];
    expect(entry.description.length).toBeGreaterThan(0);
    expect(entry.usage).toContain(`wp-typia add ${kind}`);
  }
});

test('splits rest-resource usage by generated and manual modes', () => {
  expect(getAddKindUsage('rest-resource').split('\n')).toEqual([
    'Generated: wp-typia add rest-resource <name> [--namespace <vendor/v1>] [--methods <list,read,create,update,delete>] [--route-pattern <route-pattern>] [--permission-callback <callback>] [--controller-class <ClassName>] [--controller-extends <BaseClass>] [--dry-run]',
    'Manual: wp-typia add rest-resource <name> --manual [--namespace <vendor/v1>] [--method <GET|POST|PUT|PATCH|DELETE>] [--auth <public|authenticated|public-write-protected>] [--path <route-pattern>|--route-pattern <route-pattern>] [--permission-callback <callback>] [--controller-class <ClassName>] [--controller-extends <BaseClass>] [--query-type <Type>] [--body-type <Type>] [--response-type <Type>] [--secret-field <field>] [--secret-state-field|--secret-has-value-field <field>] [--secret-preserve-on-empty <true|false>] [--dry-run]',
  ]);
});

test('passes typed pattern catalog flags to the runtime', async () => {
  const capturedOptions: Record<string, unknown>[] = [];
  const plan = await ADD_KIND_REGISTRY.pattern.prepareExecution({
    addRuntime: {
      ...PATTERN_FLAG_RUNTIME_HELPERS,
      runAddPatternCommand: async (options: Record<string, unknown>) => {
        capturedOptions.push(options);

        return {
          contentFile: 'src/patterns/sections/hero-photo.php',
          patternScope: String(options.patternScope),
          patternSlug: String(options.patternName),
          projectDir: String(options.cwd),
          sectionRole: String(options.sectionRole),
          tags: String(options.tags).split(','),
          title: 'Hero Photo',
          thumbnailUrl: String(options.thumbnailUrl),
        };
      },
    } as unknown as AddKindExecutionContext['addRuntime'],
    cwd: '/tmp/wp-typia-pattern-test',
    flags: {
      'catalog-title': 'Homepage Hero',
      scope: 'section',
      'section-role': 'Hero Role',
      tags: 'landing,hero',
      'thumbnail-url': './thumbnails/hero.png',
    },
    getOrCreatePrompt: async () => {
      throw new Error('pattern add-kind should not prompt in this test');
    },
    isInteractiveSession: false,
    name: 'hero-photo',
    warnLine: () => {},
  });

  const result = await plan.execute('/tmp/wp-typia-pattern-test');

  expect(capturedOptions).toEqual([
    {
      catalogTitle: 'Homepage Hero',
      cwd: '/tmp/wp-typia-pattern-test',
      patternName: 'hero-photo',
      patternScope: 'section',
      sectionRole: 'hero-role',
      tags: ['landing,hero'],
      thumbnailUrl: './thumbnails/hero.png',
    },
  ]);
  expect(plan.getValues(result)).toMatchObject({
    contentFile: 'src/patterns/sections/hero-photo.php',
    patternScope: 'section',
    sectionRole: 'hero-role',
  });
});

test('passes repeatable pattern tag flags to the runtime', async () => {
  const capturedOptions: Record<string, unknown>[] = [];
  const plan = await ADD_KIND_REGISTRY.pattern.prepareExecution({
    addRuntime: {
      ...PATTERN_FLAG_RUNTIME_HELPERS,
      runAddPatternCommand: async (options: Record<string, unknown>) => {
        capturedOptions.push(options);

        return {
          contentFile: 'src/patterns/full/hero-photo.php',
          patternScope: 'full',
          patternSlug: String(options.patternName),
          projectDir: String(options.cwd),
          tags: Array.isArray(options.tags)
            ? options.tags.map(String)
            : String(options.tags).split(','),
          title: 'Hero Photo',
        };
      },
    } as unknown as AddKindExecutionContext['addRuntime'],
    cwd: '/tmp/wp-typia-pattern-repeatable-test',
    flags: {
      tag: ['featured', 'landing'],
      tags: ['hero,landing', 'gallery'],
    },
    getOrCreatePrompt: async () => {
      throw new Error('pattern add-kind should not prompt in this test');
    },
    isInteractiveSession: false,
    name: 'hero-photo',
    warnLine: () => {},
  });

  await plan.execute('/tmp/wp-typia-pattern-repeatable-test');

  expect(capturedOptions).toEqual([
    {
      cwd: '/tmp/wp-typia-pattern-repeatable-test',
      patternName: 'hero-photo',
      patternScope: undefined,
      sectionRole: undefined,
      tags: ['hero,landing', 'gallery', 'featured', 'landing'],
      thumbnailUrl: undefined,
    },
  ]);
});

test('surfaces core-variation runtime warnings through the add plan', async () => {
  const plan = await ADD_KIND_REGISTRY['core-variation'].prepareExecution({
    addRuntime: {
      runAddCoreVariationCommand: async () => ({
        projectDir: '/tmp/wp-typia-core-variation-warning-test',
        targetBlockName: 'core/groub',
        variationFile:
          'src/editor-plugins/core-variations/core/groub/typo-target.ts',
        variationSlug: 'typo-target',
        warnings: ['Unknown core variation target'],
      }),
    } as unknown as AddKindExecutionContext['addRuntime'],
    cwd: '/tmp/wp-typia-core-variation-warning-test',
    flags: {
      block: 'core/groub',
    },
    getOrCreatePrompt: async () => {
      throw new Error('core-variation add-kind should not prompt in this test');
    },
    isInteractiveSession: false,
    name: 'typo-target',
    warnLine: () => {},
  });

  const result = await plan.execute('/tmp/wp-typia-core-variation-warning-test');

  expect(plan.getWarnings?.(result)).toEqual([
    'Unknown core variation target',
  ]);
});

async function captureRestResourceRuntimeOptions(
  flags: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const capturedOptions: Record<string, unknown>[] = [];
  const plan = await ADD_KIND_REGISTRY['rest-resource'].prepareExecution({
    addRuntime: {
      runAddRestResourceCommand: async (options: Record<string, unknown>) => {
        capturedOptions.push(options);

        return {
          auth: 'public',
          method: 'POST',
          methods: [],
          mode: 'manual',
          namespace: 'demo/v1',
          pathPattern: '/integration-settings',
          projectDir: String(options.cwd),
          queryTypeName: 'IntegrationSettingsQuery',
          restResourceSlug: String(options.restResourceName),
          responseTypeName: 'IntegrationSettingsResponse',
          secretFieldName: String(options.secretFieldName),
          secretPreserveOnEmpty: options.secretPreserveOnEmpty as
            | boolean
            | undefined,
          secretStateFieldName: 'hasApiToken',
        };
      },
    } as unknown as AddKindExecutionContext['addRuntime'],
    cwd: '/tmp/wp-typia-rest-resource-test',
    flags: {
      manual: true,
      method: 'POST',
      'secret-field': 'apiToken',
      ...flags,
    },
    getOrCreatePrompt: async () => {
      throw new Error('rest-resource add-kind should not prompt in this test');
    },
    isInteractiveSession: false,
    name: 'integration-settings',
    warnLine: () => {},
  });

  await plan.execute('/tmp/wp-typia-rest-resource-test');

  return capturedOptions[0] ?? {};
}

test('normalizes manual REST secret preserve values before runtime execution', async () => {
  const cases = [
    {
      expected: false,
      flags: { 'secret-preserve-on-empty': 'false' },
    },
    {
      expected: true,
      flags: { secretPreserveOnEmpty: 'yes' },
    },
    {
      expected: false,
      flags: { secretPreserveOnEmpty: false },
    },
  ];

  for (const testCase of cases) {
    const options = await captureRestResourceRuntimeOptions(testCase.flags);
    expect(options.secretPreserveOnEmpty).toBe(testCase.expected);
  }
});

test('rejects invalid manual REST secret preserve values during preparation', async () => {
  await expect(
    ADD_KIND_REGISTRY['rest-resource'].prepareExecution({
      addRuntime: {} as AddKindExecutionContext['addRuntime'],
      cwd: '/tmp/wp-typia-rest-resource-test',
      flags: {
        manual: true,
        'secret-preserve-on-empty': 'sometimes',
      },
      getOrCreatePrompt: async () => {
        throw new Error('rest-resource add-kind should not prompt in this test');
      },
      isInteractiveSession: false,
      name: 'integration-settings',
      warnLine: () => {},
    }),
  ).rejects.toThrow(
    'Manual REST contract --secret-preserve-on-empty must be true or false.',
  );
});

test('keeps shared add-kind ids aligned with registry sort order', () => {
  expect(
    Object.entries(ADD_KIND_REGISTRY)
      .sort(([, left], [, right]) => left.sortOrder - right.sortOrder)
      .map(([kind]) => kind),
  ).toEqual([...ADD_KIND_IDS]);
});

test('keeps shared visible-field groups aligned for refactored add kinds', () => {
  expect(getAddVisibleFieldNames({ kind: 'admin-view' })).toEqual([
    'kind',
    'name',
    'source',
  ]);
  expect(getAddVisibleFieldNames({ kind: 'integration-env' })).toEqual([
    'kind',
    'name',
  ]);
  expect(getAddVisibleFieldNames({ kind: 'style' })).toEqual([
    'kind',
    'name',
    'block',
  ]);
  expect(getAddVisibleFieldNames({ kind: 'core-variation' })).toEqual([
    'kind',
    'name',
    'block',
  ]);
  expect(getAddVisibleFieldNames({ kind: 'variation' })).toEqual([
    'kind',
    'name',
    'block',
  ]);
  expect(getAddVisibleFieldNames({ kind: 'transform' })).toEqual([
    'kind',
    'name',
    'from',
    'to',
  ]);
  expect(getAddVisibleFieldNames({ kind: 'hooked-block' })).toEqual([
    'kind',
    'name',
    'anchor',
    'position',
  ]);
  expect(getAddVisibleFieldNames({ kind: 'contract' })).toEqual([
    'kind',
    'name',
    'type',
  ]);
  expect(getAddVisibleFieldNames({ kind: 'post-meta' })).toEqual([
    'kind',
    'name',
    'post-type',
    'type',
  ]);
  expect(getAddVisibleFieldNames({ kind: 'binding-source' })).toEqual([
    'kind',
    'name',
    'block',
    'attribute',
    'post-meta',
    'meta-path',
  ]);
  expect(getAddVisibleFieldNames({ kind: 'block', template: 'basic' })).toEqual(
    ['kind', 'name', 'template'],
  );
  expect(
    getAddVisibleFieldNames({ kind: 'block', template: 'compound' }),
  ).toEqual([
    'kind',
    'name',
    'template',
    'alternate-render-targets',
    'inner-blocks-preset',
    'data-storage',
    'persistence-policy',
  ]);
});

const warnLinePlanFixtures = {
  'admin-view': {
    flags: {},
    name: 'sample-admin-view',
  },
  ability: {
    flags: {},
    name: 'sample-ability',
  },
  'ai-feature': {
    flags: {},
    name: 'sample-ai-feature',
  },
  'binding-source': {
    flags: {},
    name: 'sample-binding-source',
  },
  block: {
    flags: {},
    name: 'sample-block',
  },
  contract: {
    flags: {},
    name: 'sample-contract',
  },
  'core-variation': {
    flags: {
      block: 'core/group',
    },
    name: 'sample-core-variation',
  },
  'integration-env': {
    flags: {},
    name: 'sample-integration-env',
  },
  'editor-plugin': {
    flags: {},
    name: 'sample-editor-plugin',
  },
  'hooked-block': {
    flags: {
      anchor: 'core/post-content',
      position: 'after',
    },
    name: 'sample-block',
  },
  pattern: {
    flags: {},
    name: 'sample-pattern',
  },
  'rest-resource': {
    flags: {},
    name: 'sample-rest-resource',
  },
  'post-meta': {
    flags: {
      'post-type': 'post',
    },
    name: 'sample-post-meta',
  },
  style: {
    flags: {
      block: 'sample-block',
    },
    name: 'sample-style',
  },
  transform: {
    flags: {
      from: 'core/paragraph',
      to: 'sample/block',
    },
    name: 'sample-transform',
  },
  variation: {
    flags: {
      block: 'sample-block',
    },
    name: 'sample-variation',
  },
} satisfies Record<
  AddKindId,
  {
    flags: Record<string, unknown>;
    name: string;
  }
>;

test('passes the warning line printer through every add-kind execution plan', async () => {
  const warnLine = () => {};
  const planWarnLineResults = Object.fromEntries(
    await Promise.all(
      ADD_KIND_IDS.map(async (kind) => {
        const fixture = warnLinePlanFixtures[kind];
        const plan = await ADD_KIND_REGISTRY[kind].prepareExecution({
          addRuntime: {} as AddKindExecutionContext['addRuntime'],
          cwd: `/tmp/wp-typia-${kind}-test`,
          flags: fixture.flags,
          getOrCreatePrompt: async () => {
            throw new Error(`${kind} add-kind should not prompt in this test`);
          },
          isInteractiveSession: false,
          name: fixture.name,
          warnLine,
        });

        return [kind, plan.warnLine === warnLine];
      }),
    ),
  );

  expect(planWarnLineResults).toEqual({
    'admin-view': true,
    ability: true,
    'ai-feature': true,
    'binding-source': true,
    block: true,
    contract: true,
    'core-variation': true,
    'integration-env': true,
    'editor-plugin': true,
    'hooked-block': true,
    pattern: true,
    'post-meta': true,
    'rest-resource': true,
    style: true,
    transform: true,
    variation: true,
  });
});
