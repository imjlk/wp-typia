export const COMPOUND_PARENT_EDIT_TEMPLATE = `import type { BlockEditProps } from '@wp-typia/block-types/blocks/registration';
import { __ } from '@wordpress/i18n';
import {
	InspectorControls,
	InnerBlocks,
	RichText,
	useBlockProps,
} from '@wordpress/block-editor';
import { Notice, PanelBody, ToggleControl } from '@wordpress/components';

import {
	getRootInnerBlocksPropsOptions,
} from './children';
import { useTypiaValidation } from './hooks';
import type { {{pascalCase}}Attributes } from './types';
import {
	createAttributeUpdater,
	validate{{pascalCase}}Attributes,
} from './validators';

type EditProps = BlockEditProps< {{pascalCase}}Attributes >;
type CompoundInnerBlocksProps = Parameters< typeof InnerBlocks >[ 0 ] & {
	defaultBlock?: [ string, Record< string, unknown > ];
	directInsert?: boolean;
};

const TypedInnerBlocks = InnerBlocks as unknown as (
	props: CompoundInnerBlocksProps
) => ReturnType< typeof InnerBlocks >;

export default function Edit( {
	attributes,
	setAttributes,
}: EditProps ) {
	const { errorMessages, isValid } = useTypiaValidation(
		attributes,
		validate{{pascalCase}}Attributes
	);
	const updateAttribute = createAttributeUpdater( attributes, setAttributes );
	const blockProps = useBlockProps( {
		className: '{{cssClassName}}',
	} );
	const rootInnerBlocksPropsOptions = getRootInnerBlocksPropsOptions();

	return (
		<>
			<InspectorControls>
				<PanelBody title={ __( 'Compound Settings', '{{textDomain}}' ) }>
					<ToggleControl
						label={ __( 'Show dividers between items', '{{textDomain}}' ) }
						checked={ attributes.showDividers ?? true }
						onChange={ ( value ) => updateAttribute( 'showDividers', value ) }
					/>
				</PanelBody>
				{ ! isValid && (
					<PanelBody title={ __( 'Validation Errors', '{{textDomain}}' ) } initialOpen>
						{ errorMessages.map( ( error, index ) => (
							<Notice key={ index } status="error" isDismissible={ false }>
								{ error }
							</Notice>
						) ) }
					</PanelBody>
				) }
			</InspectorControls>
			<div { ...blockProps }>
				<RichText
					tagName="h3"
					className="{{cssClassName}}__heading"
					value={ attributes.heading }
					onChange={ ( heading ) => updateAttribute( 'heading', heading ) }
					placeholder={ __( {{titleJson}}, '{{textDomain}}' ) }
				/>
				<RichText
					tagName="p"
					className="{{cssClassName}}__intro"
					value={ attributes.intro ?? '' }
					onChange={ ( intro ) => updateAttribute( 'intro', intro ) }
					placeholder={ __(
						'Add and reorder internal items inside this compound block.',
						'{{textDomain}}'
					) }
				/>
				{ ! isValid && (
					<Notice status="error" isDismissible={ false }>
						<ul>
							{ errorMessages.map( ( error, index ) => <li key={ index }>{ error }</li> ) }
						</ul>
					</Notice>
				) }
				<div className="{{cssClassName}}__items">
					<TypedInnerBlocks { ...rootInnerBlocksPropsOptions } />
				</div>
			</div>
		</>
	);
}
`;

export const COMPOUND_PARENT_SAVE_TEMPLATE = `import { InnerBlocks, RichText, useBlockProps } from '@wordpress/block-editor';

import type { {{pascalCase}}Attributes } from './types';

export default function Save( {
	attributes,
}: {
	attributes: {{pascalCase}}Attributes;
} ) {
	return (
		<div
			{ ...useBlockProps.save( {
				className: '{{cssClassName}}',
				'data-show-dividers': ( attributes.showDividers ?? true ) ? 'true' : 'false',
			} ) }
		>
			<RichText.Content
				tagName="h3"
				className="{{cssClassName}}__heading"
				value={ attributes.heading }
			/>
			<RichText.Content
				tagName="p"
				className="{{cssClassName}}__intro"
				value={ attributes.intro ?? '' }
			/>
			<div className="{{cssClassName}}__items">
				<InnerBlocks.Content />
			</div>
		</div>
	);
}
`;

export const COMPOUND_PARENT_INDEX_TEMPLATE = `import {
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
import './style.scss';

import type { {{pascalCase}}Attributes } from './types';

const registration = buildScaffoldBlockRegistration(
\tparseScaffoldBlockMetadata<BlockConfiguration< {{pascalCase}}Attributes >>( metadata ),
\t{
\t\tedit: Edit,
\t\tsave: Save,
\t}
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
import type {
\t{{pascalCase}}Attributes,
\t{{pascalCase}}ValidationResult,
} from './types';
import { createTemplateValidatorToolkit } from '../../validator-toolkit';

const scaffoldValidators = createTemplateValidatorToolkit< {{pascalCase}}Attributes >( {
\tassert: typia.createAssert< {{pascalCase}}Attributes >(),
\tclone: typia.misc.createClone< {{pascalCase}}Attributes >() as (
\t\tvalue: {{pascalCase}}Attributes,
\t) => {{pascalCase}}Attributes,
\tis: typia.createIs< {{pascalCase}}Attributes >(),
\tmanifest: currentManifest,
\tprune: typia.misc.createPrune< {{pascalCase}}Attributes >(),
\trandom: typia.createRandom< {{pascalCase}}Attributes >() as (
\t\t...args: unknown[]
\t) => {{pascalCase}}Attributes,
\tvalidate: typia.createValidate< {{pascalCase}}Attributes >(),
} );

export const validate{{pascalCase}}Attributes =
\tscaffoldValidators.validateAttributes as (
\t\tattributes: unknown
\t) => {{pascalCase}}ValidationResult;

export const validators = scaffoldValidators.validators;

export const sanitize{{pascalCase}}Attributes =
\tscaffoldValidators.sanitizeAttributes as (
\t\tattributes: Partial< {{pascalCase}}Attributes >
\t) => {{pascalCase}}Attributes;

export const createAttributeUpdater = scaffoldValidators.createAttributeUpdater;
`;

export const COMPOUND_CHILDREN_TEMPLATE = `import type { BlockTemplate } from '@wp-typia/block-types/blocks/registration';
import { InnerBlocks } from '@wordpress/block-editor';

export const DEFAULT_CHILD_BLOCK_NAME = '{{namespace}}/{{slugKebabCase}}-item';

export interface CompoundChildSpec {
\tancestorKeys: string[];
\tblockName: string;
\tbodyPlaceholder: string;
\tcontainer: boolean;
\tfolderSlug: string;
\tkey: string;
\tplacement: 'nested' | 'root';
\tsupportsInserter: boolean;
\ttemplateInstances: Array< Record< string, unknown > >;
\ttitle: string;
}

export interface CompoundInnerBlocksConfig {
\tdefaultBlock?: [ string, Record< string, unknown > ];
\tdirectInsert: boolean;
\torientation?: 'horizontal' | 'vertical';
\ttemplate?: BlockTemplate;
\ttemplateLock: false | 'insert' | 'all';
}

export type CompoundInnerBlocksPropsOptions = CompoundInnerBlocksConfig & {
\trenderAppender?: typeof InnerBlocks.ButtonBlockAppender;
};

export const ROOT_INNER_BLOCKS_PRESET_ID = '{{compoundInnerBlocksPreset}}';
export const ROOT_INNER_BLOCKS_PRESET_DESCRIPTION =
\t'{{compoundInnerBlocksPresetDescription}}';

const BASE_INNER_BLOCKS_CONFIG: Omit<
\tCompoundInnerBlocksConfig,
\t'defaultBlock' | 'template'
> = {
\tdirectInsert: {{compoundInnerBlocksDirectInsert}},
\torientation: {{compoundInnerBlocksOrientationExpression}},
\ttemplateLock: {{compoundInnerBlocksTemplateLockExpression}},
};

const ROOT_BLOCK_NAME = '{{namespace}}/{{slugKebabCase}}';

export const COMPOUND_CHILD_SPECS: CompoundChildSpec[] = [
\t{
\t\tancestorKeys: [],
\t\tblockName: DEFAULT_CHILD_BLOCK_NAME,
\t\tbodyPlaceholder: 'Add supporting details for this internal item.',
\t\tcontainer: false,
\t\tfolderSlug: '{{slugKebabCase}}-item',
\t\tkey: 'item',
\t\tplacement: 'root',
\t\tsupportsInserter: false,
\t\ttemplateInstances: [
\t\t\t{
\t\t\t\tbody: 'Add supporting details for the first internal item.',
\t\t\t\ttitle: 'First Item',
\t\t\t},
\t\t\t{
\t\t\t\tbody: 'Add supporting details for the second internal item.',
\t\t\t\ttitle: 'Second Item',
\t\t\t},
\t\t],
\t\ttitle: '{{compoundChildTitle}}',
\t},
\t// add-child: insert new child specs here
];

function buildTemplateEntriesForSpec( spec: CompoundChildSpec ): BlockTemplate {
\tconst nestedTemplate = buildNestedTemplateForKey( spec.key );

\treturn spec.templateInstances.map( ( attributes ) =>
\t\tnestedTemplate.length > 0
\t\t\t? [ spec.blockName, attributes, nestedTemplate ]
\t\t\t: [ spec.blockName, attributes ]
\t);
}

function buildNestedTemplateForKey( key: string ): BlockTemplate {
\treturn COMPOUND_CHILD_SPECS.filter(
\t\t( spec ) =>
\t\t\tspec.placement === 'nested' &&
\t\t\tspec.ancestorKeys[ spec.ancestorKeys.length - 1 ] === key
\t).flatMap( ( spec ) => buildTemplateEntriesForSpec( spec ) );
}

export const DEFAULT_CHILD_TEMPLATE: BlockTemplate =
\tCOMPOUND_CHILD_SPECS.filter( ( spec ) => spec.placement === 'root' ).flatMap(
\t\t( spec ) => buildTemplateEntriesForSpec( spec )
\t);

function buildDefaultBlockEntry(
\ttemplate?: BlockTemplate
): [ string, Record< string, unknown > ] | undefined {
\tif (
\t\t! BASE_INNER_BLOCKS_CONFIG.directInsert ||
\t\t! Array.isArray( template ) ||
\t\ttemplate.length === 0 ||
\t\ttypeof template[ 0 ]?.[ 0 ] !== 'string'
\t) {
\t\treturn undefined;
\t}

\treturn [ template[ 0 ][ 0 ], {} ];
}

function buildInnerBlocksPropsOptions(
\tconfig: CompoundInnerBlocksConfig
): CompoundInnerBlocksPropsOptions {
\treturn {
\t\t...config,
\t\trenderAppender:
\t\t\tconfig.templateLock === 'all'
\t\t\t\t? undefined
\t\t\t\t: InnerBlocks.ButtonBlockAppender,
\t};
}

export function getRootInnerBlocksConfig(): CompoundInnerBlocksConfig {
\treturn {
\t\t...BASE_INNER_BLOCKS_CONFIG,
\t\tdefaultBlock: buildDefaultBlockEntry( DEFAULT_CHILD_TEMPLATE ),
\t\ttemplate: DEFAULT_CHILD_TEMPLATE,
\t};
}

export function getRootInnerBlocksPropsOptions(): CompoundInnerBlocksPropsOptions {
\treturn buildInnerBlocksPropsOptions( getRootInnerBlocksConfig() );
}

export function getChildSpec( blockName: string ): CompoundChildSpec | undefined {
\treturn COMPOUND_CHILD_SPECS.find( ( spec ) => spec.blockName === blockName );
}

export function getChildTemplate(
\tblockName: string
): BlockTemplate | undefined {
\tconst childSpec = getChildSpec( blockName );
\tif ( ! childSpec ) {
\t\treturn undefined;
\t}

\tconst nestedTemplate = buildNestedTemplateForKey( childSpec.key );
\tif ( nestedTemplate.length > 0 ) {
\t\treturn nestedTemplate;
\t}

\treturn childSpec.container ? [] : undefined;
}

export function getChildInnerBlocksConfig(
\tblockName: string
): CompoundInnerBlocksConfig | undefined {
\tconst childSpec = getChildSpec( blockName );
\tif ( ! childSpec ) {
\t\treturn undefined;
\t}

\tconst template = getChildTemplate( blockName );

\tif ( ! childSpec.container && ! template ) {
\t\treturn undefined;
\t}

\treturn {
\t\t...BASE_INNER_BLOCKS_CONFIG,
\t\tdefaultBlock: buildDefaultBlockEntry( template ),
\t\ttemplate,
\t};
}

export function getChildInnerBlocksPropsOptions(
\tblockName: string
): CompoundInnerBlocksPropsOptions | undefined {
\tconst config = getChildInnerBlocksConfig( blockName );
\tif ( ! config ) {
\t\treturn undefined;
\t}

\treturn buildInnerBlocksPropsOptions( config );
}

export function hasNestedChildBlocks( blockName: string ): boolean {
\tconst childSpec = getChildSpec( blockName );
\tif ( ! childSpec ) {
\t\treturn false;
\t}

\treturn childSpec.container || buildNestedTemplateForKey( childSpec.key ).length > 0;
}

export function isRootCompoundChildBlock( blockName: string ): boolean {
\tconst childSpec = getChildSpec( blockName );
\treturn childSpec?.placement === 'root';
}

export { ROOT_BLOCK_NAME };
`;
