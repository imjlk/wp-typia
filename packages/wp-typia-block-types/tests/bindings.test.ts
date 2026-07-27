import { describe, expect, test } from 'bun:test';

import type { BindingSourceDiagnostic } from '../src/blocks/bindings';
import {
  createEditorBindingSourceRegistrationSource as createEditorBindingSourceRegistrationSourceFromCodegen,
  createPhpBindingSourceRegistrationSource as createPhpBindingSourceRegistrationSourceFromCodegen,
} from '../src/blocks/bindings-codegen';
import {
  createBindingSourceCompatibilityManifest,
  createEditorBindingSourceRegistrationSource,
  createPhpBindingSourceRegistrationSource,
  defineBindableAttributes,
  defineBindingSource,
  defineBlockMetadataBindings,
  getDefinedBindingSourceCompatibilityManifest,
  getDefinedBindingSourceMetadata,
  type Binding,
} from '../src/blocks/bindings';

interface ProfileCardAttributes {
  displayName?: string;
  imageUrl?: string;
  metadata?: unknown;
}

describe('defineBindingSource', () => {
  test('returns binding source metadata and stores compatibility details out of band', () => {
    const bindableAttributes =
      defineBindableAttributes<ProfileCardAttributes>('example/profile-card', [
        'imageUrl',
      ] as const);
    const source = defineBindingSource({
      args: {
        field: 'image_url' as 'display_name' | 'image_url',
      },
      bindableAttributes: [bindableAttributes],
      fields: [
        {
          args: {
            field: 'display_name',
          },
          label: 'Display name',
          name: 'display_name',
          type: 'string',
        },
        {
          args: {
            field: 'image_url',
          },
          label: 'Image URL',
          name: 'image_url',
          type: 'string',
        },
      ],
      getValueCallback: 'example_get_profile_binding_value',
      label: 'Profile Data',
      minWordPress: {
        editor: '6.7',
        fieldsList: '6.9',
        server: '6.5',
        supportedAttributesFilter: '6.9',
      },
      name: 'example/profile-data',
      usesContext: ['postId', 'postType'],
    });
    const manifest = getDefinedBindingSourceCompatibilityManifest(source);
    const bindingMetadata = defineBlockMetadataBindings({
      imageUrl: {
        args: {
          field: 'image_url',
        },
        source: source.name,
      } satisfies Binding<typeof source, { field: 'image_url' }>,
    });

    expect(source).toEqual({
      args: {
        field: 'image_url',
      },
      bindableAttributes: [
        {
          attributes: ['imageUrl'],
          blockName: 'example/profile-card',
        },
      ],
      fields: [
        {
          args: {
            field: 'display_name',
          },
          label: 'Display name',
          name: 'display_name',
          type: 'string',
        },
        {
          args: {
            field: 'image_url',
          },
          label: 'Image URL',
          name: 'image_url',
          type: 'string',
        },
      ],
      getValueCallback: 'example_get_profile_binding_value',
      label: 'Profile Data',
      name: 'example/profile-data',
      usesContext: ['postId', 'postType'],
    });
    expect(JSON.parse(JSON.stringify(source))).toEqual(source);
    expect(getDefinedBindingSourceMetadata(source)?.diagnostics).toEqual([]);
    expect(manifest?.supported.map((feature) => feature.feature)).toEqual([
      'metadata.bindings',
      'serverRegistration',
      'editorRegistration',
      'editorFieldsList',
      'supportedAttributesFilter',
    ]);
    expect(bindingMetadata.bindings?.imageUrl?.source).toBe(
      'example/profile-data',
    );
  });

  test('reports unsupported editor field lists without generating them in fallback mode', () => {
    const diagnostics: BindingSourceDiagnostic[] = [];
    const source = defineBindingSource(
      {
        fields: [
          {
            args: {
              field: 'title',
            },
            label: 'Title',
            name: 'title',
            type: 'string',
          },
        ],
        getValueCallback: 'example_get_post_binding_value',
        label: 'Post Data',
        minWordPress: '6.7',
        name: 'example/post-data',
        strict: false,
      },
      {
        onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
      },
    );
    const editorSource = createEditorBindingSourceRegistrationSource(source);

    expect(diagnostics).toMatchObject([
      {
        code: 'unsupported-wordpress-block-api-feature',
        feature: 'editorFieldsList',
        requiredVersion: '6.9',
        severity: 'warning',
      },
    ]);
    expect(editorSource).toContain('registerBlockBindingsSource');
    expect(editorSource).not.toContain('getFieldsList: () => fields');
    expect(editorSource).toContain('Skipped getFieldsList()');
  });

  test('reports diagnostics through explicit loggers', () => {
    const logs: Array<{
      readonly diagnostic: BindingSourceDiagnostic;
      readonly message: string;
    }> = [];

    defineBindingSource(
      {
        fields: [
          {
            label: 'Title',
            name: 'title',
          },
        ],
        getValueCallback: 'example_get_post_binding_value',
        minWordPress: '6.7',
        name: 'example/post-data',
        strict: false,
      },
      {
        logger: {
          warn: (message, diagnostic) => {
            logs.push({ diagnostic, message });
          },
        },
      },
    );

    expect(logs).toHaveLength(1);
    expect(logs[0]?.message).toContain('[wp-typia]');
    expect(logs[0]?.diagnostic).toMatchObject({
      code: 'unsupported-wordpress-block-api-feature',
      feature: 'editorFieldsList',
      severity: 'warning',
    });
  });

  test('supports server-only sources without editor registration output', () => {
    const source = defineBindingSource({
      editor: false,
      getValueCallback: 'example_get_server_only_binding_value',
      label: 'Server Only',
      name: 'example/server-only',
    });
    const manifest = getDefinedBindingSourceCompatibilityManifest(source);
    const editorSource = createEditorBindingSourceRegistrationSource(source);

    expect(manifest?.supported.map((feature) => feature.feature)).toEqual([
      'metadata.bindings',
      'serverRegistration',
    ]);
    expect(editorSource).toContain(
      'No editor block binding sources were generated.',
    );
    expect(editorSource).not.toContain('registerBlockBindingsSource');
  });

  test('throws in strict mode for invalid sources and missing PHP callbacks', () => {
    expect(() =>
      defineBindingSource({
        label: 'Invalid',
        name: 'Example/Profile',
      }),
    ).toThrow('must be lowercase and namespaced');
    expect(() =>
      defineBindingSource({
        getValueCallback: 'example_get_invalid_binding_value',
        label: 'Invalid hyphen',
        name: '-example/profile-',
      }),
    ).toThrow('must be lowercase and namespaced');
    expect(() =>
      defineBindingSource({
        getValueCallback: 'example_get_double_hyphen_binding_value',
        label: 'Double hyphen',
        name: 'example--plugin/profile--data',
      }),
    ).not.toThrow();
    expect(() =>
      defineBindingSource({
        label: 'Missing callback',
        name: 'example/missing-callback',
      }),
    ).toThrow('needs getValueCallback');
  });

  test('reports duplicate fields and bindable attributes through diagnostics', () => {
    const diagnostics: BindingSourceDiagnostic[] = [];

    defineBindingSource(
      {
        bindableAttributes: [
          defineBindableAttributes('example/profile-card', [
            'imageUrl',
            'imageUrl',
          ] as const),
        ],
        fields: [
          {
            label: 'Title',
            name: 'title',
          },
          {
            label: 'Title duplicate',
            name: 'title',
          },
        ],
        getValueCallback: 'example_get_profile_binding_value',
        name: 'example/profile-data',
        strict: false,
      },
      {
        onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
      },
    );

    expect(diagnostics).toMatchObject([
      {
        code: 'unsupported-wordpress-block-api-feature',
        feature: 'editorFieldsList',
      },
      {
        code: 'unsupported-wordpress-block-api-feature',
        feature: 'supportedAttributesFilter',
      },
      {
        code: 'duplicate-field-name',
        fieldName: 'title',
      },
      {
        attribute: 'imageUrl',
        code: 'duplicate-bindable-attribute',
      },
    ]);
  });
});

describe('binding source registration source generation', () => {
  test('generates PHP and editor registration sources for supported bindings', () => {
    const source = defineBindingSource({
      bindableAttributes: [
        defineBindableAttributes<ProfileCardAttributes>(
          'example/profile-card',
          ['imageUrl'] as const,
        ),
      ],
      fields: [
        {
          args: {
            field: 'image_url',
          },
          label: 'Image URL',
          name: 'image_url',
          type: 'string',
        },
      ],
      getValueCallback: 'example_get_profile_binding_value',
      label: 'Profile Data',
      minWordPress: {
        editor: '6.7',
        fieldsList: '6.9',
        server: '6.5',
        supportedAttributesFilter: '6.9',
      },
      name: 'example/profile-data',
      usesContext: ['postId'],
    });
    const phpSource = createPhpBindingSourceRegistrationSource(source, {
      textDomain: 'example',
    });
    const editorSource = createEditorBindingSourceRegistrationSource(source);

    expect(phpSource).toContain(
      "register_block_bindings_source( 'example/profile-data'",
    );
    expect(phpSource).toContain("'uses_context' => array( 'postId' )");
    expect(phpSource).toContain(
      "'get_value_callback' => 'example_get_profile_binding_value'",
    );
    expect(phpSource).toContain(
      'block_bindings_supported_attributes_example/profile-card',
    );
    expect(phpSource).toContain("array( 'imageUrl' )");
    expect(editorSource).toContain(
      'import { registerBlockBindingsSource } from "@wordpress/blocks";',
    );
    expect(editorSource).toContain('"name": "example/profile-data"');
    expect(editorSource).toContain('"name": "image_url"');
    expect(editorSource).toContain('getFieldsList: () => fields');
    expect(createPhpBindingSourceRegistrationSourceFromCodegen(source, {
      textDomain: 'example',
    })).toBe(phpSource);
    expect(createEditorBindingSourceRegistrationSourceFromCodegen(source)).toBe(
      editorSource,
    );
  });

  test('rejects dynamic field args when generating static editor registration', () => {
    const source = defineBindingSource({
      fields: [
        {
          args: {
            formatter: () => 'dynamic',
          },
          label: 'Dynamic',
          name: 'dynamic',
        },
      ],
      getValueCallback: 'example_get_dynamic_binding_value',
      minWordPress: {
        editor: '6.7',
        fieldsList: '6.9',
        server: '6.5',
      },
      name: 'example/dynamic',
    });

    expect(() => createEditorBindingSourceRegistrationSource(source)).toThrow(
      'Cannot generate static binding source registration code for function value at fields.example/dynamic[0].args.formatter.',
    );
  });

  test('keeps generated PHP filter callbacks unique after sanitization', () => {
    const first = defineBindingSource({
      bindableAttributes: [
        defineBindableAttributes('example/profile-card', ['imageUrl'] as const),
      ],
      getValueCallback: 'example_get_first_binding_value',
      minWordPress: {
        editor: '6.7',
        server: '6.5',
        supportedAttributesFilter: '6.9',
      },
      name: 'acme-foo/bar',
    });
    const second = defineBindingSource({
      bindableAttributes: [
        defineBindableAttributes('example/profile-card', ['imageUrl'] as const),
      ],
      getValueCallback: 'example_get_second_binding_value',
      minWordPress: {
        editor: '6.7',
        server: '6.5',
        supportedAttributesFilter: '6.9',
      },
      name: 'acme/foo-bar',
    });
    const phpSource = createPhpBindingSourceRegistrationSource([first, second]);
    const callbackNames = [
      ...phpSource.matchAll(
        /function (wp_typia_register_block_binding_sources_[A-Za-z0-9_]+)\(/gu,
      ),
    ].map((match) => match[1]);

    expect(callbackNames).toHaveLength(2);
    expect(new Set(callbackNames).size).toBe(2);
  });

  test('sanitizes custom PHP registration function names', () => {
    const source = defineBindingSource({
      getValueCallback: 'example_get_profile_binding_value',
      name: 'example/profile-data',
    });
    const phpSource = createPhpBindingSourceRegistrationSource(source, {
      functionName: 'example-plugin/register binding sources',
    });

    expect(phpSource).toContain(
      'function example_plugin_register_binding_sources()',
    );
    expect(phpSource).toContain(
      "add_action( 'init', 'example_plugin_register_binding_sources' );",
    );
  });

  test('preserves valid custom PHP registration function names', () => {
    const source = defineBindingSource({
      getValueCallback: 'example_get_profile_binding_value',
      name: 'example/profile-data',
    });
    const phpSource = createPhpBindingSourceRegistrationSource(source, {
      functionName: 'example__register_binding_sources',
    });

    expect(phpSource).toContain(
      'function example__register_binding_sources()',
    );
    expect(phpSource).toContain(
      "add_action( 'init', 'example__register_binding_sources' );",
    );
    expect(phpSource).not.toContain('example_register_binding_sources');
  });

  test('exposes a direct compatibility manifest helper', () => {
    const manifest = createBindingSourceCompatibilityManifest({
      fieldsList: true,
      minWordPress: {
        editor: '6.7',
        fieldsList: '6.9',
        server: '6.5',
      },
    });

    expect(manifest.supported.map((feature) => feature.feature)).toEqual([
      'metadata.bindings',
      'serverRegistration',
      'editorRegistration',
      'editorFieldsList',
    ]);
  });
});
