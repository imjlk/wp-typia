import { quoteTsString } from './cli-add-shared.js';
import { quotePhpString } from '../shared/php-utils.js';
import { toTitleCase } from '../shared/string-case.js';
import type {
  BindingPostMetaSource,
  BindingTarget,
} from './cli-add-workspace-binding-source-types.js';

/**
 * Render one `scripts/block-config.ts` binding-source inventory entry.
 *
 * @param bindingSourceSlug Normalized binding-source slug.
 * @param target Optional block attribute target wired to the binding source.
 * @param postMeta Optional post-meta contract backing this binding source.
 * @returns TypeScript source for the inventory entry.
 */
export function buildBindingSourceConfigEntry(
	bindingSourceSlug: string,
	target?: BindingTarget,
	postMeta?: BindingPostMetaSource,
): string {
  return [
		'\t{',
		...(target ? [`\t\tattribute: ${quoteTsString(target.attributeName)},`] : []),
		...(target ? [`\t\tblock: ${quoteTsString(target.blockSlug)},`] : []),
		`\t\teditorFile: ${quoteTsString(`src/bindings/${bindingSourceSlug}/editor.ts`)},`,
		...(postMeta ? [`\t\tmetaPath: ${quoteTsString(postMeta.metaPath)},`] : []),
		...(postMeta ? [`\t\tpostMeta: ${quoteTsString(postMeta.postMetaSlug)},`] : []),
		`\t\tserverFile: ${quoteTsString(`src/bindings/${bindingSourceSlug}/server.php`)},`,
		`\t\tslug: ${quoteTsString(bindingSourceSlug)},`,
		'\t},',
	].join('\n');
}

function buildPhpStringList(values: readonly string[]): string {
  if (values.length === 0) {
    return 'array()';
  }

  return `array( ${values.map((value) => quotePhpString(value)).join(', ')} )`;
}

function buildBindingPostMetaServerSource(options: {
  bindingSourceSlug: string;
  namespace: string;
  phpPrefix: string;
  postMeta: BindingPostMetaSource;
  target?: BindingTarget;
  textDomain: string;
}): string {
  const bindingSourceTitle = toTitleCase(options.bindingSourceSlug);
  const bindingSourcePhpId = options.bindingSourceSlug.replace(/-/g, '_');
  const functionPrefix = `${options.phpPrefix}_${bindingSourcePhpId}`;
  const fieldsFunctionName = `${functionPrefix}_post_meta_binding_fields`;
  const canReadFunctionName = `${functionPrefix}_can_read_post_meta`;
  const resolveFunctionName = `${functionPrefix}_resolve_binding_source_value`;
  const supportedAttributesFunctionName = `${functionPrefix}_supported_binding_attributes`;
  const fieldNames = options.postMeta.fields.map((field) => field.name);
  const supportedAttributesSource = options.target
		? `
if ( ! function_exists( '${supportedAttributesFunctionName}' ) ) {
\tfunction ${supportedAttributesFunctionName}( array $supported_attributes ) : array {
\t\tif ( ! in_array( ${quotePhpString(options.target.attributeName)}, $supported_attributes, true ) ) {
\t\t\t$supported_attributes[] = ${quotePhpString(options.target.attributeName)};
\t\t}

\t\treturn $supported_attributes;
\t}
}
`
		: '';
  const supportedAttributesHook = options.target
		? `
if ( function_exists( '${supportedAttributesFunctionName}' ) ) {
\tadd_filter(
\t\t${quotePhpString(`block_bindings_supported_attributes_${options.namespace}/${options.target.blockSlug}`)},
\t\t${quotePhpString(supportedAttributesFunctionName)}
\t);
}
`
		: '';

  return `<?php
if ( ! defined( 'ABSPATH' ) ) {
\treturn;
}

if ( ! function_exists( 'register_block_bindings_source' ) ) {
\treturn;
}

if ( ! function_exists( '${fieldsFunctionName}' ) ) {
\tfunction ${fieldsFunctionName}() : array {
\t\t$schema_file = dirname( __DIR__, 3 ) . '/${options.postMeta.schemaFile}';
\t\tif ( file_exists( $schema_file ) ) {
\t\t\t$schema = json_decode( (string) file_get_contents( $schema_file ), true );
\t\t\tif ( is_array( $schema ) && isset( $schema['properties'] ) && is_array( $schema['properties'] ) ) {
\t\t\t\treturn array_values( array_filter( array_keys( $schema['properties'] ), 'is_string' ) );
\t\t\t}
\t\t}

\t\treturn ${buildPhpStringList(fieldNames)};
\t}
}

if ( ! function_exists( '${canReadFunctionName}' ) ) {
\tfunction ${canReadFunctionName}( int $post_id ) : bool {
\t\t$post = get_post( $post_id );
\t\tif ( ! $post ) {
\t\t\treturn false;
\t\t}
\t\t$post_type = is_string( $post->post_type ) ? $post->post_type : '';
\t\tif ( '' === $post_type ) {
\t\t\treturn false;
\t\t}
\t\tif ( ( ! is_post_publicly_viewable( $post ) && ! current_user_can( 'read_post', $post_id ) ) || post_password_required( $post ) ) {
\t\t\treturn false;
\t\t}

\t\t$meta_keys = get_registered_meta_keys( 'post', $post_type );
\t\t$meta_keys = array_merge( $meta_keys, get_registered_meta_keys( 'post', '' ) );

\t\treturn ! empty( $meta_keys[ ${quotePhpString(options.postMeta.metaKey)} ]['show_in_rest'] );
\t}
}

if ( ! function_exists( '${resolveFunctionName}' ) ) {
\tfunction ${resolveFunctionName}( array $source_args, $block_instance = null, $attribute_name = null ) {
\t\tunset( $attribute_name );

\t\t$field = isset( $source_args['field'] ) && is_string( $source_args['field'] )
\t\t\t? $source_args['field']
\t\t\t: ${quotePhpString(options.postMeta.metaPath)};
\t\tif ( ! in_array( $field, ${fieldsFunctionName}(), true ) ) {
\t\t\treturn null;
\t\t}

\t\t$post_id = 0;
\t\tif (
\t\t\tis_object( $block_instance ) &&
\t\t\tproperty_exists( $block_instance, 'context' ) &&
\t\t\tis_array( $block_instance->context ) &&
\t\t\tisset( $block_instance->context['postId'] )
\t\t) {
\t\t\t$post_id = absint( $block_instance->context['postId'] );
\t\t}
\t\tif ( ! $post_id || ! ${canReadFunctionName}( $post_id ) ) {
\t\t\treturn null;
\t\t}

\t\t$value = null;
\t\tif ( $post_id ) {
\t\t\t$meta = get_post_meta( $post_id, ${quotePhpString(options.postMeta.metaKey)}, true );
\t\t\tif ( is_array( $meta ) && array_key_exists( $field, $meta ) ) {
\t\t\t\t$value = $meta[ $field ];
\t\t\t}
\t\t}
\t\tif ( null === $value ) {
\t\t\treturn null;
\t\t}

\t\treturn $value;
\t}
}
${supportedAttributesSource}

register_block_bindings_source(
\t${quotePhpString(`${options.namespace}/${options.bindingSourceSlug}`)},
\tarray(
\t\t'label' => __( ${quotePhpString(bindingSourceTitle)}, ${quotePhpString(options.textDomain)} ),
\t\t'get_value_callback' => ${quotePhpString(resolveFunctionName)},
\t\t'uses_context' => array( 'postId', 'postType' ),
\t)
);
${supportedAttributesHook}`;
}

/**
 * Render the PHP registration module for a generated binding source.
 *
 * @param bindingSourceSlug Normalized binding-source slug.
 * @param phpPrefix Workspace PHP function prefix.
 * @param namespace Workspace block namespace.
 * @param textDomain Workspace text domain used for labels.
 * @param target Optional block attribute target wired to the binding source.
 * @param postMeta Optional post-meta contract backing this binding source.
 * @returns PHP source for `src/bindings/<slug>/server.php`.
 */
export function buildBindingSourceServerSource(
	bindingSourceSlug: string,
	phpPrefix: string,
	namespace: string,
	textDomain: string,
	target?: BindingTarget,
	postMeta?: BindingPostMetaSource,
): string {
  if (postMeta) {
    return buildBindingPostMetaServerSource({
      bindingSourceSlug,
      namespace,
      phpPrefix,
      postMeta,
      target,
      textDomain,
    });
  }

  const bindingSourceTitle = toTitleCase(bindingSourceSlug);
  const bindingSourcePhpId = bindingSourceSlug.replace(/-/g, '_');
  const bindingSourceValueFunctionName = `${phpPrefix}_${bindingSourcePhpId}_binding_source_values`;
  const bindingSourceResolveFunctionName = `${phpPrefix}_${bindingSourcePhpId}_resolve_binding_source_value`;
  const bindingSourceSupportedAttributesFunctionName = `${phpPrefix}_${bindingSourcePhpId}_supported_binding_attributes`;
  const starterValue = `${bindingSourceTitle} starter value`;
  const supportedAttributesSource = target
		? `
if ( ! function_exists( '${bindingSourceSupportedAttributesFunctionName}' ) ) {
\tfunction ${bindingSourceSupportedAttributesFunctionName}( array $supported_attributes ) : array {
\t\tif ( ! in_array( ${quotePhpString(target.attributeName)}, $supported_attributes, true ) ) {
\t\t\t$supported_attributes[] = ${quotePhpString(target.attributeName)};
\t\t}

\t\treturn $supported_attributes;
\t}
}
`
		: '';
  const supportedAttributesHook = target
		? `
if ( function_exists( '${bindingSourceSupportedAttributesFunctionName}' ) ) {
\tadd_filter(
\t\t${quotePhpString(`block_bindings_supported_attributes_${namespace}/${target.blockSlug}`)},
\t\t${quotePhpString(bindingSourceSupportedAttributesFunctionName)}
\t);
}
`
		: '';

  return `<?php
if ( ! defined( 'ABSPATH' ) ) {
\treturn;
}

if ( ! function_exists( 'register_block_bindings_source' ) ) {
\treturn;
}

if ( ! function_exists( '${bindingSourceValueFunctionName}' ) ) {
\tfunction ${bindingSourceValueFunctionName}() : array {
\t\treturn array(
\t\t\t${quotePhpString(bindingSourceSlug)} => ${quotePhpString(starterValue)},
\t\t);
\t}
}

if ( ! function_exists( '${bindingSourceResolveFunctionName}' ) ) {
\tfunction ${bindingSourceResolveFunctionName}( array $source_args ) : string {
\t\t$field = isset( $source_args['field'] ) && is_string( $source_args['field'] )
\t\t\t? $source_args['field']
\t\t\t: '${bindingSourceSlug}';
\t\t$binding_source_values = ${bindingSourceValueFunctionName}();
\t\t$value = $binding_source_values[ $field ] ?? '';

\t\treturn is_string( $value ) ? $value : '';
\t}
}
${supportedAttributesSource}

register_block_bindings_source(
\t${quotePhpString(`${namespace}/${bindingSourceSlug}`)},
\tarray(
\t\t'label' => __( ${quotePhpString(bindingSourceTitle)}, ${quotePhpString(textDomain)} ),
\t\t'get_value_callback' => ${quotePhpString(bindingSourceResolveFunctionName)},
\t)
);
${supportedAttributesHook}`;
}

function buildTsPostMetaPreviewValue(field: BindingPostMetaSource['fields'][number]): string {
  switch (field.schemaType) {
    case 'array':
      return '[]';
    case 'boolean':
      return field.fallbackValue === 'true' ? 'true' : 'false';
    case 'integer':
    case 'number': {
      const value = Number(field.fallbackValue);
      return Number.isFinite(value) ? String(value) : '0';
    }
    case 'object':
      return '{}';
    default:
      return quoteTsString(field.fallbackValue);
  }
}

function buildTsPostMetaFieldEntries(
	fields: readonly BindingPostMetaSource['fields'][number][],
	textDomain: string,
): string {
  return fields
		.map((field) =>
			[
				'\t{',
				`\t\tfallbackValue: ${quoteTsString(field.fallbackValue)},`,
				`\t\tlabel: __( ${quoteTsString(field.label)}, ${quoteTsString(textDomain)} ),`,
				`\t\tname: ${quoteTsString(field.name)},`,
				`\t\tpreviewValue: ${buildTsPostMetaPreviewValue(field)},`,
				`\t\trequired: ${field.required ? 'true' : 'false'},`,
				`\t\tschemaType: ${quoteTsString(field.schemaType)},`,
				'\t},',
			].join('\n'),
		)
		.join('\n');
}

function buildBindingPostMetaEditorSource(options: {
  bindingSourceSlug: string;
  namespace: string;
  postMeta: BindingPostMetaSource;
  target?: BindingTarget;
  textDomain: string;
}): string {
  const bindingSourceTitle = toTitleCase(options.bindingSourceSlug);
  const bindingSourceName = `${options.namespace}/${options.bindingSourceSlug}`;
  const targetSource = options.target
		? `
export const BINDING_SOURCE_TARGET = {
\tattribute: ${quoteTsString(options.target.attributeName)},
\tblock: ${quoteTsString(`${options.namespace}/${options.target.blockSlug}`)},
\tfield: ${quoteTsString(options.postMeta.metaPath)},
\tsource: ${quoteTsString(bindingSourceName)},
} as const;
`
		: '';

  return `import { registerBlockBindingsSource } from '@wordpress/blocks';
import { __ } from '@wordpress/i18n';

interface BindingSourceRegistration {
\targs?: {
\t\tfield?: string;
\t};
}

export const POST_META_BINDING_SOURCE = {
\tmetaKey: ${quoteTsString(options.postMeta.metaKey)},
\tpostMeta: ${quoteTsString(options.postMeta.postMetaSlug)},
\tpostType: ${quoteTsString(options.postMeta.postType)},
\tschemaFile: ${quoteTsString(options.postMeta.schemaFile)},
\tsourceTypeName: ${quoteTsString(options.postMeta.sourceTypeName)},
} as const;

const POST_META_BINDING_FIELDS = [
${buildTsPostMetaFieldEntries(options.postMeta.fields, options.textDomain)}
] as const;

const POST_META_PREVIEW_VALUES: Record<string, unknown> = Object.fromEntries(
\tPOST_META_BINDING_FIELDS.map( ( field ) => [
\t\tfield.name,
\t\tfield.previewValue,
\t] )
);
${targetSource}

function resolveBindingFieldType( schemaType: string ): string {
\treturn schemaType === 'unknown' ? 'string' : schemaType;
}

function resolveBindingSourceValue( field: string ): unknown {
\treturn POST_META_PREVIEW_VALUES[ field ] ?? '';
}

registerBlockBindingsSource( {
\tname: ${quoteTsString(bindingSourceName)},
\tlabel: __( ${quoteTsString(bindingSourceTitle)}, ${quoteTsString(options.textDomain)} ),
\tgetFieldsList() {
\t\treturn POST_META_BINDING_FIELDS.map( ( field ) => ( {
\t\t\tlabel: field.label,
\t\t\ttype: resolveBindingFieldType( field.schemaType ),
\t\t\targs: {
\t\t\t\tfield: field.name,
\t\t\t},
\t\t} ) );
\t},
\tgetValues( { bindings } ) {
\t\tconst values: Record<string, unknown> = {};
\t\tfor ( const [ attributeName, binding ] of Object.entries(
\t\t\tbindings as Record<string, BindingSourceRegistration>
\t\t) ) {
\t\t\tconst field =
\t\t\t\ttypeof binding?.args?.field === 'string'
\t\t\t\t\t? binding.args.field
\t\t\t\t\t: ${quoteTsString(options.postMeta.metaPath)};
\t\t\tvalues[ attributeName ] = resolveBindingSourceValue( field );
\t\t}
\t\treturn values;
\t},
} );
`;
}

/**
 * Render the editor registration module for a generated binding source.
 *
 * @param bindingSourceSlug Normalized binding-source slug.
 * @param namespace Workspace block namespace.
 * @param textDomain Workspace text domain used for labels.
 * @param target Optional block attribute target wired to the binding source.
 * @param postMeta Optional post-meta contract backing this binding source.
 * @returns TypeScript source for `src/bindings/<slug>/editor.ts`.
 */
export function buildBindingSourceEditorSource(
	bindingSourceSlug: string,
	namespace: string,
	textDomain: string,
	target?: BindingTarget,
	postMeta?: BindingPostMetaSource,
): string {
  if (postMeta) {
    return buildBindingPostMetaEditorSource({
      bindingSourceSlug,
      namespace,
      postMeta,
      target,
      textDomain,
    });
  }

  const bindingSourceTitle = toTitleCase(bindingSourceSlug);
  const starterValue = `${bindingSourceTitle} starter value`;
  const bindingSourceName = `${namespace}/${bindingSourceSlug}`;
  const targetSource = target
		? `
export const BINDING_SOURCE_TARGET = {
\tattribute: ${quoteTsString(target.attributeName)},
\tblock: ${quoteTsString(`${namespace}/${target.blockSlug}`)},
\tfield: ${quoteTsString(bindingSourceSlug)},
\tsource: ${quoteTsString(bindingSourceName)},
} as const;
`
		: '';

  return `import { registerBlockBindingsSource } from '@wordpress/blocks';
import { __ } from '@wordpress/i18n';

interface BindingSourceRegistration {
\targs?: {
\t\tfield?: string;
\t};
}

const BINDING_SOURCE_VALUES: Record<string, string> = {
\t${quoteTsString(bindingSourceSlug)}: ${quoteTsString(starterValue)},
};
${targetSource}

function resolveBindingSourceValue( field: string ): string {
\treturn BINDING_SOURCE_VALUES[ field ] ?? '';
}

registerBlockBindingsSource( {
\tname: ${quoteTsString(bindingSourceName)},
\tlabel: __( ${quoteTsString(bindingSourceTitle)}, ${quoteTsString(textDomain)} ),
\tgetFieldsList() {
\t\treturn [
\t\t\t{
\t\t\t\tlabel: __( ${quoteTsString(bindingSourceTitle)}, ${quoteTsString(textDomain)} ),
\t\t\t\ttype: 'string',
\t\t\t\targs: {
\t\t\t\t\tfield: ${quoteTsString(bindingSourceSlug)},
\t\t\t\t},
\t\t\t},
\t\t];
\t},
\tgetValues( { bindings } ) {
\t\tconst values: Record<string, string> = {};
\t\tfor ( const [ attributeName, binding ] of Object.entries(
\t\t\tbindings as Record<string, BindingSourceRegistration>
\t\t) ) {
\t\t\tconst field =
\t\t\t\ttypeof binding?.args?.field === 'string'
\t\t\t\t\t? binding.args.field
\t\t\t\t\t: ${quoteTsString(bindingSourceSlug)};
\t\t\tvalues[ attributeName ] = resolveBindingSourceValue( field );
\t\t}
\t\treturn values;
\t},
} );
`;
}
