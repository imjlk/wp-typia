export const PERSISTENCE_EDIT_TEMPLATE = `import type { BlockEditProps } from '@wp-typia/block-types/blocks/registration';
import { __ } from '@wordpress/i18n';
import {
	AlignmentToolbar,
	BlockControls,
	InspectorControls,
	RichText,
	useBlockProps,
} from '@wordpress/block-editor';
import {
	Notice,
	PanelBody,
	TextControl,
} from '@wordpress/components';
import currentManifest from './manifest-document';
import {
	InspectorFromManifest,
	useEditorFields,
	useTypedAttributeUpdater,
} from '@wp-typia/block-runtime/inspector';
import type { {{pascalCase}}Attributes } from './types';
import {
	sanitize{{pascalCase}}Attributes,
	validate{{pascalCase}}Attributes,
} from './validators';
import { useTypiaValidation } from './hooks';

type EditProps = BlockEditProps< {{pascalCase}}Attributes >;

export default function Edit( {
	attributes,
	setAttributes,
}: EditProps ) {
	const editorFields = useEditorFields(
		currentManifest,
		{
			manual: [ 'content', 'resourceKey' ],
			labels: {
				buttonLabel: __( 'Button Label', '{{textDomain}}' ),
				resourceKey: __( 'Resource Key', '{{textDomain}}' ),
				showCount: __( 'Show Count', '{{textDomain}}' ),
			},
		}
	);
	const { errorMessages, isValid } = useTypiaValidation(
		attributes,
		validate{{pascalCase}}Attributes
	);
	const validateEditorUpdate = (
		nextAttributes: {{pascalCase}}Attributes
	) => {
		try {
			return {
				data: sanitize{{pascalCase}}Attributes( nextAttributes ),
				errors: [],
				isValid: true as const,
			};
		} catch {
			return validate{{pascalCase}}Attributes( nextAttributes );
		}
	};
	const { updateField } = useTypedAttributeUpdater(
		attributes,
		setAttributes,
		validateEditorUpdate
	);
	const alignmentValue = editorFields.getStringValue(
		attributes,
		'alignment',
		'left'
	);
	const persistencePolicy = '{{persistencePolicy}}';
	const persistencePolicyDescription = __(
		{{persistencePolicyDescriptionJson}},
		'{{textDomain}}'
	);

	return (
		<>
			<BlockControls>
				<AlignmentToolbar
					value={ alignmentValue }
					onChange={ ( value ) =>
						updateField(
							'alignment',
							( value || alignmentValue ) as NonNullable< {{pascalCase}}Attributes[ 'alignment' ] >
						)
					}
				/>
			</BlockControls>
			<InspectorControls>
				<InspectorFromManifest
					attributes={ attributes }
					fieldLookup={ editorFields }
					onChange={ updateField }
					paths={ [ 'alignment', 'isVisible', 'showCount', 'buttonLabel' ] }
					title={ __( 'Persistence Settings', '{{textDomain}}' ) }
				>
					<TextControl
						label={ __( 'Resource Key', '{{textDomain}}' ) }
						value={ attributes.resourceKey ?? '' }
						onChange={ ( value ) => updateField( 'resourceKey', value ) }
						help={ __( 'Stable persisted identifier used by the storage-backed counter endpoint.', '{{textDomain}}' ) }
					/>
					<Notice status="info" isDismissible={ false }>
						{ __( 'Storage mode: {{dataStorageMode}}', '{{textDomain}}' ) }
					</Notice>
					<Notice status="info" isDismissible={ false }>
						{ __( 'Persistence policy: {{persistencePolicy}}', '{{textDomain}}' ) }
						<br />
						{ persistencePolicyDescription }
					</Notice>
					<Notice status="info" isDismissible={ false }>
						{ __( 'Render mode: dynamic. \`render.php\` bootstraps durable post context, while fresh session-only write data is loaded from the dedicated \`/bootstrap\` endpoint after hydration.', '{{textDomain}}' ) }
					</Notice>
				</InspectorFromManifest>
				{ ! isValid && (
					<PanelBody
						title={ __( 'Validation Errors', '{{textDomain}}' ) }
						initialOpen
					>
						{ errorMessages.map( ( error, index ) => (
							<Notice key={ index } status="error" isDismissible={ false }>
								{ error }
							</Notice>
						) ) }
					</PanelBody>
				) }
			</InspectorControls>
			<div
				{ ...useBlockProps( {
					className: '{{cssClassName}}',
					style: {
						textAlign:
							alignmentValue as NonNullable< {{pascalCase}}Attributes[ 'alignment' ] >,
					},
				} ) }
			>
				<RichText
					tagName="p"
					value={ attributes.content }
					onChange={ ( value ) => updateField( 'content', value ) }
					placeholder={ __( {{titleJson}} + ' persistence block', '{{textDomain}}' ) }
				/>
				<p className="{{cssClassName}}__meta">
					{ __( 'Resource key:', '{{textDomain}}' ) } { attributes.resourceKey || '—' }
				</p>
				<p className="{{cssClassName}}__meta">
					{ __( 'Storage mode:', '{{textDomain}}' ) } {{dataStorageMode}}
				</p>
				<p className="{{cssClassName}}__meta">
					{ __( 'Persistence policy:', '{{textDomain}}' ) } {{persistencePolicy}}
				</p>
				{ ! isValid && (
					<Notice status="error" isDismissible={ false }>
						<ul>
							{ errorMessages.map( ( error, index ) => <li key={ index }>{ error }</li> ) }
						</ul>
					</Notice>
				) }
			</div>
		</>
	);
}
`;

export const PERSISTENCE_INDEX_TEMPLATE = `import {
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

export const PERSISTENCE_SAVE_TEMPLATE = `export default function Save() {
\t// This block is intentionally server-rendered. PHP bootstraps post context,
\t// storage-backed state, and write-policy data before the frontend hydrates.
\treturn null;
}
`;

export const PERSISTENCE_VALIDATORS_TEMPLATE = `import typia from 'typia';
import currentManifest from './manifest-defaults-document';
import type {
\t{{pascalCase}}Attributes,
\t{{pascalCase}}ValidationResult,
} from './types';
import { generateResourceKey } from '@wp-typia/block-runtime/identifiers';
import { createTemplateValidatorToolkit } from './validator-toolkit';

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
\tfinalize: ( normalized ) => ( {
\t\t...normalized,
\t\tresourceKey:
\t\t\tnormalized.resourceKey && normalized.resourceKey.length > 0
\t\t\t\t? normalized.resourceKey
\t\t\t\t: generateResourceKey( '{{slugKebabCase}}' ),
\t} ),
\tvalidate: typia.createValidate< {{pascalCase}}Attributes >(),
} );

export const validators = scaffoldValidators.validators;

export const validate{{pascalCase}}Attributes =
\tscaffoldValidators.validateAttributes as (
\t\tattributes: unknown
\t) => {{pascalCase}}ValidationResult;

export const sanitize{{pascalCase}}Attributes =
\tscaffoldValidators.sanitizeAttributes as (
\t\tattributes: Partial< {{pascalCase}}Attributes >
\t) => {{pascalCase}}Attributes;

export const createAttributeUpdater = scaffoldValidators.createAttributeUpdater;
`;

export const PERSISTENCE_INTERACTIVITY_TEMPLATE = `import { getContext, store } from '@wordpress/interactivity';
import { generatePublicWriteRequestId } from '@wp-typia/block-runtime/identifiers';

import { fetchBootstrap, fetchState, writeState } from './api';
import type {
\t{{pascalCase}}ClientState,
\t{{pascalCase}}Context,
\t{{pascalCase}}State,
} from './types';
import type {
\t{{pascalCase}}WriteStateRequest,
} from './api-types';

function hasExpiredPublicWriteToken(
\texpiresAt?: number
): boolean {
\treturn (
\t\ttypeof expiresAt === 'number' &&
\t\texpiresAt > 0 &&
\t\tDate.now() >= expiresAt * 1000
\t);
}

function getWriteBlockedMessage(
\tcontext: {{pascalCase}}Context
): string {
\treturn context.persistencePolicy === 'authenticated'
\t\t? 'Sign in to persist this counter.'
\t\t: 'Public writes are temporarily unavailable.';
}

const BOOTSTRAP_MAX_ATTEMPTS = 3;
const BOOTSTRAP_RETRY_DELAYS_MS = [ 250, 500 ];

async function waitForBootstrapRetry( delayMs: number ): Promise< void > {
\tawait new Promise( ( resolve ) => {
\t\tsetTimeout( resolve, delayMs );
\t} );
}

function getClientState(
\tcontext: {{pascalCase}}Context
): {{pascalCase}}ClientState {
\tif ( context.client ) {
\t\treturn context.client;
\t}

\tcontext.client = {
\t\tbootstrapError: '',
\t\twriteExpiry: 0,
\t\twriteNonce: '',
\t\twriteToken: '',
\t};

\treturn context.client;
}

function clearBootstrapError(
\tcontext: {{pascalCase}}Context,
\tclientState: {{pascalCase}}ClientState
): void {
\tif ( context.error === clientState.bootstrapError ) {
\t\tcontext.error = '';
\t}
\tclientState.bootstrapError = '';
}

function setBootstrapError(
\tcontext: {{pascalCase}}Context,
\tclientState: {{pascalCase}}ClientState,
\tmessage: string
): void {
\tclientState.bootstrapError = message;
\tcontext.error = message;
}

const { actions, state } = store( '{{slugKebabCase}}', {
\tstate: {
\t\tisHydrated: false,
\t} as {{pascalCase}}State,

\tactions: {
\t\tasync loadState() {
\t\t\tconst context = getContext< {{pascalCase}}Context >();
\t\t\tif ( context.postId <= 0 || ! context.resourceKey ) {
\t\t\t\treturn;
\t\t\t}

\t\t\tcontext.isLoading = true;
\t\t\tcontext.error = '';

\t\t\ttry {
\t\t\t\tconst result = await fetchState( {
\t\t\t\t\tpostId: context.postId,
\t\t\t\t\tresourceKey: context.resourceKey,
\t\t\t\t}, {
\t\t\t\t\ttransportTarget: 'frontend',
\t\t\t\t} );
\t\t\t\tif ( ! result.isValid || ! result.data ) {
\t\t\t\t\tcontext.error = result.errors[ 0 ]?.expected ?? 'Unable to load counter';
\t\t\t\t\treturn;
\t\t\t\t}
\t\t\t\tcontext.count = result.data.count;
\t\t\t} catch ( error ) {
\t\t\t\tcontext.error =
\t\t\t\t\terror instanceof Error ? error.message : 'Unknown loading error';
\t\t\t} finally {
\t\t\t\tcontext.isLoading = false;
\t\t\t}
\t\t},
\t\tasync loadBootstrap() {
\t\t\tconst context = getContext< {{pascalCase}}Context >();
\t\t\tconst clientState = getClientState( context );
\t\t\tif ( context.postId <= 0 || ! context.resourceKey ) {
\t\t\t\tcontext.bootstrapReady = true;
\t\t\t\tcontext.canWrite = false;
\t\t\t\tclientState.bootstrapError = '';
\t\t\t\tclientState.writeExpiry = 0;
\t\t\t\tclientState.writeNonce = '';
\t\t\t\tclientState.writeToken = '';
\t\t\t\treturn;
\t\t\t}

\t\t\tcontext.isBootstrapping = true;

\t\t\tlet bootstrapSucceeded = false;
\t\t\tlet lastBootstrapError =
\t\t\t\t'Unable to initialize write access';
\t\t\tconst includePublicWriteCredentials = {{isPublicPersistencePolicy}};
\t\t\tconst includeRestNonce = {{isAuthenticatedPersistencePolicy}};

\t\t\tfor ( let attempt = 1; attempt <= BOOTSTRAP_MAX_ATTEMPTS; attempt += 1 ) {
\t\t\t\ttry {
\t\t\t\t\tconst result = await fetchBootstrap( {
\t\t\t\t\t\tpostId: context.postId,
\t\t\t\t\t\tresourceKey: context.resourceKey,
\t\t\t\t\t}, {
\t\t\t\t\t\ttransportTarget: 'frontend',
\t\t\t\t\t} );
\t\t\t\t\tif ( ! result.isValid || ! result.data ) {
\t\t\t\t\t\tlastBootstrapError =
\t\t\t\t\t\t\tresult.errors[ 0 ]?.expected ??
\t\t\t\t\t\t\t'Unable to initialize write access';
\t\t\t\t\t\tif ( attempt < BOOTSTRAP_MAX_ATTEMPTS ) {
\t\t\t\t\t\t\tawait waitForBootstrapRetry(
\t\t\t\t\t\t\t\tBOOTSTRAP_RETRY_DELAYS_MS[ attempt - 1 ] ?? 750
\t\t\t\t\t\t\t);
\t\t\t\t\t\t\tcontinue;
\t\t\t\t\t\t}
\t\t\t\t\t\tbreak;
\t\t\t\t\t}

\t\t\t\t\tclientState.writeExpiry =
\t\t\t\t\t\tincludePublicWriteCredentials &&
\t\t\t\t\t\t'publicWriteExpiresAt' in result.data &&
\t\t\t\t\t\ttypeof result.data.publicWriteExpiresAt === 'number' &&
\t\t\t\t\t\tresult.data.publicWriteExpiresAt > 0
\t\t\t\t\t\t\t? result.data.publicWriteExpiresAt
\t\t\t\t\t\t\t: 0;
\t\t\t\t\tclientState.writeToken =
\t\t\t\t\t\tincludePublicWriteCredentials &&
\t\t\t\t\t\t'publicWriteToken' in result.data &&
\t\t\t\t\t\ttypeof result.data.publicWriteToken === 'string' &&
\t\t\t\t\t\tresult.data.publicWriteToken.length > 0
\t\t\t\t\t\t\t? result.data.publicWriteToken
\t\t\t\t\t\t\t: '';
\t\t\t\t\tclientState.writeNonce =
\t\t\t\t\t\tincludeRestNonce &&
\t\t\t\t\t\t'restNonce' in result.data &&
\t\t\t\t\t\ttypeof result.data.restNonce === 'string' &&
\t\t\t\t\t\tresult.data.restNonce.length > 0
\t\t\t\t\t\t\t? result.data.restNonce
\t\t\t\t\t\t\t: '';
\t\t\t\t\tcontext.bootstrapReady = true;
\t\t\t\t\tcontext.canWrite =
\t\t\t\t\t\tresult.data.canWrite === true &&
\t\t\t\t\t\t(
\t\t\t\t\t\t\tcontext.persistencePolicy === 'authenticated'
\t\t\t\t\t\t\t\t? clientState.writeNonce.length > 0
\t\t\t\t\t\t\t\t: clientState.writeToken.length > 0 &&
\t\t\t\t\t\t\t\t\t! hasExpiredPublicWriteToken( clientState.writeExpiry )
\t\t\t\t\t\t);
\t\t\t\t\tclearBootstrapError( context, clientState );
\t\t\t\t\tbootstrapSucceeded = true;
\t\t\t\t\tbreak;
\t\t\t\t} catch ( error ) {
\t\t\t\t\tlastBootstrapError =
\t\t\t\t\t\terror instanceof Error ? error.message : 'Unknown bootstrap error';
\t\t\t\t\tif ( attempt < BOOTSTRAP_MAX_ATTEMPTS ) {
\t\t\t\t\t\tawait waitForBootstrapRetry(
\t\t\t\t\t\t\tBOOTSTRAP_RETRY_DELAYS_MS[ attempt - 1 ] ?? 750
\t\t\t\t\t\t);
\t\t\t\t\t\tcontinue;
\t\t\t\t\t}
\t\t\t\t\tbreak;
\t\t\t\t}
\t\t\t}

\t\t\tif ( ! bootstrapSucceeded ) {
\t\t\t\tcontext.bootstrapReady = false;
\t\t\t\tcontext.canWrite = false;
\t\t\t\tclientState.writeExpiry = 0;
\t\t\t\tclientState.writeNonce = '';
\t\t\t\tclientState.writeToken = '';
\t\t\t\tsetBootstrapError( context, clientState, lastBootstrapError );
\t\t\t}
\t\t\tcontext.isBootstrapping = false;
\t\t},
\t\tasync increment() {
\t\t\tconst context = getContext< {{pascalCase}}Context >();
\t\t\tconst clientState = getClientState( context );
\t\t\tif ( context.postId <= 0 || ! context.resourceKey ) {
\t\t\t\treturn;
\t\t\t}
\t\t\tif ( ! context.bootstrapReady ) {
\t\t\t\tawait actions.loadBootstrap();
\t\t\t}
\t\t\tif ( ! context.bootstrapReady ) {
\t\t\t\tcontext.error = 'Write access is still initializing.';
\t\t\t\treturn;
\t\t\t}
\t\t\tif (
\t\t\t\tcontext.persistencePolicy === 'public' &&
\t\t\t\thasExpiredPublicWriteToken( clientState.writeExpiry )
\t\t\t) {
\t\t\t\tawait actions.loadBootstrap();
\t\t\t}
\t\t\tif (
\t\t\t\tcontext.persistencePolicy === 'public' &&
\t\t\t\thasExpiredPublicWriteToken( clientState.writeExpiry )
\t\t\t) {
\t\t\t\tcontext.canWrite = false;
\t\t\t\tcontext.error = getWriteBlockedMessage( context );
\t\t\t\treturn;
\t\t\t}
\t\t\tif ( ! context.canWrite ) {
\t\t\t\tcontext.error = getWriteBlockedMessage( context );
\t\t\t\treturn;
\t\t\t}

\t\t\tcontext.isSaving = true;
\t\t\tcontext.error = '';

\t\t\ttry {
\t\t\t\tconst request = {
\t\t\t\t\tdelta: 1,
\t\t\t\t\tpostId: context.postId,
\t\t\t\t\tresourceKey: context.resourceKey,
\t\t\t\t} as {{pascalCase}}WriteStateRequest;
\t\t\t\tif ( {{isPublicPersistencePolicy}} ) {
\t\t\t\t\trequest.publicWriteRequestId =
\t\t\t\t\t\tgeneratePublicWriteRequestId() as {{pascalCase}}WriteStateRequest[ 'publicWriteRequestId' ];
\t\t\t\t\tif ( clientState.writeToken.length > 0 ) {
\t\t\t\t\t\trequest.publicWriteToken =
\t\t\t\t\t\t\tclientState.writeToken as {{pascalCase}}WriteStateRequest[ 'publicWriteToken' ];
\t\t\t\t\t}
\t\t\t\t}
\t\t\t\tconst result = await writeState( request, {
\t\t\t\t\trestNonce:
\t\t\t\t\t\tclientState.writeNonce.length > 0
\t\t\t\t\t\t\t? clientState.writeNonce
\t\t\t\t\t\t\t: undefined,
\t\t\t\t\ttransportTarget: 'frontend',
\t\t\t\t} );
\t\t\t\tif ( ! result.isValid || ! result.data ) {
\t\t\t\t\tcontext.error = result.errors[ 0 ]?.expected ?? 'Unable to update counter';
\t\t\t\t\treturn;
\t\t\t\t}
\t\t\t\tcontext.count = result.data.count;
\t\t\t\tcontext.storage = result.data.storage;
\t\t\t} catch ( error ) {
\t\t\t\tcontext.error =
\t\t\t\t\terror instanceof Error ? error.message : 'Unknown update error';
\t\t\t} finally {
\t\t\t\tcontext.isSaving = false;
\t\t\t}
\t\t},
\t},

\tcallbacks: {
\t\tinit() {
\t\t\tconst context = getContext< {{pascalCase}}Context >();
\t\t\tcontext.client = {
\t\t\t\tbootstrapError: '',
\t\t\t\twriteExpiry: 0,
\t\t\t\twriteNonce: '',
\t\t\t\twriteToken: '',
\t\t\t};
\t\t\tcontext.bootstrapReady = false;
\t\t\tcontext.canWrite = false;
\t\t\tcontext.count = 0;
\t\t\tcontext.error = '';
\t\t\tcontext.isBootstrapping = false;
\t\t\tcontext.isLoading = false;
\t\t\tcontext.isSaving = false;
\t\t},
\t\tmounted() {
\t\t\tstate.isHydrated = true;
\t\t\tif ( typeof document !== 'undefined' ) {
\t\t\t\tdocument.documentElement.dataset[ '{{slugCamelCase}}Hydrated' ] = 'true';
\t\t\t}
\t\t\tvoid Promise.allSettled( [
\t\t\t\tactions.loadState(),
\t\t\t\tactions.loadBootstrap(),
\t\t\t] );
\t\t},
\t},
} );
`;
