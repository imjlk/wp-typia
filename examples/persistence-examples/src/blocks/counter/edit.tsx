import { __ } from '@wordpress/i18n';
import {
  InspectorControls,
  RichText,
  useBlockProps,
} from '@wordpress/block-editor';
import {
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
import type { PersistenceCounterAttributes } from './types';
import { createAttributeUpdater, validators } from './validators';

export default function Edit( {
	attributes,
	setAttributes,
}: {
  attributes: PersistenceCounterAttributes;
  setAttributes: ( attrs: Partial< PersistenceCounterAttributes > ) => void;
} ) {
  const editorManifest = parseManifestDocument( currentManifest );
  const editorFieldMap = new Map(
		createEditorModel( editorManifest, {
			manual: [ 'content', 'resourceKey' ],
			labels: {
				buttonLabel: __( 'Button Label', 'persistence-examples' ),
				resourceKey: __( 'Resource Key', 'persistence-examples' ),
				showCount: __( 'Show Count', 'persistence-examples' ),
			},
		} ).map( ( field ) => [ field.path, field ] ),
	);
  const showCountField = editorFieldMap.get( 'showCount' );
  const buttonLabelField = editorFieldMap.get( 'buttonLabel' );
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
  const buttonLabel =
		attributes.buttonLabel ??
		( typeof buttonLabelField?.defaultValue === 'string'
      ? buttonLabelField.defaultValue
      : 'Persist Count' );

  return (
		<>
			<InspectorControls>
				<PanelBody
					title={ __(
						'Persistence Counter Settings',
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
							buttonLabelField?.label ||
							__( 'Button Label', 'persistence-examples' )
						}
						value={ buttonLabel }
						onChange={ ( value ) =>
							updateAttribute( 'buttonLabel', value )
						}
					/>
					<TextControl
						label={ __( 'Resource Key', 'persistence-examples' ) }
						value={ attributes.resourceKey ?? '' }
						onChange={ ( value ) =>
							updateAttribute( 'resourceKey', value )
						}
						help={ __(
							'Stable key used by the public counter endpoint.',
							'persistence-examples',
						) }
					/>
					<Notice status="info" isDismissible={ false }>
						{ __(
							'Policy: public signed write token',
							'persistence-examples',
						) }
					</Notice>
					<Notice status="info" isDismissible={ false }>
						{ __(
							'Storage: custom-table aggregate counter',
							'persistence-examples',
						) }
					</Notice>
				</PanelBody>
			</InspectorControls>
			<div { ...useBlockProps() }>
				<RichText
					tagName="p"
					className="wp-block-create-block-persistence-counter__content"
					value={ attributes.content }
					onChange={ ( value ) =>
						updateAttribute( 'content', value )
					}
					placeholder={ __(
						'Persistence counter example',
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
