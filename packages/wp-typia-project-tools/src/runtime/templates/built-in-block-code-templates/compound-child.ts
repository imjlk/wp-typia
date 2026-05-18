export const COMPOUND_CHILD_EDIT_TEMPLATE = `import type { BlockEditProps } from '@wp-typia/block-types/blocks/registration';
import { InnerBlocks, RichText, useBlockProps } from '@wordpress/block-editor';
import { Notice } from '@wordpress/components';
import { __ } from '@wordpress/i18n';

import metadata from './block-metadata';
import {
\tgetChildInnerBlocksPropsOptions,
\thasNestedChildBlocks,
} from '../{{slugKebabCase}}/children';
import { useTypiaValidation } from './hooks';
import type { {{pascalCase}}ItemAttributes } from './types';
import {
\tcreateAttributeUpdater,
\tvalidate{{pascalCase}}ItemAttributes,
} from './validators';

type EditProps = BlockEditProps< {{pascalCase}}ItemAttributes >;
type CompoundInnerBlocksProps = Parameters< typeof InnerBlocks >[ 0 ] & {
\tdefaultBlock?: [ string, Record< string, unknown > ];
\tdirectInsert?: boolean;
};

const TypedInnerBlocks = InnerBlocks as unknown as (
\tprops: CompoundInnerBlocksProps
) => ReturnType< typeof InnerBlocks >;

export default function Edit( {
\tattributes,
\tsetAttributes,
}: EditProps ) {
\tconst updateAttribute = createAttributeUpdater( attributes, setAttributes );
\tconst { errorMessages, isValid } = useTypiaValidation(
\t\tattributes,
\t\tvalidate{{pascalCase}}ItemAttributes
\t);
\tconst nestedInnerBlocksPropsOptions = getChildInnerBlocksPropsOptions(
\t\tmetadata.name
\t);
\tconst showsNestedChildren = hasNestedChildBlocks( metadata.name );

\treturn (
\t\t<div { ...useBlockProps( { className: '{{compoundChildCssClassName}}' } ) }>
\t\t\t<RichText
\t\t\t\ttagName="h4"
\t\t\t\tclassName="{{compoundChildCssClassName}}__title"
\t\t\t\tvalue={ attributes.title ?? '' }
\t\t\t\tonChange={ ( title ) => updateAttribute( 'title', title ) }
\t\t\t\tplaceholder={ __( {{compoundChildTitleJson}}, '{{textDomain}}' ) }
\t\t\t/>
\t\t\t<RichText
\t\t\t\ttagName="p"
\t\t\t\tclassName="{{compoundChildCssClassName}}__body"
\t\t\t\tvalue={ attributes.body ?? '' }
\t\t\t\tonChange={ ( body ) => updateAttribute( 'body', body ) }
\t\t\t\tplaceholder={ __( 'Add supporting details for this internal item.', '{{textDomain}}' ) }
\t\t\t/>
\t\t\t{ ! isValid && (
\t\t\t\t<Notice status="error" isDismissible={ false }>
\t\t\t\t\t<ul>
\t\t\t\t\t\t{ errorMessages.map( ( error, index ) => <li key={ index }>{ error }</li> ) }
\t\t\t\t\t</ul>
\t\t\t\t</Notice>
\t\t\t) }
\t\t\t{ showsNestedChildren && (
\t\t\t\t<div className="{{compoundChildCssClassName}}__children">
\t\t\t\t\t<TypedInnerBlocks
\t\t\t\t\t\t{ ...( nestedInnerBlocksPropsOptions ?? {} ) }
\t\t\t\t\t/>
\t\t\t\t</div>
\t\t\t) }
\t\t</div>
\t);
}
`;

export const COMPOUND_CHILD_SAVE_TEMPLATE = `import { InnerBlocks, RichText, useBlockProps } from '@wordpress/block-editor';

import metadata from './block-metadata';
import { hasNestedChildBlocks } from '../{{slugKebabCase}}/children';
import type { {{pascalCase}}ItemAttributes } from './types';

export default function Save( {
\tattributes,
}: {
\tattributes: {{pascalCase}}ItemAttributes;
} ) {
\tconst showsNestedChildren = hasNestedChildBlocks( metadata.name );

\treturn (
\t\t<div { ...useBlockProps.save( { className: '{{compoundChildCssClassName}}' } ) }>
\t\t\t<RichText.Content
\t\t\t\ttagName="h4"
\t\t\t\tclassName="{{compoundChildCssClassName}}__title"
\t\t\t\tvalue={ attributes.title }
\t\t\t/>
\t\t\t<RichText.Content
\t\t\t\ttagName="p"
\t\t\t\tclassName="{{compoundChildCssClassName}}__body"
\t\t\t\tvalue={ attributes.body }
\t\t\t/>
\t\t\t{ showsNestedChildren && (
\t\t\t\t<div className="{{compoundChildCssClassName}}__children">
\t\t\t\t\t<InnerBlocks.Content />
\t\t\t\t</div>
\t\t\t) }
\t\t</div>
\t);
}
`;

export const COMPOUND_CHILD_INDEX_TEMPLATE = `import {
\tregisterScaffoldBlockType,
\ttype BlockConfiguration,
} from '@wp-typia/block-types/blocks/registration';
import {
\tbuildScaffoldBlockRegistration,
\tparseScaffoldBlockMetadata,
} from '@wp-typia/block-runtime/blocks';

import Edit from './edit';
import Save from './save';
import metadata from './block-metadata';
import '../{{slugKebabCase}}/style.scss';

import type { {{pascalCase}}ItemAttributes } from './types';

const registration = buildScaffoldBlockRegistration(
\tparseScaffoldBlockMetadata<BlockConfiguration< {{pascalCase}}ItemAttributes >>( metadata ),
\t{
\t\tedit: Edit,
\t\tsave: Save,
\t}
);

registerScaffoldBlockType(registration.name, registration.settings);
`;

export const COMPOUND_CHILD_VALIDATORS_TEMPLATE = `import typia from 'typia';
import currentManifest from './manifest-defaults-document';
import type {
\t{{pascalCase}}ItemAttributes,
\t{{pascalCase}}ItemValidationResult,
} from './types';
import { createTemplateValidatorToolkit } from '../../validator-toolkit';

const scaffoldValidators = createTemplateValidatorToolkit< {{pascalCase}}ItemAttributes >( {
\tassert: typia.createAssert< {{pascalCase}}ItemAttributes >(),
\tclone: typia.misc.createClone< {{pascalCase}}ItemAttributes >() as (
\t\tvalue: {{pascalCase}}ItemAttributes,
\t) => {{pascalCase}}ItemAttributes,
\tis: typia.createIs< {{pascalCase}}ItemAttributes >(),
\tmanifest: currentManifest,
\tprune: typia.misc.createPrune< {{pascalCase}}ItemAttributes >(),
\trandom: typia.createRandom< {{pascalCase}}ItemAttributes >() as (
\t\t...args: unknown[]
\t) => {{pascalCase}}ItemAttributes,
\tvalidate: typia.createValidate< {{pascalCase}}ItemAttributes >(),
} );

export const validate{{pascalCase}}ItemAttributes =
\tscaffoldValidators.validateAttributes as (
\t\tattributes: unknown
\t) => {{pascalCase}}ItemValidationResult;

export const validators = scaffoldValidators.validators;

export const sanitize{{pascalCase}}ItemAttributes =
\tscaffoldValidators.sanitizeAttributes as (
\t\tattributes: Partial< {{pascalCase}}ItemAttributes >
\t) => {{pascalCase}}ItemAttributes;

export const createAttributeUpdater = scaffoldValidators.createAttributeUpdater;
`;
