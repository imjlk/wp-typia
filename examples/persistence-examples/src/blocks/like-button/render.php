<?php
/**
 * Render callback for the Persistence Like Button example block.
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
$like_label   = isset( $normalized['likeLabel'] ) ? (string) $normalized['likeLabel'] : 'Like this';
$unlike_label = isset( $normalized['unlikeLabel'] ) ? (string) $normalized['unlikeLabel'] : 'Unlike';
$post_id      = is_object( $block ) && isset( $block->context['postId'] )
	? (int) $block->context['postId']
	: (int) get_queried_object_id();

persistence_examples_record_rendered_block_instance(
	(int) $post_id,
	'create-block/persistence-like-button',
	$resource_key
);

$context      = array(
	'bootstrapReady' => false,
	'buttonLabel'    => $like_label,
	'canWrite'       => false,
	'client'         => array(
		'liked'      => false,
		'writeNonce' => '',
	),
	'count'          => 0,
	'error'          => '',
	'isBootstrapping' => false,
	'isLoading'      => false,
	'isSaving'       => false,
	'likeLabel'      => $like_label,
	'postId'         => (int) $post_id,
	'resourceKey'    => $resource_key,
	'storage'        => 'custom-table',
	'unlikeLabel'    => $unlike_label,
);

$wrapper_attributes = get_block_wrapper_attributes(
	array(
		'data-wp-context'       => wp_json_encode( $context ),
		'data-wp-interactive'   => 'persistenceExamplesLikeButton',
		'data-wp-init'          => 'callbacks.init',
		'data-wp-run--mounted' => 'callbacks.mounted',
	)
);
?>

<div <?php echo $wrapper_attributes; ?>>
	<div class="persistence-like-button-frontend">
		<p class="persistence-like-button-frontend__content"><?php echo esc_html( $content ); ?></p>
		<p
			class="persistence-like-button-frontend__notice"
			data-wp-bind--hidden="!context.bootstrapReady || context.canWrite"
			hidden
		>
			<?php esc_html_e( 'Sign in to like this item.', 'persistence-examples' ); ?>
		</p>
		<p
			class="persistence-like-button-frontend__error"
			role="status"
			aria-live="polite"
			aria-atomic="true"
			data-wp-bind--hidden="!context.error"
			data-wp-text="context.error"
			hidden
		></p>
		<?php if ( ! empty( $normalized['showCount'] ) ) : ?>
			<span
				class="persistence-like-button-frontend__count"
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
			data-wp-on--click="actions.toggle"
			data-wp-text="context.buttonLabel"
		>
			<?php echo esc_html( $like_label ); ?>
		</button>
	</div>
</div>
