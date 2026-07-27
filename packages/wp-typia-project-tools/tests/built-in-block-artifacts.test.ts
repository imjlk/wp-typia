import { afterAll, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  cleanupScaffoldTempRoot,
  createScaffoldTempRoot,
} from './helpers/scaffold-test-harness.js';
import {
  buildBuiltInBlockArtifacts,
  stringifyBuiltInBlockJsonDocument,
} from '../src/runtime/built-in-block-artifacts.js';
import {
  buildBlockJsonExampleAttributes,
  type EmittedAttributeDefinition,
} from '../src/runtime/templates/built-in-block-artifact-documents.js';
import { buildBuiltInCodeArtifacts } from '../src/runtime/built-in-block-code-artifacts.js';
import {
  getBuiltInTemplateLayerDirs,
  isOmittableBuiltInTemplateLayerDir,
} from '../src/runtime/template-builtins.js';
import {
  buildTemplateVariablesFromBlockSpec,
  createBuiltInBlockSpec,
} from '../src/runtime/block-generator-service.js';
import { scaffoldProject } from '../src/runtime/index.js';
import { transformPackageManagerText } from '../src/runtime/package-managers.js';
import { stringifyStarterManifest } from '../src/runtime/starter-manifests.js';
import {
  getTemplateById,
  type BuiltInTemplateId,
} from '../src/runtime/template-registry.js';
import type { ScaffoldAnswers } from '../src/runtime/scaffold.js';

const templatesRoot = path.resolve(import.meta.dir, '..', 'templates');

function buildAnswers(templateId: BuiltInTemplateId): ScaffoldAnswers {
  return {
    author: 'Emitter Test',
    dataStorageMode:
      templateId === 'persistence' || templateId === 'compound'
        ? 'post-meta'
        : undefined,
    description: `Demo ${templateId} block`,
    namespace: 'demo-space',
    persistencePolicy:
      templateId === 'persistence' || templateId === 'compound'
        ? 'public'
        : undefined,
    phpPrefix: 'demo_space',
    slug: `demo-${templateId}`,
    textDomain: 'demo-space',
    title: `Demo ${templateId[0]!.toUpperCase()}${templateId.slice(1)}`,
  };
}

function buildArtifacts(templateId: BuiltInTemplateId) {
  const answers = buildAnswers(templateId);
  const spec = createBuiltInBlockSpec({
    answers,
    dataStorageMode: answers.dataStorageMode,
    persistencePolicy: answers.persistencePolicy,
    templateId,
  });
  const variables = buildTemplateVariablesFromBlockSpec(spec);

  return {
    artifacts: buildBuiltInBlockArtifacts({
      templateId,
      variables,
    }),
    codeArtifacts: buildBuiltInCodeArtifacts({
      templateId,
      variables,
    }),
    answers,
    variables,
  };
}

function buildExampleAttribute({
  constraints,
  kind,
  name,
}: {
  constraints: EmittedAttributeDefinition['manifest']['constraints'];
  kind: EmittedAttributeDefinition['manifest']['kind'];
  name: string;
}): EmittedAttributeDefinition {
  return {
    blockJson: {
      type: kind,
    },
    manifest: {
      constraints,
      enumValues: null,
      kind,
      required: true,
      selector: null,
      source: null,
      sourceType: kind,
    },
    name,
    optional: false,
    typeExpression: kind,
  };
}

function summarizeArtifactAttributes(
  artifact: ReturnType<typeof buildArtifacts>['artifacts'][number],
) {
  const blockJsonAttributes =
    (artifact.blockJsonDocument.attributes as
      | Record<string, Record<string, unknown>>
      | undefined) ?? {};
  const manifestAttributes = artifact.manifestDocument.attributes ?? {};

  return {
    attributes: Object.fromEntries(
      Object.keys(blockJsonAttributes).map((name) => [
        name,
        {
          blockJson: blockJsonAttributes[name],
          manifest: {
            defaultValue: manifestAttributes[name]?.typia.defaultValue ?? null,
            required: manifestAttributes[name]?.ts.required ?? null,
            selector: manifestAttributes[name]?.wp.selector ?? null,
            source: manifestAttributes[name]?.wp.source ?? null,
            type: manifestAttributes[name]?.wp.type ?? null,
          },
        },
      ]),
    ),
    relativeDir: artifact.relativeDir,
    sourceType: artifact.manifestDocument.sourceType,
  };
}

type ArtifactAttributeSummary = ReturnType<typeof summarizeArtifactAttributes>;
type CodeArtifactHashSummary = Record<string, string>;
const SNAPSHOT_TEMPLATE_IDS = [
  'basic',
  'interactivity',
  'persistence',
  'compound',
] as const satisfies ReadonlyArray<BuiltInTemplateId>;

const EXPECTED_ARTIFACT_ATTRIBUTE_SUMMARIES: Record<
  (typeof SNAPSHOT_TEMPLATE_IDS)[number],
  ArtifactAttributeSummary[]
> = {
  basic: [
    {
      attributes: {
        alignment: {
          blockJson: {
            default: 'left',
            enum: ['left', 'center', 'right', 'justify'],
            type: 'string',
          },
          manifest: {
            defaultValue: 'left',
            required: false,
            selector: null,
            source: null,
            type: 'string',
          },
        },
        className: {
          blockJson: {
            default: '',
            type: 'string',
          },
          manifest: {
            defaultValue: '',
            required: false,
            selector: null,
            source: null,
            type: 'string',
          },
        },
        content: {
          blockJson: {
            default: '',
            type: 'string',
          },
          manifest: {
            defaultValue: '',
            required: true,
            selector: null,
            source: null,
            type: 'string',
          },
        },
        id: {
          blockJson: {
            type: 'string',
          },
          manifest: {
            defaultValue: null,
            required: false,
            selector: null,
            source: null,
            type: 'string',
          },
        },
        isVisible: {
          blockJson: {
            default: true,
            type: 'boolean',
          },
          manifest: {
            defaultValue: true,
            required: false,
            selector: null,
            source: null,
            type: 'boolean',
          },
        },
        schemaVersion: {
          blockJson: {
            default: 1,
            type: 'number',
          },
          manifest: {
            defaultValue: 1,
            required: false,
            selector: null,
            source: null,
            type: 'number',
          },
        },
      },
      relativeDir: 'src',
      sourceType: 'DemoBasicAttributes',
    },
  ],
  compound: [
    {
      attributes: {
        buttonLabel: {
          blockJson: {
            default: 'Persist Count',
            type: 'string',
          },
          manifest: {
            defaultValue: 'Persist Count',
            required: false,
            selector: null,
            source: null,
            type: 'string',
          },
        },
        heading: {
          blockJson: {
            default: 'Demo Compound',
            selector: '.wp-block-demo-space-demo-compound__heading',
            source: 'html',
            type: 'string',
          },
          manifest: {
            defaultValue: 'Demo Compound',
            required: true,
            selector: '.wp-block-demo-space-demo-compound__heading',
            source: 'html',
            type: 'string',
          },
        },
        intro: {
          blockJson: {
            default:
              'Add and reorder internal items inside this compound block.',
            selector: '.wp-block-demo-space-demo-compound__intro',
            source: 'html',
            type: 'string',
          },
          manifest: {
            defaultValue:
              'Add and reorder internal items inside this compound block.',
            required: false,
            selector: '.wp-block-demo-space-demo-compound__intro',
            source: 'html',
            type: 'string',
          },
        },
        resourceKey: {
          blockJson: {
            type: 'string',
          },
          manifest: {
            defaultValue: null,
            required: false,
            selector: null,
            source: null,
            type: 'string',
          },
        },
        showCount: {
          blockJson: {
            default: true,
            type: 'boolean',
          },
          manifest: {
            defaultValue: true,
            required: false,
            selector: null,
            source: null,
            type: 'boolean',
          },
        },
        showDividers: {
          blockJson: {
            default: true,
            type: 'boolean',
          },
          manifest: {
            defaultValue: true,
            required: false,
            selector: null,
            source: null,
            type: 'boolean',
          },
        },
      },
      relativeDir: 'src/blocks/demo-compound',
      sourceType: 'DemoCompoundAttributes',
    },
    {
      attributes: {
        body: {
          blockJson: {
            default: 'Add supporting details for this internal item.',
            selector: '.wp-block-demo-space-demo-compound-item__body',
            source: 'html',
            type: 'string',
          },
          manifest: {
            defaultValue: 'Add supporting details for this internal item.',
            required: true,
            selector: '.wp-block-demo-space-demo-compound-item__body',
            source: 'html',
            type: 'string',
          },
        },
        title: {
          blockJson: {
            default: 'Demo Compound Item',
            selector: '.wp-block-demo-space-demo-compound-item__title',
            source: 'html',
            type: 'string',
          },
          manifest: {
            defaultValue: 'Demo Compound Item',
            required: true,
            selector: '.wp-block-demo-space-demo-compound-item__title',
            source: 'html',
            type: 'string',
          },
        },
      },
      relativeDir: 'src/blocks/demo-compound-item',
      sourceType: 'DemoCompoundItemAttributes',
    },
  ],
  interactivity: [
    {
      attributes: {
        alignment: {
          blockJson: {
            default: 'left',
            enum: ['left', 'center', 'right', 'justify'],
            type: 'string',
          },
          manifest: {
            defaultValue: 'left',
            required: false,
            selector: null,
            source: null,
            type: 'string',
          },
        },
        animation: {
          blockJson: {
            default: 'none',
            enum: ['none', 'bounce', 'pulse', 'shake', 'flip'],
            type: 'string',
          },
          manifest: {
            defaultValue: 'none',
            required: false,
            selector: null,
            source: null,
            type: 'string',
          },
        },
        clickCount: {
          blockJson: {
            default: 0,
            type: 'number',
          },
          manifest: {
            defaultValue: 0,
            required: false,
            selector: null,
            source: null,
            type: 'number',
          },
        },
        content: {
          blockJson: {
            default: '',
            selector: '.wp-block-demo-space-demo-interactivity__content',
            source: 'html',
            type: 'string',
          },
          manifest: {
            defaultValue: '',
            required: true,
            selector: '.wp-block-demo-space-demo-interactivity__content',
            source: 'html',
            type: 'string',
          },
        },
        interactiveMode: {
          blockJson: {
            default: 'click',
            enum: ['click', 'hover'],
            type: 'string',
          },
          manifest: {
            defaultValue: 'click',
            required: false,
            selector: null,
            source: null,
            type: 'string',
          },
        },
        isAnimating: {
          blockJson: {
            default: false,
            type: 'boolean',
          },
          manifest: {
            defaultValue: false,
            required: false,
            selector: null,
            source: null,
            type: 'boolean',
          },
        },
        isVisible: {
          blockJson: {
            default: true,
            type: 'boolean',
          },
          manifest: {
            defaultValue: true,
            required: false,
            selector: null,
            source: null,
            type: 'boolean',
          },
        },
        maxClicks: {
          blockJson: {
            default: 10,
            type: 'number',
          },
          manifest: {
            defaultValue: 10,
            required: false,
            selector: null,
            source: null,
            type: 'number',
          },
        },
        showCounter: {
          blockJson: {
            default: true,
            type: 'boolean',
          },
          manifest: {
            defaultValue: true,
            required: false,
            selector: null,
            source: null,
            type: 'boolean',
          },
        },
      },
      relativeDir: 'src',
      sourceType: 'DemoInteractivityAttributes',
    },
  ],
  persistence: [
    {
      attributes: {
        alignment: {
          blockJson: {
            default: 'left',
            enum: ['left', 'center', 'right', 'justify'],
            type: 'string',
          },
          manifest: {
            defaultValue: 'left',
            required: false,
            selector: null,
            source: null,
            type: 'string',
          },
        },
        buttonLabel: {
          blockJson: {
            default: 'Persist Count',
            type: 'string',
          },
          manifest: {
            defaultValue: 'Persist Count',
            required: false,
            selector: null,
            source: null,
            type: 'string',
          },
        },
        content: {
          blockJson: {
            default: 'Demo Persistence persistence block',
            selector: '.wp-block-demo-space-demo-persistence__content',
            source: 'html',
            type: 'string',
          },
          manifest: {
            defaultValue: 'Demo Persistence persistence block',
            required: true,
            selector: '.wp-block-demo-space-demo-persistence__content',
            source: 'html',
            type: 'string',
          },
        },
        isVisible: {
          blockJson: {
            default: true,
            type: 'boolean',
          },
          manifest: {
            defaultValue: true,
            required: false,
            selector: null,
            source: null,
            type: 'boolean',
          },
        },
        resourceKey: {
          blockJson: {
            type: 'string',
          },
          manifest: {
            defaultValue: null,
            required: false,
            selector: null,
            source: null,
            type: 'string',
          },
        },
        showCount: {
          blockJson: {
            default: true,
            type: 'boolean',
          },
          manifest: {
            defaultValue: true,
            required: false,
            selector: null,
            source: null,
            type: 'boolean',
          },
        },
      },
      relativeDir: 'src',
      sourceType: 'DemoPersistenceAttributes',
    },
  ],
};

function summarizeCodeArtifacts(
  codeArtifacts: ReturnType<typeof buildArtifacts>['codeArtifacts'],
): CodeArtifactHashSummary {
  return Object.fromEntries(
    codeArtifacts.map((artifact) => [
      artifact.relativePath,
      createHash('sha256').update(artifact.source).digest('hex').slice(0, 16),
    ]),
  );
}

const EXPECTED_CODE_ARTIFACT_HASH_SUMMARIES: Record<
  (typeof SNAPSHOT_TEMPLATE_IDS)[number],
  CodeArtifactHashSummary
> = {
  basic: {
    'src/block-metadata.ts': '50956333a97a824a',
    'src/edit.tsx': '74ff8f4d6fc9e8ac',
    'src/editor.scss': 'd0287f8349249da4',
    'src/hooks.ts': 'e95dea31e16a6ec7',
    'src/index.tsx': '0acf1831bfb24ac1',
    'src/manifest-defaults-document.ts': '16818959f3d5a7d6',
    'src/manifest-document.ts': 'b8fffee2c728488e',
    'src/render.php': 'cfa163e5806011fb',
    'src/save.tsx': '7cd5f465672f0907',
    'src/style.scss': '6e77df2f2a7aac8f',
    'src/validators.ts': '2177d8be82a6eabc',
  },
  interactivity: {
    'src/block-metadata.ts': '50956333a97a824a',
    'src/edit.tsx': '8c82bfd9888d0c5e',
    'src/editor.scss': '7da532bf2acdc7c1',
    'src/hooks.ts': 'e95dea31e16a6ec7',
    'src/index.tsx': '339921f3d9acdafe',
    'src/interactivity-store.ts': '1fd02a161c5c86fa',
    'src/interactivity.ts': '36f76ed153e02cdc',
    'src/manifest-defaults-document.ts': '16818959f3d5a7d6',
    'src/manifest-document.ts': 'b8fffee2c728488e',
    'src/save.tsx': '9e3f69db9ff3ed24',
    'src/style.scss': '7d77511799b41826',
    'src/validators.ts': 'f02f2f0d77bdbfe8',
  },
  persistence: {
    'src/block-metadata.ts': '50956333a97a824a',
    'src/edit.tsx': 'daee524b53c70327',
    'src/hooks.ts': 'e95dea31e16a6ec7',
    'src/index.tsx': 'b18acd5e44a4c395',
    'src/interactivity.ts': '80a54fdedd633e62',
    'src/manifest-defaults-document.ts': '16818959f3d5a7d6',
    'src/manifest-document.ts': 'b8fffee2c728488e',
    'src/render.php': '7c378bd44328c706',
    'src/save.tsx': '512a513b9145e649',
    'src/style.scss': 'a48f3de45038a032',
    'src/validators.ts': 'b419801aff987f63',
  },
  compound: {
    'src/blocks/demo-compound-item/block-metadata.ts': '50956333a97a824a',
    'src/blocks/demo-compound-item/edit.tsx': '5a85be1c020db77d',
    'src/blocks/demo-compound-item/hooks.ts': '35d4b1ace23be502',
    'src/blocks/demo-compound-item/index.tsx': '4a8f2225b2554197',
    'src/blocks/demo-compound-item/manifest-defaults-document.ts':
      '16818959f3d5a7d6',
    'src/blocks/demo-compound-item/manifest-document.ts': 'b8fffee2c728488e',
    'src/blocks/demo-compound-item/save.tsx': 'ad030c7483974d40',
    'src/blocks/demo-compound-item/validators.ts': 'dc2339e1f385b488',
    'src/blocks/demo-compound/block-metadata.ts': '50956333a97a824a',
    'src/blocks/demo-compound/children.ts': 'f8d50660204c3e32',
    'src/blocks/demo-compound/edit.tsx': '92a0bfc9f42d58c4',
    'src/blocks/demo-compound/hooks.ts': '35d4b1ace23be502',
    'src/blocks/demo-compound/index.tsx': 'e41dfb0b954670a5',
    'src/blocks/demo-compound/interactivity.ts': '410af411505e7cae',
    'src/blocks/demo-compound/manifest-defaults-document.ts':
      '16818959f3d5a7d6',
    'src/blocks/demo-compound/manifest-document.ts': 'b8fffee2c728488e',
    'src/blocks/demo-compound/render.php': '945ae15d97cb040d',
    'src/blocks/demo-compound/save.tsx': 'fa8ce0becc59866b',
    'src/blocks/demo-compound/style.scss': '5a079051191f8cb7',
    'src/blocks/demo-compound/validators.ts': '1f30c9542389b9f0',
    'src/hooks.ts': 'e95dea31e16a6ec7',
  },
};

describe('built-in block artifacts', () => {
  const tempRoot = createScaffoldTempRoot('wp-typia-built-in-artifacts-');

  afterAll(() => {
    cleanupScaffoldTempRoot(tempRoot);
  });

  test('block preview examples honor constraints and structured kinds', () => {
    expect(
      buildBlockJsonExampleAttributes([
        buildExampleAttribute({
          constraints: { format: 'email' },
          kind: 'string',
          name: 'contactEmail',
        }),
        buildExampleAttribute({
          constraints: { minLength: 32 },
          kind: 'string',
          name: 'summary',
        }),
        buildExampleAttribute({
          constraints: { exclusiveMinimum: 5, maximum: 5.5 },
          kind: 'number',
          name: 'count',
        }),
        buildExampleAttribute({
          constraints: { format: 'duration', minLength: 20 },
          kind: 'string',
          name: 'duration',
        }),
        buildExampleAttribute({
          constraints: {},
          kind: 'array',
          name: 'items',
        }),
        buildExampleAttribute({
          constraints: {},
          kind: 'object',
          name: 'settings',
        }),
        buildExampleAttribute({
          constraints: {},
          kind: 'union',
          name: 'choice',
        }),
      ]),
    ).toEqual({
      choice: null,
      contactEmail: 'example@example.com',
      count: 5.25,
      duration: 'Example duration____',
      items: [],
      settings: {},
      summary: 'Example summary_________________',
    });
  });

	test('built-in code artifact assembly keeps template bodies in family modules', () => {
		const assemblySource = fs.readFileSync(
			path.join(
				import.meta.dir,
				'..',
				'src/runtime/templates/built-in-block-code-artifacts.ts',
			),
			'utf8',
		);
		const templateBarrelSource = fs.readFileSync(
			path.join(
				import.meta.dir,
				'..',
				'src/runtime/templates/built-in-block-code-templates.ts',
			),
			'utf8',
		);
		const basicTemplateSource = fs.readFileSync(
			path.join(
				import.meta.dir,
				'..',
				'src/runtime/templates/built-in-block-code-templates/basic.ts',
			),
			'utf8',
		);
		const compoundTemplateSource = fs.readFileSync(
			path.join(
				import.meta.dir,
				'..',
				'src/runtime/templates/built-in-block-code-templates/compound.ts',
			),
			'utf8',
		);
		const compoundParentTemplateSource = fs.readFileSync(
			path.join(
				import.meta.dir,
				'..',
				'src/runtime/templates/built-in-block-code-templates/compound-parent.ts',
			),
			'utf8',
		);
		const compoundChildTemplateSource = fs.readFileSync(
			path.join(
				import.meta.dir,
				'..',
				'src/runtime/templates/built-in-block-code-templates/compound-child.ts',
			),
			'utf8',
		);
		const compoundPersistenceTemplateSource = fs.readFileSync(
			path.join(
				import.meta.dir,
				'..',
				'src/runtime/templates/built-in-block-code-templates/compound-persistence.ts',
			),
			'utf8',
		);

    expect(assemblySource).toContain(
      "from './built-in-block-code-templates.js'",
    );
    expect(assemblySource).not.toContain('const BASIC_EDIT_TEMPLATE =');
    expect(assemblySource).not.toContain('const PERSISTENCE_EDIT_TEMPLATE =');
    expect(templateBarrelSource).toContain(
      "from './built-in-block-code-templates/basic.js'",
    );
    expect(templateBarrelSource).toContain(
      "from './built-in-block-code-templates/compound.js'",
    );
    expect(basicTemplateSource).toContain('export const BASIC_EDIT_TEMPLATE =');
    expect(compoundTemplateSource).toContain("from './compound-parent.js'");
    expect(compoundTemplateSource).toContain("from './compound-child.js'");
    expect(compoundTemplateSource).toContain(
      "from './compound-persistence.js'",
    );
    expect(compoundTemplateSource).not.toContain(
      'export const COMPOUND_PERSISTENCE_PARENT_INTERACTIVITY_TEMPLATE =',
    );
    expect(compoundParentTemplateSource).toContain(
      'export const COMPOUND_PARENT_EDIT_TEMPLATE =',
    );
    expect(compoundChildTemplateSource).toContain(
      'export const COMPOUND_CHILD_EDIT_TEMPLATE =',
    );
    expect(compoundPersistenceTemplateSource).toContain(
      'export const COMPOUND_PERSISTENCE_PARENT_INTERACTIVITY_TEMPLATE =',
    );
  });

  test.each([...SNAPSHOT_TEMPLATE_IDS])(
    'buildBuiltInCodeArtifacts preserves output hashes for %s',
    (templateId) => {
      const { codeArtifacts } = buildArtifacts(templateId);

      expect(summarizeCodeArtifacts(codeArtifacts)).toEqual(
        EXPECTED_CODE_ARTIFACT_HASH_SUMMARIES[templateId],
      );
    },
  );

  test('persistence identity prefixes stay within resourceKey limits for long slugs', () => {
    const longSlug = `persistence-${'x'.repeat(96)}`;
    const expectedPrefix = longSlug.slice(0, 90);

    expect(expectedPrefix).toHaveLength(90);
    expect(longSlug.length).toBeGreaterThan(expectedPrefix.length);

    for (const templateId of ['persistence', 'compound'] as const) {
      const answers = {
        ...buildAnswers(templateId),
        phpPrefix: 'demo_space',
        slug: longSlug,
      };
      const spec = createBuiltInBlockSpec({
        answers,
        dataStorageMode: answers.dataStorageMode,
        persistencePolicy: answers.persistencePolicy,
        templateId,
      });
      const variables = buildTemplateVariablesFromBlockSpec(spec);
      const codeArtifacts = buildBuiltInCodeArtifacts({
        templateId,
        variables,
      });
      const basePath =
        templateId === 'compound' ? `src/blocks/${longSlug}` : 'src';
      const editSource = codeArtifacts.find(
        (artifact) => artifact.relativePath === `${basePath}/edit.tsx`,
      )?.source;
      const interactivitySource = codeArtifacts.find(
        (artifact) => artifact.relativePath === `${basePath}/interactivity.ts`,
      )?.source;
      const validatorsSource = codeArtifacts.find(
        (artifact) => artifact.relativePath === `${basePath}/validators.ts`,
      )?.source;

      expect(variables.slugKebabCase).toBe(longSlug);
      expect(editSource).toContain(
        `blockName: '${variables.namespace}/${longSlug}'`,
      );
      expect(editSource).toContain(`prefix: '${expectedPrefix}'`);
      expect(editSource).not.toContain(`prefix: '${longSlug}'`);
      expect(validatorsSource).toContain(
        `generateResourceKey('${expectedPrefix}')`,
      );
      expect(interactivitySource).toContain(`store('${longSlug}', {`);
    }
  });

  test('generated TS7 sources keep safe selector casts and width-stable imports', () => {
    for (const templateId of ['persistence', 'compound'] as const) {
      const { codeArtifacts } = buildArtifacts(templateId);
      const editSource = codeArtifacts.find(
        (artifact) =>
          artifact.relativePath.endsWith('/edit.tsx') ||
          artifact.relativePath === 'src/edit.tsx',
      )?.source;

      expect(editSource).toContain(
        'select(blockEditorStore) as unknown as {',
      );
    }

    const { codeArtifacts: compoundArtifacts } = buildArtifacts('compound');
    const compoundInteractivitySource = compoundArtifacts.find(
      (artifact) =>
        artifact.relativePath ===
        'src/blocks/demo-compound/interactivity.ts',
    )?.source;
    expect(compoundInteractivitySource).toContain(
      "import type { DemoCompoundWriteStateRequest } from './api-types';",
    );
    expect(compoundInteractivitySource).toContain('const request = {');
    expect(compoundInteractivitySource).toContain(
      "as DemoCompoundWriteStateRequest['publicWriteRequestId'];",
    );

    const answers = {
      ...buildAnswers('interactivity'),
      slug: 'smoke-interactivity-pnpm',
    };
    const spec = createBuiltInBlockSpec({
      answers,
      templateId: 'interactivity',
    });
    const variables = buildTemplateVariablesFromBlockSpec(spec);
    const codeArtifacts = buildBuiltInCodeArtifacts({
      templateId: 'interactivity',
      variables,
    });

    for (const relativePath of [
      'src/interactivity-store.ts',
      'src/interactivity.ts',
    ]) {
      const source = codeArtifacts.find(
        (artifact) => artifact.relativePath === relativePath,
      )?.source;

      expect(source).toContain(
        "import type {\n  SmokeInteractivityPnpmContext,\n  SmokeInteractivityPnpmState,\n} from './types';",
      );
    }
  });

  test('built-in template trees no longer ship structural Mustache files', () => {
    for (const relativePath of [
      'basic/src/types.ts.mustache',
      'basic/src/block.json.mustache',
      'basic/src/hooks.ts.mustache',
      'basic/src/edit.tsx.mustache',
      'basic/src/save.tsx.mustache',
      'basic/src/index.tsx.mustache',
      'basic/src/validators.ts.mustache',
      'basic/src/editor.scss.mustache',
      'basic/src/style.scss.mustache',
      'basic/src/render.php.mustache',
      'interactivity/src/types.ts.mustache',
      'interactivity/src/block.json.mustache',
      'interactivity/src/edit.tsx.mustache',
      'interactivity/src/save.tsx.mustache',
      'interactivity/src/index.tsx.mustache',
      'interactivity/src/interactivity.ts.mustache',
      'interactivity/src/validators.ts.mustache',
      'interactivity/src/editor.scss.mustache',
      'interactivity/src/style.scss.mustache',
      'persistence/src/types.ts.mustache',
      'persistence/src/block.json.mustache',
      'persistence/src/edit.tsx.mustache',
      'persistence/src/style.scss.mustache',
      'persistence/src/render.php.mustache',
      '_shared/base/src/hooks.ts.mustache',
      '_shared/persistence/core/src/index.tsx.mustache',
      '_shared/persistence/core/src/save.tsx.mustache',
      '_shared/persistence/core/src/interactivity.ts.mustache',
      '_shared/persistence/core/src/validators.ts.mustache',
      'compound/src/blocks/{{slugKebabCase}}/types.ts.mustache',
      'compound/src/blocks/{{slugKebabCase}}/block.json.mustache',
      'compound/src/blocks/{{slugKebabCase}}/edit.tsx.mustache',
      'compound/src/blocks/{{slugKebabCase}}/save.tsx.mustache',
      'compound/src/blocks/{{slugKebabCase}}/index.tsx.mustache',
      'compound/src/blocks/{{slugKebabCase}}/hooks.ts.mustache',
      'compound/src/blocks/{{slugKebabCase}}/validators.ts.mustache',
      'compound/src/blocks/{{slugKebabCase}}/children.ts.mustache',
      'compound/src/blocks/{{slugKebabCase}}-item/types.ts.mustache',
      'compound/src/blocks/{{slugKebabCase}}-item/block.json.mustache',
      'compound/src/blocks/{{slugKebabCase}}-item/edit.tsx.mustache',
      'compound/src/blocks/{{slugKebabCase}}-item/save.tsx.mustache',
      'compound/src/blocks/{{slugKebabCase}}-item/index.tsx.mustache',
      'compound/src/blocks/{{slugKebabCase}}-item/hooks.ts.mustache',
      'compound/src/blocks/{{slugKebabCase}}-item/validators.ts.mustache',
      '_shared/compound/persistence/src/blocks/{{slugKebabCase}}/types.ts.mustache',
      '_shared/compound/persistence/src/blocks/{{slugKebabCase}}/block.json.mustache',
      '_shared/compound/persistence/src/blocks/{{slugKebabCase}}/edit.tsx.mustache',
      '_shared/compound/persistence/src/blocks/{{slugKebabCase}}/save.tsx.mustache',
      '_shared/compound/persistence/src/blocks/{{slugKebabCase}}/hooks.ts.mustache',
      '_shared/compound/persistence/src/blocks/{{slugKebabCase}}/validators.ts.mustache',
      '_shared/compound/persistence/src/blocks/{{slugKebabCase}}/interactivity.ts.mustache',
      '_shared/compound/persistence/src/blocks/{{slugKebabCase}}/render.php.mustache',
      'compound/src/blocks/{{slugKebabCase}}/style.scss.mustache',
    ]) {
      expect(fs.existsSync(path.join(templatesRoot, relativePath))).toBe(false);
    }
  });

  test.each([
    ['basic', 1],
    ['interactivity', 1],
    ['persistence', 1],
    ['compound', 2],
  ] as const)(
    'buildBuiltInBlockArtifacts emits stable structural artifacts for %s',
    (templateId, expectedCount) => {
      const { artifacts, variables } = buildArtifacts(templateId);

      expect(artifacts).toHaveLength(expectedCount);
      expect(artifacts[0]?.typesSource.endsWith('\n')).toBe(true);
      expect(
        JSON.parse(
          stringifyBuiltInBlockJsonDocument(artifacts[0]!.blockJsonDocument),
        ),
      ).toEqual(artifacts[0]!.blockJsonDocument);

      if (templateId === 'basic') {
        expect(artifacts[0]?.relativeDir).toBe('src');
        expect(artifacts[0]?.typesSource).toContain(
          `export interface ${variables.pascalCase}Attributes`,
        );
        expect(artifacts[0]?.typesSource).toContain(
          "tags.MaxLength<1000> & tags.Default<''>",
        );
        expect(artifacts[0]?.typesSource).not.toContain(
          "tags.MinLength<1> & tags.MaxLength<1000> & tags.Default<''>",
        );
        expect(artifacts[0]?.typesSource).toContain(
          "import type { TextAlignment } from '@wp-typia/block-types/block-editor/alignment';",
        );
        expect(artifacts[0]?.blockJsonDocument).toEqual(
          expect.objectContaining({
            name: `${variables.namespace}/${variables.slug}`,
            textdomain: variables.textDomain,
          }),
        );
      }

      if (templateId === 'interactivity') {
        expect(artifacts[0]?.typesSource).toContain(
          `export interface ${variables.pascalCase}Context`,
        );
        expect(artifacts[0]?.typesSource).toContain(
          "tags.MaxLength<1000> & tags.Default<''>",
        );
        expect(artifacts[0]?.typesSource).not.toContain(
          "tags.MinLength<1> & tags.MaxLength<1000> & tags.Default<''>",
        );
        expect(artifacts[0]?.blockJsonDocument).toEqual(
          expect.objectContaining({
            viewScriptModule: 'file:./interactivity.js',
          }),
        );
      }

      if (templateId === 'persistence') {
        const persistenceArtifact = artifacts[0]!;
        const resourceKeyAttribute =
          persistenceArtifact.manifestDocument.attributes?.['resourceKey'];
        const resourceKeyBlockJson = (
          persistenceArtifact.blockJsonDocument.attributes as
            | Record<string, Record<string, unknown>>
            | undefined
        )?.resourceKey;

        expect(persistenceArtifact.typesSource).toContain(
          `export interface ${variables.pascalCase}ClientState`,
        );
        expect(persistenceArtifact.blockJsonDocument).toEqual(
          expect.objectContaining({
            render: 'file:./render.php',
            viewScriptModule: 'file:./interactivity.js',
          }),
        );
        expect(resourceKeyAttribute?.typia.hasDefault).toBe(false);
        expect(resourceKeyAttribute?.typia.defaultValue).toBeNull();
        expect(resourceKeyBlockJson).not.toHaveProperty('default');
        expect(persistenceArtifact.typesSource).not.toContain(
          'tags.Default<"primary">',
        );
      }

      if (templateId === 'compound') {
        const parentResourceKeyBlockJson = (
          artifacts[0]?.blockJsonDocument.attributes as
            | Record<string, Record<string, unknown>>
            | undefined
        )?.resourceKey;

        expect(artifacts[0]?.relativeDir).toBe(
          `src/blocks/${variables.slugKebabCase}`,
        );
        expect(artifacts[1]?.relativeDir).toBe(
          `src/blocks/${variables.slugKebabCase}-item`,
        );
        expect(artifacts[0]?.typesSource).toContain(
          `export interface ${variables.pascalCase}ClientState`,
        );
        expect(artifacts[1]?.typesSource).toContain(
          `export interface ${variables.pascalCase}ItemAttributes`,
        );
        expect(artifacts[1]?.blockJsonDocument).toEqual(
          expect.objectContaining({
            parent: [`${variables.namespace}/${variables.slugKebabCase}`],
          }),
        );
        expect(parentResourceKeyBlockJson).not.toHaveProperty('default');
        expect(artifacts[0]?.typesSource).not.toContain(
          'tags.Default<"primary">',
        );
      }
    },
  );

  test.each([...SNAPSHOT_TEMPLATE_IDS])(
    'attribute emission summaries stay stable for %s',
    (templateId) => {
      const { artifacts } = buildArtifacts(templateId);

      expect(artifacts.map(summarizeArtifactAttributes)).toEqual(
        EXPECTED_ARTIFACT_ATTRIBUTE_SUMMARIES[templateId],
      );
    },
  );

  test('empty built-in overlay directories are omittable only for fully emitter-owned families', () => {
    expect(
      isOmittableBuiltInTemplateLayerDir(
        'basic',
        getTemplateById('basic').templateDir,
      ),
    ).toBe(true);
    expect(
      isOmittableBuiltInTemplateLayerDir(
        'persistence',
        getTemplateById('persistence').templateDir,
      ),
    ).toBe(true);
    expect(
      isOmittableBuiltInTemplateLayerDir(
        'compound',
        getTemplateById('compound').templateDir,
      ),
    ).toBe(true);
    expect(
      isOmittableBuiltInTemplateLayerDir(
        'interactivity',
        getTemplateById('interactivity').templateDir,
      ),
    ).toBe(false);
    expect(
      getBuiltInTemplateLayerDirs('basic')[
        getBuiltInTemplateLayerDirs('basic').length - 1
      ],
    ).toBe(getTemplateById('basic').templateDir);
  });

  test.each(['basic', 'interactivity', 'persistence', 'compound'] as const)(
    'buildBuiltInCodeArtifacts emits unique relative paths for %s',
    (templateId) => {
      const { codeArtifacts } = buildArtifacts(templateId);
      const uniquePaths = new Set(
        codeArtifacts.map((artifact) => artifact.relativePath),
      );

      expect(uniquePaths.size).toBe(codeArtifacts.length);
    },
  );

  test('built-in code artifact builders assert target-language identifiers locally', () => {
    const { variables } = buildArtifacts('basic');
    const unsafeVariables = {
      ...variables,
      phpPrefix: '123-bad-prefix',
    } as typeof variables;

    expect(() =>
      buildBuiltInCodeArtifacts({
        templateId: 'basic',
        variables: unsafeVariables,
      }),
    ).toThrow('Unsafe scaffold template variable "phpPrefix" for PHP identifier');
  });

  test('built-in query-loop builders accept CLI-valid post type identifiers', () => {
    const answers = buildAnswers('query-loop');
    answers.queryPostType = '3d-model';
    const spec = createBuiltInBlockSpec({
      answers,
      templateId: 'query-loop',
    });
    const variables = buildTemplateVariablesFromBlockSpec(spec);
    const codeArtifacts = buildBuiltInCodeArtifacts({
      templateId: 'query-loop',
      variables,
    });

    expect(
      codeArtifacts.find((artifact) => artifact.relativePath === 'src/index.ts')
        ?.source,
    ).toContain("postType: '3d-model'");
  });

  test('compound persistence render emitter quotes heading fallbacks safely', () => {
    const answers = buildAnswers('compound');
    answers.title = `John's "Compound"`;
    const spec = createBuiltInBlockSpec({
      answers,
      dataStorageMode: answers.dataStorageMode,
      persistencePolicy: answers.persistencePolicy,
      templateId: 'compound',
    });
    const variables = buildTemplateVariablesFromBlockSpec(spec);
    const renderArtifact = buildBuiltInCodeArtifacts({
      templateId: 'compound',
      variables,
    }).find(
      (artifact) =>
        artifact.relativePath ===
        `src/blocks/${variables.slugKebabCase}/render.php`,
    );

    expect(renderArtifact?.source).toContain(
      "$heading            = isset( $normalized['heading'] ) ? (string) $normalized['heading'] : 'John\\'s \"Compound\"';",
    );
    expect(renderArtifact?.source).not.toContain(
      "$heading            = isset( $normalized['heading'] ) ? (string) $normalized['heading'] : 'John's \"Compound\"';",
    );
  });

  test('persistence artifacts emit alternate render target entries when requested', () => {
    const answers = buildAnswers('persistence');
    const spec = createBuiltInBlockSpec({
      alternateRenderTargets: 'email,mjml,plain-text',
      answers,
      dataStorageMode: answers.dataStorageMode,
      persistencePolicy: answers.persistencePolicy,
      templateId: 'persistence',
    });
    const variables = buildTemplateVariablesFromBlockSpec(spec);
    const codeArtifacts = buildBuiltInCodeArtifacts({
      templateId: 'persistence',
      variables,
    });
    const relativePaths = codeArtifacts.map(
      (artifact) => artifact.relativePath,
    );

    expect(relativePaths).toContain('src/render-targets.php');
    expect(relativePaths).toContain('src/render.php');
    expect(relativePaths).toContain('src/render-email.php');
    expect(relativePaths).toContain('src/render-mjml.php');
    expect(relativePaths).toContain('src/render-text.php');
    expect(
      codeArtifacts.find(
        (artifact) => artifact.relativePath === 'src/render.php',
      )?.source,
    ).toContain("render_target( 'web'");
    expect(
      codeArtifacts.find(
        (artifact) => artifact.relativePath === 'src/render-targets.php',
      )?.source,
    ).toContain('function demo_space_demo_persistence_render_target');
  });

  test('compound persistence artifacts emit alternate render target entries when requested', () => {
    const answers = buildAnswers('compound');
    const spec = createBuiltInBlockSpec({
      alternateRenderTargets: 'email,plain-text',
      answers,
      dataStorageMode: answers.dataStorageMode,
      persistencePolicy: answers.persistencePolicy,
      templateId: 'compound',
    });
    const variables = buildTemplateVariablesFromBlockSpec(spec);
    const codeArtifacts = buildBuiltInCodeArtifacts({
      templateId: 'compound',
      variables,
    });
    const relativePaths = codeArtifacts.map(
      (artifact) => artifact.relativePath,
    );
    const parentDir = `src/blocks/${variables.slugKebabCase}`;

    expect(relativePaths).toContain(`${parentDir}/render-targets.php`);
    expect(relativePaths).toContain(`${parentDir}/render.php`);
    expect(relativePaths).toContain(`${parentDir}/render-email.php`);
    expect(relativePaths).toContain(`${parentDir}/render-text.php`);
    expect(relativePaths).not.toContain(`${parentDir}/render-mjml.php`);
    expect(
      codeArtifacts.find(
        (artifact) => artifact.relativePath === `${parentDir}/render.php`,
      )?.source,
    ).toContain("render_target( 'web'");
    expect(
      codeArtifacts.find(
        (artifact) =>
          artifact.relativePath === `${parentDir}/render-targets.php`,
      )?.source,
    ).toContain('function demo_space_demo_compound_render_target');
  });

  test.each([
    [
      'basic',
      [
        'src/hooks.ts',
        'src/block-metadata.ts',
        'src/manifest-document.ts',
        'src/manifest-defaults-document.ts',
        'src/edit.tsx',
        'src/save.tsx',
        'src/index.tsx',
        'src/validators.ts',
        'src/editor.scss',
        'src/style.scss',
        'src/render.php',
      ],
    ],
    [
      'interactivity',
      [
        'src/hooks.ts',
        'src/block-metadata.ts',
        'src/manifest-document.ts',
        'src/manifest-defaults-document.ts',
        'src/edit.tsx',
        'src/save.tsx',
        'src/index.tsx',
        'src/interactivity.ts',
        'src/interactivity-store.ts',
        'src/validators.ts',
        'src/editor.scss',
        'src/style.scss',
      ],
    ],
    [
      'persistence',
      [
        'src/hooks.ts',
        'src/block-metadata.ts',
        'src/manifest-document.ts',
        'src/manifest-defaults-document.ts',
        'src/edit.tsx',
        'src/save.tsx',
        'src/index.tsx',
        'src/interactivity.ts',
        'src/validators.ts',
        'src/style.scss',
        'src/render.php',
      ],
    ],
    [
      'compound',
      [
        'src/hooks.ts',
        'src/blocks/demo-compound/block-metadata.ts',
        'src/blocks/demo-compound/manifest-document.ts',
        'src/blocks/demo-compound/manifest-defaults-document.ts',
        'src/blocks/demo-compound/edit.tsx',
        'src/blocks/demo-compound/save.tsx',
        'src/blocks/demo-compound/index.tsx',
        'src/blocks/demo-compound/hooks.ts',
        'src/blocks/demo-compound/validators.ts',
        'src/blocks/demo-compound/children.ts',
        'src/blocks/demo-compound/interactivity.ts',
        'src/blocks/demo-compound-item/block-metadata.ts',
        'src/blocks/demo-compound-item/manifest-document.ts',
        'src/blocks/demo-compound-item/manifest-defaults-document.ts',
        'src/blocks/demo-compound-item/edit.tsx',
        'src/blocks/demo-compound-item/save.tsx',
        'src/blocks/demo-compound-item/index.tsx',
        'src/blocks/demo-compound-item/hooks.ts',
        'src/blocks/demo-compound-item/validators.ts',
        'src/blocks/demo-compound/style.scss',
        'src/blocks/demo-compound/render.php',
      ],
    ],
  ] as const)(
    'buildBuiltInCodeArtifacts emits expected emitter ownership set for %s',
    (templateId, expectedPaths) => {
      const { codeArtifacts } = buildArtifacts(templateId);
      const relativePaths = codeArtifacts.map(
        (artifact) => artifact.relativePath,
      );

      expect(relativePaths).toEqual([...expectedPaths]);

      for (const artifact of codeArtifacts) {
        expect(artifact.source.endsWith('\n')).toBe(true);
        expect(artifact.source).not.toContain('{{');
      }

      const editArtifact = codeArtifacts.find(
        (artifact) =>
          artifact.relativePath.endsWith('/edit.tsx') ||
          artifact.relativePath === 'src/edit.tsx',
      );
      const indexArtifact = codeArtifacts.find(
        (artifact) =>
          artifact.relativePath.endsWith('/index.tsx') ||
          artifact.relativePath === 'src/index.tsx',
      );

      expect(editArtifact?.source).toContain(
        '@wp-typia/block-types/blocks/registration',
      );
      expect(indexArtifact?.source).toContain(
        '@wp-typia/block-types/blocks/registration',
      );
      expect(indexArtifact?.source).not.toContain('type ScaffoldBlockMetadata');
      expect(indexArtifact?.source).toContain(
        "import metadata from './block-metadata';",
      );
      expect(
        relativePaths.some((relativePath) =>
          relativePath.endsWith('manifest-document.ts'),
        ),
      ).toBe(true);
      expect(
        relativePaths.some((relativePath) =>
          relativePath.endsWith('manifest-defaults-document.ts'),
        ),
      ).toBe(true);

      if (templateId === 'interactivity') {
        const interactivityArtifact = codeArtifacts.find(
          (artifact) => artifact.relativePath === 'src/interactivity.ts',
        );
        const styleArtifact = codeArtifacts.find(
          (artifact) => artifact.relativePath === 'src/style.scss',
        );

        expect(interactivityArtifact?.source).toContain('withSyncEvent');
        expect(interactivityArtifact?.source).toContain(
          'event.stopPropagation();',
        );
        expect(styleArtifact?.source).toContain('&__progress-bar');
      }

      if (templateId === 'basic') {
        const renderArtifact = codeArtifacts.find(
          (artifact) => artifact.relativePath === 'src/render.php',
        );

        expect(renderArtifact?.source).toContain('Server render placeholder.');
      }

      if (templateId === 'compound') {
        const childrenArtifact = codeArtifacts.find(
          (artifact) =>
            artifact.relativePath === 'src/blocks/demo-compound/children.ts',
        );
        const renderArtifact = codeArtifacts.find(
          (artifact) =>
            artifact.relativePath === 'src/blocks/demo-compound/render.php',
        );

        expect(childrenArtifact?.source).toContain('BlockTemplate');
        expect(renderArtifact?.source).toContain(
          "$heading            = isset( $normalized['heading'] ) ? (string) $normalized['heading'] : 'Demo Compound';",
        );
      }
    },
  );

  test.each(['basic', 'interactivity', 'persistence', 'compound'] as const)(
    'scaffoldProject writes emitter-owned structural and TS/TSX artifacts for %s',
    async (templateId) => {
      const targetDir = path.join(tempRoot, `scaffold-${templateId}`);
      const { artifacts, answers, codeArtifacts } = buildArtifacts(templateId);

      await scaffoldProject({
        answers,
        dataStorageMode: answers.dataStorageMode,
        noInstall: true,
        packageManager: 'npm',
        persistencePolicy: answers.persistencePolicy,
        projectDir: targetDir,
        templateId,
      });

      for (const artifact of artifacts) {
        const artifactDir = path.join(targetDir, artifact.relativeDir);
        expect(
          fs.readFileSync(path.join(artifactDir, 'types.ts'), 'utf8'),
        ).toBe(artifact.typesSource);
        expect(
          fs.readFileSync(path.join(artifactDir, 'block.json'), 'utf8'),
        ).toBe(stringifyBuiltInBlockJsonDocument(artifact.blockJsonDocument));
        expect(
          fs.readFileSync(
            path.join(artifactDir, 'typia.manifest.json'),
            'utf8',
          ),
        ).toBe(stringifyStarterManifest(artifact.manifestDocument));
      }

      for (const artifact of codeArtifacts) {
        expect(
          fs.readFileSync(path.join(targetDir, artifact.relativePath), 'utf8'),
        ).toBe(transformPackageManagerText(artifact.source, 'npm'));
      }
    },
    { timeout: 30_000 },
  );
});
