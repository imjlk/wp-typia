import { RichText, useBlockProps } from '@wordpress/block-editor';
import { __ } from '@wordpress/i18n';

import type { CompoundPatternsItemAttributes } from './types';

export default function Edit( {
	attributes,
	setAttributes,
}: {
  attributes: CompoundPatternsItemAttributes;
  setAttributes: ( attrs: Partial< CompoundPatternsItemAttributes > ) => void;
} ) {
  return (
		<div
			{ ...useBlockProps({
        className: 'wp-block-compound-patterns-item',
      }) }
		>
			<RichText
				tagName="h4"
				className="wp-block-compound-patterns-item__title"
				value={ attributes.title }
				onChange={ ( title ) => setAttributes( { title } ) }
				placeholder={ __(
					'Compound Patterns Item',
					'compound_patterns',
				) }
			/>
			<RichText
				tagName="p"
				className="wp-block-compound-patterns-item__body"
				value={ attributes.body }
				onChange={ ( body ) => setAttributes( { body } ) }
				placeholder={ __(
					'Add supporting details for this internal item.',
					'compound_patterns',
				) }
			/>
		</div>
	);
}
