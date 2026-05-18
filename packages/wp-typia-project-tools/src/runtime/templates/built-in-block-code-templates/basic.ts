export const BASIC_EDIT_TEMPLATE = `/**
 * Editor component for {{title}} Block
 */

import type { BlockEditProps } from '@wp-typia/block-types/blocks/registration';
import {
  InspectorControls,
  RichText,
  useBlockProps,
} from '@wordpress/block-editor';
import { Notice, PanelBody, TextControl } from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import currentManifest from './manifest-document';
import {
  InspectorFromManifest,
  useEditorFields,
  useTypedAttributeUpdater,
} from '@wp-typia/block-runtime/inspector';
import { {{pascalCase}}Attributes } from './types';
import {
  sanitize{{pascalCase}}Attributes,
  validate{{pascalCase}}Attributes,
} from './validators';
import { useTypiaValidation } from './hooks';

type EditProps = BlockEditProps<{{pascalCase}}Attributes>;

const validationErrorItemStyle = { color: '#cc1818', fontSize: '12px' };
const validationListStyle = { margin: 0, paddingLeft: '1em' };

function Edit({ attributes, setAttributes }: EditProps) {
  const isVisible = attributes.isVisible !== false;
  const blockProps = useBlockProps({
    className: \`{{cssClassName}}\${isVisible ? '' : ' is-hidden'}\`,
  });
  const editorFields = useEditorFields(currentManifest, {
    hidden: ['id', 'schemaVersion'],
    manual: ['content'],
    labels: {
      alignment: __('Alignment', '{{textDomain}}'),
      className: __('CSS Class', '{{textDomain}}'),
      content: __('Content', '{{textDomain}}'),
      isVisible: __('Visible', '{{textDomain}}'),
    },
  });
  const classNameField = editorFields.getField('className');
  const { errorMessages, isValid } = useTypiaValidation(
    attributes,
    validate{{pascalCase}}Attributes
  );
  const validateEditorUpdate = (nextAttributes: {{pascalCase}}Attributes) => {
    try {
      return {
        data: sanitize{{pascalCase}}Attributes(nextAttributes),
        errors: [],
        isValid: true as const,
      };
    } catch {
      return validate{{pascalCase}}Attributes(nextAttributes);
    }
  };
  const { updateField } = useTypedAttributeUpdater(
    attributes,
    setAttributes,
    validateEditorUpdate
  );

  return (
    <>
      <InspectorControls>
        <InspectorFromManifest
          attributes={attributes}
          fieldLookup={editorFields}
          onChange={updateField}
          paths={['alignment', 'isVisible']}
          title={__('Settings', '{{textDomain}}')}
        >
          <TextControl
            label={__('Content', '{{textDomain}}')}
            value={attributes.content || ''}
            onChange={(value) => updateField('content', value)}
            help={__('Mirrors the main block content.', '{{textDomain}}')}
          />

          <TextControl
            label={classNameField?.label || __('CSS Class', '{{textDomain}}')}
            value={attributes.className || ''}
            onChange={(value) => updateField('className', value)}
            help={__('Add an optional CSS class name.', '{{textDomain}}')}
          />
        </InspectorFromManifest>

        {!isValid && (
          <PanelBody title={__('Validation Errors', '{{textDomain}}')} initialOpen>
            {errorMessages.map((error, index) => (
              <div key={index} style={validationErrorItemStyle}>
                • {error}
              </div>
            ))}
          </PanelBody>
        )}
      </InspectorControls>

      <div {...blockProps}>
        <div className="{{cssClassName}}__content">
          <RichText
            tagName="p"
            value={attributes.content || ''}
            onChange={(value) => updateField('content', value)}
            placeholder={__('Add your content...', '{{textDomain}}')}
          />
        </div>
        {!isValid && (
          <Notice status="error" isDismissible={false}>
            <p>
              <strong>{__('Validation Errors', '{{textDomain}}')}</strong>
            </p>
            <ul style={validationListStyle}>
              {errorMessages.map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
          </Notice>
        )}
      </div>
    </>
  );
}

export default Edit;
`;

export const BASIC_SAVE_TEMPLATE = `/**
 * Save/Frontend component for {{title}} Block
 */

import { RichText, useBlockProps } from '@wordpress/block-editor';
import { {{pascalCase}}Attributes } from './types';

interface SaveProps {
  attributes: {{pascalCase}}Attributes;
}

export default function Save({ attributes }: SaveProps) {
  const isVisible = attributes.isVisible !== false;
  const blockProps = useBlockProps.save({
    className: \`{{cssClassName}}\${isVisible ? '' : ' is-hidden'}\`,
    hidden: isVisible ? undefined : true,
    'aria-hidden': isVisible ? undefined : 'true',
  });

  return (
    <div {...blockProps}>
      <div
        className="{{cssClassName}}__content"
        data-align={attributes.alignment || 'left'}
      >
        <RichText.Content tagName="p" value={attributes.content} />
      </div>
    </div>
  );
}
`;

export const BASIC_INDEX_TEMPLATE = `/**
 * WordPress {{title}} Block
 *
 * Typia-powered type-safe block
 */

import {
  registerScaffoldBlockType,
  type BlockConfiguration,
} from '@wp-typia/block-types/blocks/registration';
import type { BlockSupports } from '@wp-typia/block-types/blocks/supports';
import { __ } from '@wordpress/i18n';
import {
  buildScaffoldBlockRegistration,
  parseScaffoldBlockMetadata,
} from '@wp-typia/block-runtime/blocks';

// Import components
import Edit from './edit';
import Save from './save';
import metadata from './block-metadata';
import './editor.scss';
import './style.scss';

// Import types
import { {{pascalCase}}Attributes } from './types';
import { validators } from './validators';

const scaffoldSupports = {
  html: false,
  multiple: true,
  align: ['wide', 'full'],
} satisfies BlockSupports;

// Register the block
const registration = buildScaffoldBlockRegistration(
  parseScaffoldBlockMetadata<BlockConfiguration<{{pascalCase}}Attributes>>(metadata),
  {
    supports: scaffoldSupports,
    example: {
      attributes: validators.random(),
    },
    edit: Edit,
    save: Save,
  }
);

registerScaffoldBlockType(registration.name, registration.settings);
`;

export const BASIC_VALIDATORS_TEMPLATE = `import typia from 'typia';
import currentManifest from "./manifest-defaults-document";
import { {{pascalCase}}Attributes, {{pascalCase}}ValidationResult } from "./types";
import { generateBlockId } from "@wp-typia/block-runtime/identifiers";
import { createTemplateValidatorToolkit } from "./validator-toolkit";

const scaffoldValidators = createTemplateValidatorToolkit<{{pascalCase}}Attributes>({
  assert: typia.createAssert<{{pascalCase}}Attributes>(),
  clone: typia.misc.createClone<{{pascalCase}}Attributes>() as (
    value: {{pascalCase}}Attributes,
  ) => {{pascalCase}}Attributes,
  is: typia.createIs<{{pascalCase}}Attributes>(),
  manifest: currentManifest,
  prune: typia.misc.createPrune<{{pascalCase}}Attributes>(),
  random: typia.createRandom<{{pascalCase}}Attributes>() as (
    ...args: unknown[]
  ) => {{pascalCase}}Attributes,
  finalize: (normalized) => ({
    ...normalized,
    id: normalized.id && normalized.id.length > 0 ? normalized.id : generateBlockId(),
  }),
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
