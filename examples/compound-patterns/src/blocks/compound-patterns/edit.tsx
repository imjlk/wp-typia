import { __ } from '@wordpress/i18n';
import {
  InspectorControls,
  InnerBlocks,
  RichText,
  useBlockProps,
} from '@wordpress/block-editor';
import { PanelBody, ToggleControl } from '@wordpress/components';

import type { CompoundPatternsAttributes } from './types';

const CHILD_BLOCK_NAME = 'create-block/compound-patterns-item';
const DEFAULT_TEMPLATE: Parameters< typeof InnerBlocks >[ 0 ][ 'template' ] = [
  [
    CHILD_BLOCK_NAME,
    {
      body: 'Add supporting details for the first internal item.',
      title: 'First Item',
    },
  ],
  [
    CHILD_BLOCK_NAME,
    {
      body: 'Add supporting details for the second internal item.',
      title: 'Second Item',
    },
  ],
];

export default function Edit( {
	attributes,
	setAttributes,
}: {
  attributes: CompoundPatternsAttributes;
  setAttributes: ( attrs: Partial< CompoundPatternsAttributes > ) => void;
} ) {
  const blockProps = useBlockProps({
    className: 'wp-block-compound-patterns',
  });

  return (
		<>
			<InspectorControls>
				<PanelBody
					title={ __( 'Compound Settings', 'compound_patterns' ) }
				>
					<ToggleControl
						label={ __(
							'Show dividers between items',
							'compound_patterns',
						) }
						checked={ attributes.showDividers ?? true }
						onChange={ ( value ) =>
							setAttributes( { showDividers: value } )
						}
					/>
				</PanelBody>
			</InspectorControls>
			<div { ...blockProps }>
				<RichText
					tagName="h3"
					className="wp-block-compound-patterns__heading"
					value={ attributes.heading }
					onChange={ ( heading ) => setAttributes( { heading } ) }
					placeholder={ __(
						'Compound Patterns',
						'compound_patterns',
					) }
				/>
				<RichText
					tagName="p"
					className="wp-block-compound-patterns__intro"
					value={ attributes.intro ?? '' }
					onChange={ ( intro ) => setAttributes( { intro } ) }
					placeholder={ __(
						'Add and reorder internal items inside this compound block.',
						'compound_patterns',
					) }
				/>
				<div className="wp-block-compound-patterns__items">
					<InnerBlocks
						allowedBlocks={ [ CHILD_BLOCK_NAME ] }
						renderAppender={ InnerBlocks.ButtonBlockAppender }
						template={ DEFAULT_TEMPLATE }
						templateLock={ false }
					/>
				</div>
			</div>
		</>
	);
}
