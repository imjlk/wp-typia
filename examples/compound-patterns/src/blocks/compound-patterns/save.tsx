import { InnerBlocks, RichText, useBlockProps } from '@wordpress/block-editor';

import type { CompoundPatternsAttributes } from './types';

export default function Save( {
	attributes,
}: {
  attributes: CompoundPatternsAttributes;
} ) {
  return (
		<div
			{ ...useBlockProps.save( {
				className: 'wp-block-compound-patterns',
				'data-show-dividers':
					(attributes.showDividers ?? true) ? 'true' : 'false',
			} ) }
		>
			<RichText.Content
				tagName="h3"
				className="wp-block-compound-patterns__heading"
				value={ attributes.heading }
			/>
			<RichText.Content
				tagName="p"
				className="wp-block-compound-patterns__intro"
				value={ attributes.intro ?? '' }
			/>
			<div className="wp-block-compound-patterns__items">
				<InnerBlocks.Content />
			</div>
		</div>
	);
}
