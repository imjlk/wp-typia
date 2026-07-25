import { describe, expect, test } from 'bun:test';

import {
  defaultAttributeConstraints,
  type ManifestAttribute,
  type ManifestDocument,
} from '../../packages/wp-typia-project-tools/src/runtime/metadata-model';
import {
  collectPhpGenerationWarnings,
  renderPhpValidator,
  renderPhpValue,
} from '../../packages/wp-typia-project-tools/src/runtime/metadata-php-render';

type AttributeOverride = {
  typia?: Partial<ManifestAttribute['typia']>;
  ts?: Partial<ManifestAttribute['ts']>;
  wp?: Partial<ManifestAttribute['wp']>;
};

function createManifestAttribute(
	overrides: AttributeOverride = {},
): ManifestAttribute {
  return {
    typia: {
      constraints: defaultAttributeConstraints(),
      defaultValue: null,
      hasDefault: false,
      ...(overrides.typia ?? {}),
    },
    ts: {
      items: null,
      kind: 'string' as const,
      properties: null,
      required: true,
      union: null,
      ...(overrides.ts ?? {}),
    },
    wp: {
      defaultValue: null,
      enum: null,
      hasDefault: false,
      type: 'string' as const,
      ...(overrides.wp ?? {}),
    },
  };
}

describe('metadata-php-render', () => {
	test('collects nested PHP validator warnings for unsupported formats and type tags', () => {
		const warnings: string[] = [];
		const attribute = createManifestAttribute({
			ts: {
				kind: 'object',
				properties: {
					profile: createManifestAttribute({
						ts: {
							kind: 'object',
							properties: {
								email: createManifestAttribute({
									typia: {
										constraints: {
											...defaultAttributeConstraints(),
											format: 'hostname',
										},
									},
								}),
							},
						},
					}),
				},
				union: {
					branches: {
						advanced: createManifestAttribute({
							typia: {
								constraints: {
									...defaultAttributeConstraints(),
									typeTag: 'decimal128',
								},
							},
						}),
					},
					discriminator: 'kind',
				},
			},
		});

		collectPhpGenerationWarnings(attribute as never, 'settings', warnings);

		expect(warnings).toEqual([
			'settings.profile.email: unsupported PHP validator format "hostname"',
			'settings<advanced>: unsupported PHP validator type tag "decimal128"',
		]);
	});

	test('renders PHP values with stable indentation and escaping', () => {
		expect(
			renderPhpValue(
				{
					items: [1, null],
					title: "O'Reilly",
				},
				1,
			),
		).toBe(
			"[\n\t\t'items' => [\n\t\t\t1,\n\t\t\tnull\n\t\t],\n\t\t'title' => 'O\\'Reilly'\n\t]",
		);
	});

	test('renders a validator class around the manifest payload', () => {
		const manifest: ManifestDocument = {
			attributes: {
				title: createManifestAttribute({
					typia: {
						constraints: {
							...defaultAttributeConstraints(),
							maxLength: 20,
						},
					},
				}),
			},
			manifestVersion: 2,
			sourceType: 'DemoBlockAttributes',
		};
		const result = renderPhpValidator(manifest);

		expect(result.warnings).toEqual([]);
		expect(result.source.startsWith('<?php\ndeclare(strict_types=1);\n\n')).toBe(
			true,
		);
		expect(result.source).toContain(
			"if ( ! defined( 'ABSPATH' ) ) {\n\texit;\n}",
		);
		expect(result.source.indexOf('declare(strict_types=1);')).toBeLessThan(
			result.source.indexOf("if ( ! defined( 'ABSPATH' ) ) {"),
		);
		expect(result.source).toContain('private array $manifest = [');
		expect(result.source).toContain("'sourceType' => 'DemoBlockAttributes'");
		expect(result.source).toContain('private function validateAttribute');
		expect(result.source).toContain('private function validateString');
	});
});
