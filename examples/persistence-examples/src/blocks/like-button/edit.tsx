import { __ } from '@wordpress/i18n';
import {
  InspectorControls,
  RichText,
  useBlockProps,
} from '@wordpress/block-editor';
import {
  Button,
  Notice,
  PanelBody,
  TextControl,
  ToggleControl,
} from '@wordpress/components';
import currentManifest from './typia.manifest.json';
import {
  createEditorModel,
  parseManifestDocument,
} from '@wp-typia/block-runtime/editor';
import { useTypiaValidation } from '../../shared/hooks';
import { resolveCurrentEditorPostId } from '../../shared/editor';
import type { PersistenceLikeButtonAttributes } from './types';
import {
  usePersistenceLikeBootstrapQuery,
  usePersistenceLikeStatusQuery,
  useToggleLikeMutation,
} from './data';
import { createAttributeUpdater, validators } from './validators';

export default function Edit( {
	attributes,
	setAttributes,
}: {
  attributes: PersistenceLikeButtonAttributes;
  setAttributes: (
		attrs: Partial< PersistenceLikeButtonAttributes >,
	) => void;
} ) {
  const editorManifest = parseManifestDocument( currentManifest );
  const editorFieldMap = new Map(
		createEditorModel( editorManifest, {
			manual: [ 'content', 'resourceKey' ],
			labels: {
				likeLabel: __( 'Like Label', 'persistence-examples' ),
				resourceKey: __( 'Resource Key', 'persistence-examples' ),
				showCount: __( 'Show Count', 'persistence-examples' ),
				unlikeLabel: __( 'Unlike Label', 'persistence-examples' ),
			},
		} ).map( ( field ) => [ field.path, field ] ),
	);
  const showCountField = editorFieldMap.get( 'showCount' );
  const likeLabelField = editorFieldMap.get( 'likeLabel' );
  const unlikeLabelField = editorFieldMap.get( 'unlikeLabel' );
  const { errorMessages, isValid } = useTypiaValidation(
    attributes,
    validators.validate,
  );
  const updateAttribute = createAttributeUpdater( attributes, setAttributes );
  const showCount =
		attributes.showCount ??
		( typeof showCountField?.defaultValue === 'boolean'
      ? showCountField.defaultValue
      : true );
  const likeLabel =
		attributes.likeLabel ??
		( typeof likeLabelField?.defaultValue === 'string'
      ? likeLabelField.defaultValue
      : 'Like this' );
  const unlikeLabel =
		attributes.unlikeLabel ??
		( typeof unlikeLabelField?.defaultValue === 'string'
      ? unlikeLabelField.defaultValue
      : 'Unlike' );
  const currentPostId = resolveCurrentEditorPostId();
  const liveQueryEnabled =
		currentPostId > 0 &&
		typeof attributes.resourceKey === 'string' &&
		attributes.resourceKey.length > 0;
  const liveStatusQuery = usePersistenceLikeStatusQuery(
    {
      postId: currentPostId,
      resourceKey: attributes.resourceKey ?? '',
    },
    {
      enabled: liveQueryEnabled,
      staleTime: 5_000,
    },
  );
  const liveBootstrapQuery = usePersistenceLikeBootstrapQuery(
    {
      postId: currentPostId,
      resourceKey: attributes.resourceKey ?? '',
    },
    {
      enabled: liveQueryEnabled,
      staleTime: 5_000,
    },
  );
  const liveToggleMutation = useToggleLikeMutation();
  const liveToggleValidationMessages =
		liveToggleMutation.validation?.isValid === false
      ? liveToggleMutation.validation.errors.map(
          ( error ) => `${ error.path }: ${ error.expected }`,
        )
      : [];
  const liveQueryValidationMessages =
		liveStatusQuery.validation?.isValid === false
      ? liveStatusQuery.validation.errors.map(
          ( error ) => `${ error.path }: ${ error.expected }`,
        )
      : [];
  let liveErrorMessage: string | null = null;
  if ( liveToggleMutation.error instanceof Error ) {
    liveErrorMessage = liveToggleMutation.error.message;
  } else if ( liveStatusQuery.error instanceof Error ) {
    liveErrorMessage = liveStatusQuery.error.message;
  } else if ( liveBootstrapQuery.error instanceof Error ) {
    liveErrorMessage = liveBootstrapQuery.error.message;
  }
  const liveStatus = liveStatusQuery.data;
  const liveBootstrap = liveBootstrapQuery.data;
  let liveButtonLabel = likeLabel;
  if ( liveBootstrap?.likedByCurrentUser === true ) {
    liveButtonLabel = unlikeLabel;
  }
  let liveLikeStateLabel = __( 'Unknown', 'persistence-examples' ) as string;
  if ( liveBootstrap?.likedByCurrentUser === true ) {
    liveLikeStateLabel = __( 'Yes', 'persistence-examples' ) as string;
  } else if ( liveBootstrap?.likedByCurrentUser === false ) {
    liveLikeStateLabel = __( 'No', 'persistence-examples' ) as string;
  }

  return (
		<>
			<InspectorControls>
				<PanelBody
					title={ __(
						'Persistence Like Button Settings',
						'persistence-examples',
					) }
				>
					<ToggleControl
						label={
							showCountField?.label ||
							__( 'Show Count', 'persistence-examples' )
						}
						checked={ showCount }
						onChange={ ( value ) =>
							updateAttribute( 'showCount', value )
						}
					/>
					<TextControl
						label={
							likeLabelField?.label ||
							__( 'Like Label', 'persistence-examples' )
						}
						value={ likeLabel }
						onChange={ ( value ) =>
							updateAttribute( 'likeLabel', value )
						}
					/>
					<TextControl
						label={
							unlikeLabelField?.label ||
							__( 'Unlike Label', 'persistence-examples' )
						}
						value={ unlikeLabel }
						onChange={ ( value ) =>
							updateAttribute( 'unlikeLabel', value )
						}
					/>
					<TextControl
						label={ __( 'Resource Key', 'persistence-examples' ) }
						value={ attributes.resourceKey ?? '' }
						onChange={ ( value ) =>
							updateAttribute( 'resourceKey', value )
						}
						help={ __(
							'Stable key used by the like-button endpoint.',
							'persistence-examples',
						) }
					/>
					<Notice status="info" isDismissible={ false }>
						{ __(
							'Policy: authenticated (logged-in user + REST nonce)',
							'persistence-examples',
						) }
					</Notice>
					<Notice status="info" isDismissible={ false }>
						{ __(
							'Storage: custom-table user likes',
							'persistence-examples',
						) }
					</Notice>
					<PanelBody
						title={ __(
							'Live Endpoint Preview',
							'persistence-examples',
						) }
						initialOpen={ false }
					>
						{ liveQueryEnabled ? (
							<>
								<p>
									{ __(
										'Editor post ID:',
										'persistence-examples',
									) }{ ' ' }
									{ currentPostId }
								</p>
								<p>
									{ __(
										'Live likes:',
										'persistence-examples',
									) }{ ' ' }
									{ typeof liveStatus?.count === 'number'
										? liveStatus.count
										: '—' }
								</p>
								<p>
									{ __(
										'Current user liked:',
										'persistence-examples',
									) }{ ' ' }
									{ liveLikeStateLabel }
								</p>
								<Button
									variant="secondary"
									disabled={
										liveStatusQuery.isFetching ||
										liveBootstrapQuery.isFetching ||
										liveToggleMutation.isPending
									}
									onClick={ () =>
										void liveToggleMutation.mutateAsync( {
											postId: currentPostId,
											resourceKey:
												attributes.resourceKey ?? '',
										} )
									}
								>
									{ liveToggleMutation.isPending
										? __(
												'Updating…',
												'persistence-examples',
										  )
										: liveButtonLabel }
								</Button>
								<Button
									variant="tertiary"
									disabled={
										liveStatusQuery.isFetching ||
										liveBootstrapQuery.isFetching ||
										liveToggleMutation.isPending
									}
									onClick={ () =>
										void Promise.all( [
											liveStatusQuery.refetch(),
											liveBootstrapQuery.refetch(),
										] )
									}
								>
									{ liveStatusQuery.isFetching
										? __(
												'Refreshing…',
												'persistence-examples',
										  )
										: __(
												'Refresh live status',
												'persistence-examples',
										  ) }
								</Button>
								<Notice status="info" isDismissible={ false }>
									{ __(
										'This panel uses the new @wp-typia/rest/react query and mutation hooks against the authenticated endpoint surface.',
										'persistence-examples',
									) }
								</Notice>
								{ liveErrorMessage && (
									<Notice
										status="error"
										isDismissible={ false }
									>
										{ liveErrorMessage }
									</Notice>
								) }
								{ [
									...liveQueryValidationMessages,
									...liveToggleValidationMessages,
								].map( ( message, index ) => (
									<Notice
										key={ `${ message }-${ index }` }
										status="error"
										isDismissible={ false }
									>
										{ message }
									</Notice>
								) ) }
							</>
						) : (
							<Notice status="warning" isDismissible={ false }>
								{ __(
									'Set a resource key while editing a post to enable the live authenticated endpoint preview.',
									'persistence-examples',
								) }
							</Notice>
						) }
					</PanelBody>
				</PanelBody>
			</InspectorControls>
			<div { ...useBlockProps() }>
				<RichText
					tagName="p"
					className="wp-block-create-block-persistence-like-button__content"
					value={ attributes.content }
					onChange={ ( value ) =>
						updateAttribute( 'content', value )
					}
					placeholder={ __(
						'Persistence like button example',
						'persistence-examples',
					) }
				/>
				<p>
					{ __( 'Resource key:', 'persistence-examples' ) }{ ' ' }
					{ attributes.resourceKey || '—' }
				</p>
				{ ! isValid && (
					<Notice status="error" isDismissible={ false }>
						<ul>
							{ errorMessages.map( ( error, index ) => (
								<li key={ index }>{ error }</li>
							) ) }
						</ul>
					</Notice>
				) }
			</div>
		</>
	);
}
