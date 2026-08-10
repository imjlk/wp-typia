<?php
/**
 * Render callback for the Persistence Counter example block.
 *
 * @package PersistenceExamples
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

if ( ! file_exists( __DIR__ . '/typia-validator.php' ) ) {
	return '';
}

$validator = require __DIR__ . '/typia-validator.php';
if ( ! is_object( $validator ) || ! method_exists( $validator, 'apply_defaults' ) || ! method_exists( $validator, 'validate' ) ) {
	return '';
}

$normalized   = $validator->apply_defaults( is_array( $attributes ) ? $attributes : array() );
$validation   = $validator->validate( $normalized );
$resource_key = isset( $normalized['resourceKey'] ) ? (string) $normalized['resourceKey'] : '';

if ( empty( $validation['valid'] ) || '' === $resource_key ) {
	return '';
}

$content      = isset( $normalized['content'] ) ? (string) $normalized['content'] : '';
$button_label = isset( $normalized['buttonLabel'] ) ? (string) $normalized['buttonLabel'] : 'Persist Count';
$post_id      = is_object( $block ) && isset( $block->context['postId'] )
	? (int) $block->context['postId']
	: (int) get_queried_object_id();

persistence_examples_record_rendered_block_instance(
	(int) $post_id,
	'create-block/persistence-counter',
	$resource_key
);

$context      = array(
	'bootstrapReady' => false,
	'buttonLabel' => $button_label,
	'canWrite'       => false,
	'client'         => array(
		'writeExpiry' => 0,
		'writeToken'  => '',
	),
	'count'          => 0,
	'error'          => '',
	'isBootstrapping' => false,
	'isLoading'      => false,
	'isSaving'       => false,
	'postId'         => (int) $post_id,
	'resourceKey'    => $resource_key,
	'storage'        => 'custom-table',
);

$wrapper_attributes = get_block_wrapper_attributes(
	array(
		'data-wp-context'       => wp_json_encode( $context ),
		'data-wp-interactive'   => 'persistenceExamplesCounter',
		'data-wp-init'          => 'callbacks.init',
		'data-wp-run--mounted' => 'callbacks.mounted',
	)
);
?>

<div <?php echo $wrapper_attributes; ?>>
	<div class="persistence-counter-frontend">
		<p class="persistence-counter-frontend__content"><?php echo esc_html( $content ); ?></p>
		<p class="persistence-counter-frontend__notice">
			<?php esc_html_e( 'Public writes use a signed short-lived token.', 'persistence-examples' ); ?>
		</p>
		<p
			class="persistence-counter-frontend__error"
			role="status"
			aria-live="polite"
			aria-atomic="true"
			data-wp-bind--hidden="!context.error"
			data-wp-text="context.error"
			hidden
		></p>
		<?php if ( ! empty( $normalized['showCount'] ) ) : ?>
			<span
				class="persistence-counter-frontend__count"
				role="status"
				aria-live="polite"
				aria-atomic="true"
				data-wp-text="context.count"
			>0</span>
		<?php endif; ?>
		<button
			type="button"
			disabled
			data-wp-bind--disabled="!context.canWrite"
			data-wp-on--click="actions.increment"
		>
			<?php echo esc_html( $button_label ); ?>
		</button>
	</div>
</div>
