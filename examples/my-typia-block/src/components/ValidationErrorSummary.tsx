import { __ } from '@wordpress/i18n';

interface ValidationErrorSummaryProps {
  errors: string[];
}

/**
 * Renders the shared validation error heading and message list used by the example UI.
 * @param root0
 * @param root0.errors
 */
export function ValidationErrorSummary( {
	errors,
}: ValidationErrorSummaryProps ) {
  return (
		<>
			<p>
				<strong>
					{ __( 'Validation Errors:', 'my-typia-block' ) }
				</strong>
			</p>
			<ul style={ { margin: 0, paddingLeft: '1em' } }>
				{ errors.map( ( error, index ) => (
					<li key={ index }>{ error }</li>
				) ) }
			</ul>
		</>
	);
}
