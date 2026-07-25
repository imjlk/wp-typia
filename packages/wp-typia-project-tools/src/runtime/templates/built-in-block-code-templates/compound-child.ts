export const COMPOUND_CHILD_EDIT_TEMPLATE = `import type { BlockEditProps } from '@wp-typia/block-types/blocks/registration';
import { InnerBlocks, RichText, useBlockProps } from '@wordpress/block-editor';
import { Notice } from '@wordpress/components';
import { __ } from '@wordpress/i18n';

import metadata from './block-metadata';
import {
  getChildInnerBlocksPropsOptions,
  hasNestedChildBlocks,
} from '../{{slugKebabCase}}/children';
import { useTypiaValidation } from './hooks';
import type { {{pascalCase}}ItemAttributes } from './types';
import {
  createAttributeUpdater,
  validate{{pascalCase}}ItemAttributes,
} from './validators';

type EditProps = BlockEditProps<{{pascalCase}}ItemAttributes>;
type CompoundInnerBlocksProps = Parameters<typeof InnerBlocks>[0] & {
  defaultBlock?: [string, Record<string, unknown>];
  directInsert?: boolean;
};

const TypedInnerBlocks = InnerBlocks as unknown as (
  props: CompoundInnerBlocksProps,
) => ReturnType<typeof InnerBlocks>;

export default function Edit({ attributes, setAttributes }: EditProps) {
  const updateAttribute = createAttributeUpdater(attributes, setAttributes);
  const { errorMessages, isValid } = useTypiaValidation(
    attributes,
    validate{{pascalCase}}ItemAttributes,
  );
  const nestedInnerBlocksPropsOptions = getChildInnerBlocksPropsOptions(
    metadata.name,
  );
  const showsNestedChildren = hasNestedChildBlocks(metadata.name);
  const blockProps = useBlockProps({
    className: '{{compoundChildCssClassName}}',
  });

  return (
    <div {...blockProps}>
      <RichText
        tagName="h4"
        className="{{compoundChildCssClassName}}__title"
        value={attributes.title ?? ''}
        onChange={(title) => updateAttribute('title', title)}
        placeholder={__({{compoundChildTitleTsLiteral}}, '{{textDomain}}')}
      />
      <RichText
        tagName="p"
        className="{{compoundChildCssClassName}}__body"
        value={attributes.body ?? ''}
        onChange={(body) => updateAttribute('body', body)}
        placeholder={__(
          'Add supporting details for this internal item.',
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
      {showsNestedChildren && (
        <div className="{{compoundChildCssClassName}}__children">
          <TypedInnerBlocks {...(nestedInnerBlocksPropsOptions ?? {})} />
        </div>
      )}
    </div>
  );
}
`;

export const COMPOUND_CHILD_SAVE_TEMPLATE = `import { InnerBlocks, RichText, useBlockProps } from '@wordpress/block-editor';

import metadata from './block-metadata';
import { hasNestedChildBlocks } from '../{{slugKebabCase}}/children';
import type { {{pascalCase}}ItemAttributes } from './types';

export default function Save({
  attributes,
}: {
  attributes: {{pascalCase}}ItemAttributes;
}) {
  const showsNestedChildren = hasNestedChildBlocks(metadata.name);
  const blockProps = useBlockProps.save({
    className: '{{compoundChildCssClassName}}',
  });

  return (
    <div {...blockProps}>
      <RichText.Content
        tagName="h4"
        className="{{compoundChildCssClassName}}__title"
        value={attributes.title}
      />
      <RichText.Content
        tagName="p"
        className="{{compoundChildCssClassName}}__body"
        value={attributes.body}
      />
      {showsNestedChildren && (
        <div className="{{compoundChildCssClassName}}__children">
          <InnerBlocks.Content />
        </div>
      )}
    </div>
  );
}
`;

export const COMPOUND_CHILD_INDEX_TEMPLATE = `import {
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
import '../{{slugKebabCase}}/style.scss';

import type { {{pascalCase}}ItemAttributes } from './types';

const registration = buildScaffoldBlockRegistration(
  parseScaffoldBlockMetadata<
    BlockConfiguration<{{pascalCase}}ItemAttributes>
  >(metadata),
  {
    edit: Edit,
    save: Save,
  },
);

registerScaffoldBlockType(registration.name, registration.settings);
`;

export const COMPOUND_CHILD_VALIDATORS_TEMPLATE = `import typia from 'typia';
import currentManifest from './manifest-defaults-document';
import type {
  {{pascalCase}}ItemAttributes,
  {{pascalCase}}ItemValidationResult,
} from './types';
import { createTemplateValidatorToolkit } from '../../validator-toolkit';

const scaffoldValidators =
  createTemplateValidatorToolkit<{{pascalCase}}ItemAttributes>({
    assert: typia.createAssert<{{pascalCase}}ItemAttributes>(),
    clone: typia.plain.createClone<{{pascalCase}}ItemAttributes>() as (
      value: {{pascalCase}}ItemAttributes,
    ) => {{pascalCase}}ItemAttributes,
    is: typia.createIs<{{pascalCase}}ItemAttributes>(),
    manifest: currentManifest,
    prune: typia.plain.createPrune<{{pascalCase}}ItemAttributes>(),
    random: typia.createRandom<{{pascalCase}}ItemAttributes>() as (
      ...args: unknown[]
    ) => {{pascalCase}}ItemAttributes,
    validate: typia.createValidate<{{pascalCase}}ItemAttributes>(),
  });

export const validate{{pascalCase}}ItemAttributes =
  scaffoldValidators.validateAttributes as (
    attributes: unknown,
  ) => {{pascalCase}}ItemValidationResult;

export const validators = scaffoldValidators.validators;

export const sanitize{{pascalCase}}ItemAttributes =
  scaffoldValidators.sanitizeAttributes as (
    attributes: Partial<{{pascalCase}}ItemAttributes>,
  ) => {{pascalCase}}ItemAttributes;

export const createAttributeUpdater = scaffoldValidators.createAttributeUpdater;
`;
