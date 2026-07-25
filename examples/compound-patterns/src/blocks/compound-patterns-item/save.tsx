import { RichText, useBlockProps } from '@wordpress/block-editor';

import type { CompoundPatternsItemAttributes } from './types';

export default function Save( {
	attributes,
}: {
  attributes: CompoundPatternsItemAttributes;
} ) {
  return (
		<div
			{ ...useBlockProps.save({
        className: 'wp-block-compound-patterns-item',
      }) }
		>
			<RichText.Content
				tagName="h4"
				className="wp-block-compound-patterns-item__title"
				value={ attributes.title }
			/>
			<RichText.Content
				tagName="p"
				className="wp-block-compound-patterns-item__body"
				value={ attributes.body }
			/>
		</div>
	);
}
