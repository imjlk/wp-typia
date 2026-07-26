export const COMPOUND_PARENT_EDIT_TEMPLATE = `import type { BlockEditProps } from '@wp-typia/block-types/blocks/registration';
import { __ } from '@wordpress/i18n';
import {
  InspectorControls,
  InnerBlocks,
  RichText,
  useBlockProps,
} from '@wordpress/block-editor';
import { Notice, PanelBody, ToggleControl } from '@wordpress/components';

import { getRootInnerBlocksPropsOptions } from './children';
import { useTypiaValidation } from './hooks';
import type { {{pascalCase}}Attributes } from './types';
import {
  createAttributeUpdater,
  validate{{pascalCase}}Attributes,
} from './validators';

type EditProps = BlockEditProps<{{pascalCase}}Attributes>;
type CompoundInnerBlocksProps = Parameters<typeof InnerBlocks>[0] & {
  defaultBlock?: [string, Record<string, unknown>];
  directInsert?: boolean;
};

const TypedInnerBlocks = InnerBlocks as unknown as (
  props: CompoundInnerBlocksProps,
) => ReturnType<typeof InnerBlocks>;

export default function Edit({ attributes, setAttributes }: EditProps) {
  const { errorMessages, isValid } = useTypiaValidation(
    attributes,
    validate{{pascalCase}}Attributes,
  );
  const updateAttribute = createAttributeUpdater(attributes, setAttributes);
  const blockProps = useBlockProps({
    className: '{{cssClassName}}',
  });
  const rootInnerBlocksPropsOptions = getRootInnerBlocksPropsOptions();

  return (
    <>
      <InspectorControls>
        <PanelBody title={__('Compound Settings', '{{textDomain}}')}>
          <ToggleControl
            label={__('Show dividers between items', '{{textDomain}}')}
            checked={attributes.showDividers ?? true}
            onChange={(value) => updateAttribute('showDividers', value)}
          />
        </PanelBody>
        {!isValid && (
          <PanelBody
            title={__('Validation Errors', '{{textDomain}}')}
            initialOpen
          >
            {errorMessages.map((error, index) => (
              <Notice key={index} status="error" isDismissible={false}>
                {error}
              </Notice>
            ))}
          </PanelBody>
        )}
      </InspectorControls>
      <div {...blockProps}>
        <RichText
          tagName="h3"
          className="{{cssClassName}}__heading"
          value={attributes.heading}
          onChange={(heading) => updateAttribute('heading', heading)}
          placeholder={__({{titleTsLiteral}}, '{{textDomain}}')}
        />
        <RichText
          tagName="p"
          className="{{cssClassName}}__intro"
          value={attributes.intro ?? ''}
          onChange={(intro) => updateAttribute('intro', intro)}
          placeholder={__(
            'Add and reorder internal items inside this compound block.',
            '{{textDomain}}',
          )}
        />
        {!isValid && (
          <Notice status="error" isDismissible={false}>
            <ul>
              {errorMessages.map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
          </Notice>
        )}
        <div className="{{cssClassName}}__items">
          <TypedInnerBlocks {...rootInnerBlocksPropsOptions} />
        </div>
      </div>
    </>
  );
}
`;

export const COMPOUND_PARENT_SAVE_TEMPLATE = `import { InnerBlocks, RichText, useBlockProps } from '@wordpress/block-editor';

import type { {{pascalCase}}Attributes } from './types';

export default function Save({
  attributes,
}: {
  attributes: {{pascalCase}}Attributes;
}) {
  return (
    <div
      {...useBlockProps.save({
        className: '{{cssClassName}}',
        'data-show-dividers':
          (attributes.showDividers ?? true) ? 'true' : 'false',
      })}
    >
      <RichText.Content
        tagName="h3"
        className="{{cssClassName}}__heading"
        value={attributes.heading}
      />
      <RichText.Content
        tagName="p"
        className="{{cssClassName}}__intro"
        value={attributes.intro ?? ''}
      />
      <div className="{{cssClassName}}__items">
        <InnerBlocks.Content />
      </div>
    </div>
  );
}
`;

export const COMPOUND_PARENT_INDEX_TEMPLATE = `import {
  registerScaffoldBlockType,
  type BlockConfiguration,
} from '@wp-typia/block-types/blocks/registration';
import {
  buildScaffoldBlockRegistration,
  parseScaffoldBlockMetadata,
} from '@wp-typia/block-runtime/blocks';

import Edit from './edit';
import Save from './save';
import metadata from './block-metadata';
import './style.scss';

import type { {{pascalCase}}Attributes } from './types';

const registration = buildScaffoldBlockRegistration(
  parseScaffoldBlockMetadata<
    BlockConfiguration<{{pascalCase}}Attributes>
  >(metadata),
  {
    edit: Edit,
    save: Save,
  },
);

registerScaffoldBlockType(registration.name, registration.settings);
`;

export const COMPOUND_LOCAL_HOOKS_TEMPLATE = `export {
  formatValidationError,
  formatValidationErrors,
  useTypiaValidation,
} from '../../hooks';

export type {
  TypiaValidationError,
  ValidationResult,
  ValidationState,
} from '../../hooks';
`;

export const COMPOUND_PARENT_VALIDATORS_TEMPLATE = `import typia from 'typia';
import currentManifest from './manifest-defaults-document';
{{validationTypesImport}}
import { createTemplateValidatorToolkit } from '../../validator-toolkit';

const scaffoldValidators =
  createTemplateValidatorToolkit<{{pascalCase}}Attributes>({
    assert: typia.createAssert<{{pascalCase}}Attributes>(),
    clone: typia.plain.createClone<{{pascalCase}}Attributes>() as (
      value: {{pascalCase}}Attributes,
    ) => {{pascalCase}}Attributes,
    is: typia.createIs<{{pascalCase}}Attributes>(),
    manifest: currentManifest,
    prune: typia.plain.createPrune<{{pascalCase}}Attributes>(),
    random: typia.createRandom<{{pascalCase}}Attributes>() as (
      ...args: unknown[]
    ) => {{pascalCase}}Attributes,
    validate: typia.createValidate<{{pascalCase}}Attributes>(),
  });

export const validate{{pascalCase}}Attributes =
  scaffoldValidators.validateAttributes as (
    attributes: unknown,
  ) => {{pascalCase}}ValidationResult;

export const validators = scaffoldValidators.validators;

export const sanitize{{pascalCase}}Attributes =
  scaffoldValidators.sanitizeAttributes as (
    attributes: Partial<{{pascalCase}}Attributes>,
  ) => {{pascalCase}}Attributes;

export const createAttributeUpdater = scaffoldValidators.createAttributeUpdater;
`;

export const COMPOUND_CHILDREN_TEMPLATE = `import type { BlockTemplate } from '@wp-typia/block-types/blocks/registration';
import { InnerBlocks } from '@wordpress/block-editor';

export const DEFAULT_CHILD_BLOCK_NAME =
  '{{namespace}}/{{slugKebabCase}}-item';

export interface CompoundChildSpec {
  ancestorKeys: string[];
  blockName: string;
  bodyPlaceholder: string;
  container: boolean;
  folderSlug: string;
  key: string;
  placement: 'nested' | 'root';
  supportsInserter: boolean;
  templateInstances: Array<Record<string, unknown>>;
  title: string;
}

export interface CompoundInnerBlocksConfig {
  defaultBlock?: [string, Record<string, unknown>];
  directInsert: boolean;
  orientation?: 'horizontal' | 'vertical';
  template?: BlockTemplate;
  templateLock: false | 'insert' | 'all';
}

export type CompoundInnerBlocksPropsOptions = CompoundInnerBlocksConfig & {
  renderAppender?: typeof InnerBlocks.ButtonBlockAppender;
};

export const ROOT_INNER_BLOCKS_PRESET_ID = '{{compoundInnerBlocksPreset}}';
export const ROOT_INNER_BLOCKS_PRESET_DESCRIPTION = '{{compoundInnerBlocksPresetDescription}}';

const BASE_INNER_BLOCKS_CONFIG: Omit<
  CompoundInnerBlocksConfig,
  'defaultBlock' | 'template'
> = {
  directInsert: {{compoundInnerBlocksDirectInsert}},
  orientation: {{compoundInnerBlocksOrientationExpression}},
  templateLock: {{compoundInnerBlocksTemplateLockExpression}},
};

const ROOT_BLOCK_NAME = '{{namespace}}/{{slugKebabCase}}';

export const COMPOUND_CHILD_SPECS: CompoundChildSpec[] = [
  {
    ancestorKeys: [],
    blockName: DEFAULT_CHILD_BLOCK_NAME,
    bodyPlaceholder: 'Add supporting details for this internal item.',
    container: false,
    folderSlug: '{{slugKebabCase}}-item',
    key: 'item',
    placement: 'root',
    supportsInserter: false,
    templateInstances: [
      {
        body: 'Add supporting details for the first internal item.',
        title: 'First Item',
      },
      {
        body: 'Add supporting details for the second internal item.',
        title: 'Second Item',
      },
    ],
    title: '{{compoundChildTitle}}',
  },
  // add-child: insert new child specs here
];

function buildTemplateEntriesForSpec(spec: CompoundChildSpec): BlockTemplate {
  const nestedTemplate = buildNestedTemplateForKey(spec.key);

  return spec.templateInstances.map((attributes) =>
    nestedTemplate.length > 0
      ? [spec.blockName, attributes, nestedTemplate]
      : [spec.blockName, attributes],
  );
}

function buildNestedTemplateForKey(key: string): BlockTemplate {
  return COMPOUND_CHILD_SPECS.filter(
    (spec) =>
      spec.placement === 'nested' &&
      spec.ancestorKeys[spec.ancestorKeys.length - 1] === key,
  ).flatMap((spec) => buildTemplateEntriesForSpec(spec));
}

export const DEFAULT_CHILD_TEMPLATE: BlockTemplate =
  COMPOUND_CHILD_SPECS.filter((spec) => spec.placement === 'root').flatMap(
    (spec) => buildTemplateEntriesForSpec(spec),
  );

function buildDefaultBlockEntry(
  template?: BlockTemplate,
): [string, Record<string, unknown>] | undefined {
  if (!BASE_INNER_BLOCKS_CONFIG.directInsert) {
    return undefined;
  }
  if (!Array.isArray(template) || template.length === 0) {
    return undefined;
  }

  const firstBlockName = template[0]?.[0];
  if (typeof firstBlockName !== 'string') {
    return undefined;
  }

  return [firstBlockName, {}];
}

function buildInnerBlocksPropsOptions(
  config: CompoundInnerBlocksConfig,
): CompoundInnerBlocksPropsOptions {
  return {
    ...config,
    renderAppender:
      config.templateLock === 'all'
        ? undefined
        : InnerBlocks.ButtonBlockAppender,
  };
}

export function getRootInnerBlocksConfig(): CompoundInnerBlocksConfig {
  return {
    ...BASE_INNER_BLOCKS_CONFIG,
    defaultBlock: buildDefaultBlockEntry(DEFAULT_CHILD_TEMPLATE),
    template: DEFAULT_CHILD_TEMPLATE,
  };
}

export function getRootInnerBlocksPropsOptions(): CompoundInnerBlocksPropsOptions {
  return buildInnerBlocksPropsOptions(getRootInnerBlocksConfig());
}

export function getChildSpec(blockName: string): CompoundChildSpec | undefined {
  return COMPOUND_CHILD_SPECS.find((spec) => spec.blockName === blockName);
}

export function getChildTemplate(blockName: string): BlockTemplate | undefined {
  const childSpec = getChildSpec(blockName);
  if (!childSpec) {
    return undefined;
  }

  const nestedTemplate = buildNestedTemplateForKey(childSpec.key);
  if (nestedTemplate.length > 0) {
    return nestedTemplate;
  }

  return childSpec.container ? [] : undefined;
}

export function getChildInnerBlocksConfig(
  blockName: string,
): CompoundInnerBlocksConfig | undefined {
  const childSpec = getChildSpec(blockName);
  if (!childSpec) {
    return undefined;
  }

  const template = getChildTemplate(blockName);

  if (!childSpec.container && !template) {
    return undefined;
  }

  return {
    ...BASE_INNER_BLOCKS_CONFIG,
    defaultBlock: buildDefaultBlockEntry(template),
    template,
  };
}

export function getChildInnerBlocksPropsOptions(
  blockName: string,
): CompoundInnerBlocksPropsOptions | undefined {
  const config = getChildInnerBlocksConfig(blockName);
  if (!config) {
    return undefined;
  }

  return buildInnerBlocksPropsOptions(config);
}

export function hasNestedChildBlocks(blockName: string): boolean {
  const childSpec = getChildSpec(blockName);
  if (!childSpec) {
    return false;
  }

  return (
    childSpec.container || buildNestedTemplateForKey(childSpec.key).length > 0
  );
}

export function isRootCompoundChildBlock(blockName: string): boolean {
  const childSpec = getChildSpec(blockName);
  return childSpec?.placement === 'root';
}

export { ROOT_BLOCK_NAME };
`;
