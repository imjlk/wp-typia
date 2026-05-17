import { createElement, type ReactNode } from 'react';

import type { SelectOption } from '@bunli/tui';
import {
  COMPOUND_INNER_BLOCKS_PRESET_IDS,
  getCompoundInnerBlocksPresetDefinition,
} from '@wp-typia/project-tools/compound-inner-blocks';
import {
  EDITOR_PLUGIN_SLOT_IDS,
  PATTERN_CATALOG_SCOPE_IDS,
} from '@wp-typia/project-tools/cli-add';
import { HOOKED_BLOCK_POSITION_IDS } from '@wp-typia/project-tools/hooked-blocks';

import {
  getAddKindOptions,
  getAddNameLabel,
  type AddFieldName,
} from '../add-kind-registry';
import type { AddFlowValues } from './add-flow-model';
import { isAddPersistenceTemplate } from './add-flow-model';
import {
  FirstPartySelectField,
  FirstPartyTextField,
} from './first-party-form';
import { getWrappedFieldNeighbors } from './first-party-form-model';

export type WorkspaceBlockOption = {
  description: string;
  name: string;
  value: string;
};

type AddSelectFieldName = {
  [K in keyof AddFlowValues]-?: AddFlowValues[K] extends string | undefined
    ? K
    : never;
}[keyof AddFlowValues];

export type AddFlowFieldGroupContext = {
  kind: string;
  orderedVisibleFields: ReadonlyArray<AddFieldName>;
  template?: string;
  visibleFields: ReadonlySet<AddFieldName>;
  workspaceBlockOptions: WorkspaceBlockOption[];
};

export type AddFlowFieldGroup = {
  id: string;
  render: (context: AddFlowFieldGroupContext) => ReactNode[];
};

const kindOptions: SelectOption[] = getAddKindOptions();

const templateOptions: SelectOption[] = [
  { name: 'basic', description: 'Basic block scaffold', value: 'basic' },
  {
    name: 'interactivity',
    description: 'Interactivity API block scaffold',
    value: 'interactivity',
  },
  {
    name: 'persistence',
    description: 'Persistence-enabled block scaffold',
    value: 'persistence',
  },
  {
    name: 'compound',
    description: 'Compound parent + child scaffold',
    value: 'compound',
  },
];

const dataStorageOptions: SelectOption[] = [
  {
    name: 'custom-table',
    description: 'Dedicated custom table storage',
    value: 'custom-table',
  },
  {
    name: 'post-meta',
    description: 'Persist through post meta',
    value: 'post-meta',
  },
];

const persistencePolicyOptions: SelectOption[] = [
  {
    name: 'authenticated',
    description: 'Authenticated write policy',
    value: 'authenticated',
  },
  { name: 'public', description: 'Public token policy', value: 'public' },
];

const PATTERN_CATALOG_SCOPE_DESCRIPTIONS: Record<
  (typeof PATTERN_CATALOG_SCOPE_IDS)[number],
  string
> = {
  full: 'Register a full-page or general pattern. Tags and thumbnails are available through CLI flags.',
  section: 'Register a section pattern. Requires a section role below.',
};

const patternCatalogScopeOptions: SelectOption[] =
  PATTERN_CATALOG_SCOPE_IDS.map((scope) => ({
    description: PATTERN_CATALOG_SCOPE_DESCRIPTIONS[scope],
    name: scope,
    value: scope,
  }));

const compoundInnerBlocksPresetOptions: SelectOption[] =
  COMPOUND_INNER_BLOCKS_PRESET_IDS.map((value) => ({
    description: getCompoundInnerBlocksPresetDefinition(value).description,
    name: value,
    value,
  }));

const EDITOR_PLUGIN_SLOT_DESCRIPTIONS: Record<string, string> = {
  'document-setting-panel': 'Register a document settings sidebar panel',
  sidebar: 'Register a document sidebar and more-menu entry',
};

const editorPluginSlotOptions: SelectOption[] = EDITOR_PLUGIN_SLOT_IDS.map(
  (slot) => ({
    description:
      EDITOR_PLUGIN_SLOT_DESCRIPTIONS[slot] ?? 'Editor plugin shell slot',
    name: slot,
    value: slot,
  }),
);

const HOOKED_BLOCK_POSITION_DESCRIPTIONS: Record<
  (typeof HOOKED_BLOCK_POSITION_IDS)[number],
  string
> = {
  after: 'Insert after the anchor block',
  before: 'Insert before the anchor block',
  firstChild: 'Insert as the first child of the anchor block',
  lastChild: 'Insert as the last child of the anchor block',
};

const hookedBlockPositionOptions: SelectOption[] =
  HOOKED_BLOCK_POSITION_IDS.map((position) => ({
    description: HOOKED_BLOCK_POSITION_DESCRIPTIONS[position],
    name: position,
    value: position,
  }));

function getFieldNeighbors(
  context: AddFlowFieldGroupContext,
  fieldName: AddFieldName,
) {
  return getWrappedFieldNeighbors(context.orderedVisibleFields, fieldName);
}

function isVisible(
  context: AddFlowFieldGroupContext,
  fieldName: AddFieldName,
) {
  return context.visibleFields.has(fieldName);
}

function createSharedAddFields(context: AddFlowFieldGroupContext): ReactNode[] {
  const hookedBlockNameUsesSelect =
    context.kind === 'hooked-block' && context.workspaceBlockOptions.length > 0;

  return [
    createElement(FirstPartySelectField, {
      ...getFieldNeighbors(context, 'kind'),
      key: 'kind',
      label: 'Kind',
      name: 'kind' satisfies AddSelectFieldName,
      options: kindOptions,
    }),
    isVisible(context, 'name') && !hookedBlockNameUsesSelect
      ? createElement(FirstPartyTextField, {
          ...getFieldNeighbors(context, 'name'),
          key: `name-text:${context.kind}`,
          label: getAddNameLabel(context.kind),
          name: 'name',
        })
      : null,
    hookedBlockNameUsesSelect
      ? createElement(FirstPartySelectField, {
          ...getFieldNeighbors(context, 'name'),
          key: 'name-select:hooked-block',
          label: getAddNameLabel(context.kind),
          name: 'name' satisfies AddSelectFieldName,
          options: context.workspaceBlockOptions,
        })
      : null,
    isVisible(context, 'template')
      ? createElement(FirstPartySelectField, {
          ...getFieldNeighbors(context, 'template'),
          key: 'template',
          label: 'Template family',
          name: 'template' satisfies AddSelectFieldName,
          options: templateOptions,
        })
      : null,
    isVisible(context, 'source')
      ? createElement(FirstPartyTextField, {
          ...getFieldNeighbors(context, 'source'),
          description:
            'Optional data source locator, for example rest-resource:products or core-data:postType/post',
          key: 'source',
          label: 'Data source',
          name: 'source',
          placeholder: 'core-data:postType/post',
        })
      : null,
    isVisible(context, 'type')
      ? createElement(FirstPartyTextField, {
          ...getFieldNeighbors(context, 'type'),
          description:
            'Optional exported TypeScript type name; defaults to PascalCase(name)',
          key: 'type',
          label: 'Source type',
          name: 'type',
          placeholder: 'ExternalRetrieveResponse',
        })
      : null,
    isVisible(context, 'alternate-render-targets')
      ? createElement(FirstPartyTextField, {
          ...getFieldNeighbors(context, 'alternate-render-targets'),
          key: 'alternate-render-targets',
          label: 'Alternate render targets',
          name: 'alternate-render-targets',
        })
      : null,
  ];
}

function createCompoundBlockFields(
  context: AddFlowFieldGroupContext,
): ReactNode[] {
  return [
    isVisible(context, 'inner-blocks-preset')
      ? createElement(FirstPartySelectField, {
          ...getFieldNeighbors(context, 'inner-blocks-preset'),
          key: 'inner-blocks-preset',
          label: 'InnerBlocks preset',
          name: 'inner-blocks-preset' satisfies AddSelectFieldName,
          options: compoundInnerBlocksPresetOptions,
        })
      : null,
  ];
}

function createPatternCatalogFields(
  context: AddFlowFieldGroupContext,
): ReactNode[] {
  return [
    isVisible(context, 'scope')
      ? createElement(FirstPartySelectField, {
          ...getFieldNeighbors(context, 'scope'),
          key: 'scope',
          label: 'Pattern catalog scope',
          name: 'scope' satisfies AddSelectFieldName,
          options: patternCatalogScopeOptions,
        })
      : null,
    isVisible(context, 'section-role')
      ? createElement(FirstPartyTextField, {
          ...getFieldNeighbors(context, 'section-role'),
          description:
            'Required when scope is section; leave blank for full patterns.',
          key: 'section-role',
          label: 'Section role',
          name: 'section-role',
          placeholder: 'hero',
        })
      : null,
    isVisible(context, 'catalog-title')
      ? createElement(FirstPartyTextField, {
          ...getFieldNeighbors(context, 'catalog-title'),
          description:
            'Defaults to the pattern slug title. Use --tag, --tags, or --thumbnail-url for additional catalog metadata.',
          key: 'catalog-title',
          label: 'Catalog title',
          name: 'catalog-title',
          placeholder: 'Homepage Hero',
        })
      : null,
  ];
}

function createTargetBlockFields(
  context: AddFlowFieldGroupContext,
): ReactNode[] {
  const targetBlockUsesSelect =
    (context.kind === 'variation' || context.kind === 'style') &&
    context.workspaceBlockOptions.length > 0;

  return [
    isVisible(context, 'block') && !targetBlockUsesSelect
      ? createElement(FirstPartyTextField, {
          ...getFieldNeighbors(context, 'block'),
          key: 'block-text',
          label: 'Target block',
          name: 'block',
        })
      : null,
    targetBlockUsesSelect
      ? createElement(FirstPartySelectField, {
          ...getFieldNeighbors(context, 'block'),
          key: 'block-select',
          label: 'Target block',
          name: 'block' satisfies AddSelectFieldName,
          options: context.workspaceBlockOptions,
        })
      : null,
  ];
}

function createTransformTargetFields(
  context: AddFlowFieldGroupContext,
): ReactNode[] {
  const transformTargetUsesSelect =
    context.kind === 'transform' && context.workspaceBlockOptions.length > 0;

  return [
    isVisible(context, 'from')
      ? createElement(FirstPartyTextField, {
          ...getFieldNeighbors(context, 'from'),
          key: 'from',
          label: 'Source block',
          name: 'from',
          placeholder: 'core/quote',
        })
      : null,
    isVisible(context, 'to') && !transformTargetUsesSelect
      ? createElement(FirstPartyTextField, {
          ...getFieldNeighbors(context, 'to'),
          key: 'to',
          label: 'Target block',
          name: 'to',
          placeholder: 'counter-card',
        })
      : null,
    transformTargetUsesSelect
      ? createElement(FirstPartySelectField, {
          ...getFieldNeighbors(context, 'to'),
          key: 'to-select',
          label: 'Target block',
          name: 'to' satisfies AddSelectFieldName,
          options: context.workspaceBlockOptions,
        })
      : null,
  ];
}

function createBindingSourceFields(
  context: AddFlowFieldGroupContext,
): ReactNode[] {
  return [
    isVisible(context, 'attribute')
      ? createElement(FirstPartyTextField, {
          ...getFieldNeighbors(context, 'attribute'),
          key: 'attribute',
          label: 'Target attribute',
          name: 'attribute',
          placeholder: 'headline',
        })
      : null,
    isVisible(context, 'post-meta')
      ? createElement(FirstPartyTextField, {
          ...getFieldNeighbors(context, 'post-meta'),
          description:
            'Optional generated post-meta contract slug used as the binding source data provider',
          key: 'post-meta',
          label: 'Post meta contract',
          name: 'post-meta',
          placeholder: 'integration-state',
        })
      : null,
    isVisible(context, 'meta-path')
      ? createElement(FirstPartyTextField, {
          ...getFieldNeighbors(context, 'meta-path'),
          description:
            'Optional top-level post-meta field used as the default binding arg',
          key: 'meta-path',
          label: 'Meta field',
          name: 'meta-path',
          placeholder: 'status',
        })
      : null,
  ];
}

function createRestResourceFields(
  context: AddFlowFieldGroupContext,
): ReactNode[] {
  return [
    isVisible(context, 'namespace')
      ? createElement(FirstPartyTextField, {
          ...getFieldNeighbors(context, 'namespace'),
          key: 'namespace',
          label: 'REST namespace',
          name: 'namespace',
        })
      : null,
    isVisible(context, 'methods')
      ? createElement(FirstPartyTextField, {
          ...getFieldNeighbors(context, 'methods'),
          key: 'methods',
          label: 'Methods (comma-separated: list, read, create, update, delete)',
          name: 'methods',
        })
      : null,
  ];
}

function createPostMetaFields(context: AddFlowFieldGroupContext): ReactNode[] {
  return [
    isVisible(context, 'post-type')
      ? createElement(FirstPartyTextField, {
          ...getFieldNeighbors(context, 'post-type'),
          description: 'WordPress post type key, for example post or product',
          key: 'post-type',
          label: 'Post type',
          name: 'post-type',
          placeholder: 'post',
        })
      : null,
  ];
}

function createHookedBlockFields(
  context: AddFlowFieldGroupContext,
): ReactNode[] {
  return [
    isVisible(context, 'anchor')
      ? createElement(FirstPartyTextField, {
          ...getFieldNeighbors(context, 'anchor'),
          key: 'anchor',
          label: 'Anchor block name',
          name: 'anchor',
        })
      : null,
    isVisible(context, 'position')
      ? createElement(FirstPartySelectField, {
          ...getFieldNeighbors(context, 'position'),
          key: 'position',
          label: 'Hook position',
          name: 'position' satisfies AddSelectFieldName,
          options: hookedBlockPositionOptions,
        })
      : null,
  ];
}

function createEditorPluginFields(
  context: AddFlowFieldGroupContext,
): ReactNode[] {
  return [
    isVisible(context, 'slot')
      ? createElement(FirstPartySelectField, {
          ...getFieldNeighbors(context, 'slot'),
          key: 'slot',
          label: 'Editor shell slot',
          name: 'slot' satisfies AddSelectFieldName,
          options: editorPluginSlotOptions,
        })
      : null,
  ];
}

function createPersistenceFields(
  context: AddFlowFieldGroupContext,
): ReactNode[] {
  const showsPersistenceFields = isAddPersistenceTemplate(context.template);

  return [
    isVisible(context, 'data-storage') && showsPersistenceFields
      ? createElement(FirstPartySelectField, {
          ...getFieldNeighbors(context, 'data-storage'),
          key: 'data-storage',
          label: 'Data storage',
          name: 'data-storage' satisfies AddSelectFieldName,
          options: dataStorageOptions,
        })
      : null,
    isVisible(context, 'persistence-policy') && showsPersistenceFields
      ? createElement(FirstPartySelectField, {
          ...getFieldNeighbors(context, 'persistence-policy'),
          key: 'persistence-policy',
          label: 'Persistence policy',
          name: 'persistence-policy' satisfies AddSelectFieldName,
          options: persistencePolicyOptions,
        })
      : null,
  ];
}

export const ADD_FLOW_FIELD_GROUPS = [
  { id: 'shared', render: createSharedAddFields },
  { id: 'compound-block', render: createCompoundBlockFields },
  { id: 'pattern-catalog', render: createPatternCatalogFields },
  { id: 'target-block', render: createTargetBlockFields },
  { id: 'transform-target', render: createTransformTargetFields },
  { id: 'binding-source', render: createBindingSourceFields },
  { id: 'rest-resource', render: createRestResourceFields },
  { id: 'post-meta', render: createPostMetaFields },
  { id: 'hooked-block', render: createHookedBlockFields },
  { id: 'editor-plugin', render: createEditorPluginFields },
  { id: 'persistence', render: createPersistenceFields },
] as const satisfies ReadonlyArray<AddFlowFieldGroup>;
