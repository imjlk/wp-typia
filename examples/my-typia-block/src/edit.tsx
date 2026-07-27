/* eslint-disable no-console */
import type { BlockEditProps } from '@wp-typia/block-types/blocks/registration';
import {
  useBlockProps,
  InspectorControls,
  RichText,
} from '@wordpress/block-editor';
import { Notice, PanelBody, RangeControl } from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { useEffect, useMemo } from '@wordpress/element';
import {
  InspectorFromManifest,
  useEditorFields,
  useTypedAttributeUpdater,
} from '@wp-typia/block-runtime/inspector';
import { generateBlockId } from '@wp-typia/block-runtime/identifiers';
import currentManifest from './manifest-document';
import { MyTypiaBlockAttributes } from './types';
import { sanitizeMyTypiaBlockAttributes, validators } from './validators';
import { useTypiaValidation, useAttributeLogger, useDebounce } from './hooks';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ValidationErrorSummary } from './components/ValidationErrorSummary';
import { MigrationDashboard } from './admin/migration-dashboard';
import { classNames } from './utils';

type EditProps = BlockEditProps< MyTypiaBlockAttributes >;
type AlignmentValue = NonNullable< MyTypiaBlockAttributes[ 'alignment' ] >;
type AspectRatioValue = NonNullable< MyTypiaBlockAttributes[ 'aspectRatio' ] >;
type BackgroundColorValue = NonNullable<
	MyTypiaBlockAttributes[ 'backgroundColor' ]
>;
type FontSizeValue = NonNullable< MyTypiaBlockAttributes[ 'fontSize' ] >;
type PaddingKey = keyof NonNullable< MyTypiaBlockAttributes[ 'padding' ] >;
type TextColorValue = NonNullable< MyTypiaBlockAttributes[ 'textColor' ] >;

const FONT_SIZE_STYLES = {
  large: '1.25rem',
  medium: '1rem',
  small: '0.875rem',
  xlarge: '1.75rem',
} as const satisfies Record< string, string >;
const ALIGNMENT_VALUES = [ 'left', 'center', 'right', 'justify' ] as const;
const ASPECT_RATIO_VALUES = [
  'auto',
  '1',
  '1/1',
  '4/3',
  '3/4',
  '3/2',
  '2/3',
  '16/9',
  '9/16',
  '21/9',
] as const;
const FONT_SIZE_VALUES = [ 'small', 'medium', 'large', 'xlarge' ] as const;
const COLOR_VALUES = [
  'transparent',
  'currentColor',
  'inherit',
  'initial',
  'unset',
] as const;
const SHOWCASE_INSPECTOR_PATHS = [
  'isVisible',
  'alignment',
  'fontSize',
  'textColor',
  'backgroundColor',
  'aspectRatio',
  'borderRadius',
] as const;

function coerceStringEnum< T extends string >(
	value: string,
	allowedValues: readonly T[],
	fallback: T,
): T {
  return allowedValues.includes( value as T ) ? ( value as T ) : fallback;
}

function getFontSizeStyle( fontSize: FontSizeValue ): string {
  switch ( fontSize ) {
    case 'small':
      return FONT_SIZE_STYLES.small;
    case 'large':
      return FONT_SIZE_STYLES.large;
    case 'xlarge':
      return FONT_SIZE_STYLES.xlarge;
    case 'medium':
    default:
      return FONT_SIZE_STYLES.medium;
  }
}

export default function Edit( { attributes, setAttributes }: EditProps ) {
  const blockProps = useBlockProps();
  const editorFields = useEditorFields(currentManifest, {
    hidden: ['id', 'version'],
    labels: {
      alignment: __('Alignment', 'my-typia-block'),
      animation: __('Animation', 'my-typia-block'),
      aspectRatio: __('Aspect Ratio', 'my-typia-block'),
      backgroundColor: __('Background Color', 'my-typia-block'),
      borderRadius: __('Border Radius', 'my-typia-block'),
      className: __('CSS Class', 'my-typia-block'),
      content: __('Content', 'my-typia-block'),
      fontSize: __('Font Size', 'my-typia-block'),
      isVisible: __('Visible', 'my-typia-block'),
      linkTarget: __('Link Target', 'my-typia-block'),
      'padding.bottom': __('Padding Bottom', 'my-typia-block'),
      'padding.left': __('Padding Left', 'my-typia-block'),
      'padding.right': __('Padding Right', 'my-typia-block'),
      'padding.top': __('Padding Top', 'my-typia-block'),
      textColor: __('Text Color', 'my-typia-block'),
    },
    manual: ['animation', 'className', 'content', 'linkTarget'],
    preferTextarea: ['content'],
  });
  const paddingBottomField = editorFields.getField( 'padding.bottom' );
  const paddingLeftField = editorFields.getField( 'padding.left' );
  const paddingRightField = editorFields.getField( 'padding.right' );
  const paddingTopField = editorFields.getField( 'padding.top' );
  const alignment = coerceStringEnum< AlignmentValue >(
    editorFields.getStringValue(attributes, 'alignment', 'left'),
    ALIGNMENT_VALUES,
    'left',
  );
  const aspectRatio = coerceStringEnum< AspectRatioValue >(
    editorFields.getStringValue(attributes, 'aspectRatio', '16/9'),
    ASPECT_RATIO_VALUES,
    '16/9',
  );
  const backgroundColor = coerceStringEnum< BackgroundColorValue >(
    editorFields.getStringValue(attributes, 'backgroundColor', 'transparent'),
    COLOR_VALUES,
    'transparent',
  );
  const borderRadius = editorFields.getNumberValue(
    attributes,
    'borderRadius',
    0,
  );
  const fontSize = coerceStringEnum< FontSizeValue >(
    editorFields.getStringValue(attributes, 'fontSize', 'medium'),
    FONT_SIZE_VALUES,
    'medium',
  );
  const isVisible = editorFields.getBooleanValue(attributes, 'isVisible', true);
  const padding = {
    bottom: editorFields.getNumberValue(attributes, 'padding.bottom', 0),
    left: editorFields.getNumberValue(attributes, 'padding.left', 0),
    right: editorFields.getNumberValue(attributes, 'padding.right', 0),
    top: editorFields.getNumberValue(attributes, 'padding.top', 0),
  };
  const textColor = coerceStringEnum< TextColorValue >(
    editorFields.getStringValue(attributes, 'textColor', 'currentColor'),
    COLOR_VALUES,
    'currentColor',
  );
  const inspectorPaths = useMemo(
    () =>
      SHOWCASE_INSPECTOR_PATHS.filter(( path ) =>
        editorFields.fieldMap.has(path),
      ),
    [editorFields.fieldMap],
  );
  const missingInspectorPaths = useMemo(
    () =>
      SHOWCASE_INSPECTOR_PATHS.filter(
        ( path ) => ! editorFields.fieldMap.has( path ),
      ),
    [editorFields.fieldMap],
  );
  const { errorMessages, isValid } = useTypiaValidation(
    attributes,
    validators.validate,
  );
  const debouncedAttributes = useDebounce( attributes, 300 );
  const validateEditorUpdate = ( nextAttributes: MyTypiaBlockAttributes ) => {
    try {
      return {
        data: sanitizeMyTypiaBlockAttributes(nextAttributes),
        errors: [],
        isValid: true as const,
      };
    } catch ( error ) {
      if ( process.env.NODE_ENV !== 'production' ) {
        console.warn('Sanitization failed, falling back to validation.', error);
      }

      return validators.validate( nextAttributes );
    }
  };
  const { updateField } = useTypedAttributeUpdater(
    attributes,
    setAttributes,
    validateEditorUpdate,
  );

  useEffect(() => {
    if ( attributes.id ) {
      return;
    }

    updateField('id', generateBlockId());
  }, [attributes.id, updateField]);

	// Log attribute changes in development
  useAttributeLogger( debouncedAttributes );

  useEffect( () => {
		if (
			process.env.NODE_ENV === 'production' ||
			missingInspectorPaths.length === 0
		) {
			return;
		}

		console.warn(
			'InspectorFromManifest skipped unknown showcase paths.',
			missingInspectorPaths,
		);
	}, [ missingInspectorPaths ] );

  const updatePadding = ( side: PaddingKey, nextValue: number ) =>
		updateField( `padding.${ side }`, nextValue );

  const previewStyle = {
    aspectRatio: aspectRatio === 'auto' ? undefined : aspectRatio,
    backgroundColor,
    borderRadius: `${ borderRadius }px`,
    color: textColor,
    fontSize: getFontSizeStyle(fontSize),
    padding: `${ padding.top }px ${ padding.right }px ${ padding.bottom }px ${ padding.left }px`,
    textAlign: alignment,
  };

  return (
		<ErrorBoundary>
			<InspectorControls>
				<InspectorFromManifest
					attributes={ attributes }
					fieldLookup={ editorFields }
					onChange={ updateField }
					paths={ inspectorPaths }
					title={ __( 'Settings', 'my-typia-block' ) }
				>
					<RangeControl
						label={
							paddingTopField?.label ??
							__( 'Padding Top', 'my-typia-block' )
						}
						value={ padding.top }
						min={ paddingTopField?.minimum ?? 0 }
						max={ 64 }
						step={ paddingTopField?.step ?? 1 }
						onChange={ ( value ) =>
							updatePadding( 'top', value ?? padding.top )
						}
					/>
					<RangeControl
						label={
							paddingRightField?.label ??
							__( 'Padding Right', 'my-typia-block' )
						}
						value={ padding.right }
						min={ paddingRightField?.minimum ?? 0 }
						max={ 64 }
						step={ paddingRightField?.step ?? 1 }
						onChange={ ( value ) =>
							updatePadding( 'right', value ?? padding.right )
						}
					/>
					<RangeControl
						label={
							paddingBottomField?.label ??
							__( 'Padding Bottom', 'my-typia-block' )
						}
						value={ padding.bottom }
						min={ paddingBottomField?.minimum ?? 0 }
						max={ 64 }
						step={ paddingBottomField?.step ?? 1 }
						onChange={ ( value ) =>
							updatePadding( 'bottom', value ?? padding.bottom )
						}
					/>
					<RangeControl
						label={
							paddingLeftField?.label ??
							__( 'Padding Left', 'my-typia-block' )
						}
						value={ padding.left }
						min={ paddingLeftField?.minimum ?? 0 }
						max={ 64 }
						step={ paddingLeftField?.step ?? 1 }
						onChange={ ( value ) =>
							updatePadding( 'left', value ?? padding.left )
						}
					/>
					{ ! isValid && (
						<div className="components-notice is-error">
							<ValidationErrorSummary errors={ errorMessages } />
						</div>
					) }
				</InspectorFromManifest>
				{ editorFields.manualFields.length > 0 && (
					<PanelBody
						title={ __( 'Manual Typia Fields', 'my-typia-block' ) }
						initialOpen={ false }
					>
						<Notice status="info" isDismissible={ false }>
							<p>
								{ __(
									'These manifest fields stay manual in the reference app:',
									'my-typia-block',
								) }
							</p>
							<ul style={ { margin: 0, paddingLeft: '1em' } }>
								{ editorFields.manualFields.map( ( field ) => (
									<li key={ field.path }>
										<strong>{ field.label }</strong>
										{ field.reason
											? ` — ${ field.reason }`
											: '' }
									</li>
								) ) }
							</ul>
						</Notice>
					</PanelBody>
				) }
				<PanelBody
					title={ __( 'Migration Manager', 'my-typia-block' ) }
					initialOpen={ false }
				>
					<MigrationDashboard />
				</PanelBody>
			</InspectorControls>

			<div
				{ ...blockProps }
				className={ classNames( blockProps.className, {
					'has-validation-errors': ! isValid,
					'is-hidden': ! isVisible,
				} ) }
			>
				<div className="my-typia-block-editor">
					My Typia Block - Editor View
				</div>
				<div className="my-typia-block-preview" style={ previewStyle }>
					<RichText
						tagName="p"
						value={ attributes.content }
						onChange={ ( content ) =>
							updateField( 'content', content )
						}
						placeholder={ __(
							'Enter your text…',
							'my-typia-block',
						) }
						className={ classNames(
							'my-typia-block-content',
							`align-${ alignment }`,
						) }
					/>
				</div>
				{ ! isValid && (
					<Notice status="error" isDismissible={ false }>
						<ValidationErrorSummary errors={ errorMessages } />
					</Notice>
				) }

				<div className="block-info">
					<small>
						{ __(
							'My Typia Block – showcase of Typia validation, manifest-driven editor helpers, migrations, and interactivity.',
							'my-typia-block',
						) }
					</small>
				</div>
			</div>
		</ErrorBoundary>
	);
}
