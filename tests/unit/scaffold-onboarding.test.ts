import { describe, expect, test } from 'bun:test';

import {
  getOptionalOnboardingShortNote,
  getPhpRestExtensionPointsSection,
} from '../../packages/wp-typia-project-tools/src/runtime/scaffold-onboarding';

describe('scaffold-onboarding', () => {
	test('persistence and compound persistence sections share the common rest guidance', () => {
		const persistenceSection = getPhpRestExtensionPointsSection('persistence', {
			slug: 'demo-block',
		});
		const compoundSection = getPhpRestExtensionPointsSection('compound', {
			compoundPersistenceEnabled: true,
			slug: 'demo-block',
		});

		expect(persistenceSection).toContain('## PHP REST Extension Points');
		expect(compoundSection).toContain('## PHP REST Extension Points');
		expect(persistenceSection).toContain('Edit `inc/rest-auth.php` or `inc/rest-public.php`');
		expect(compoundSection).toContain('Edit `inc/rest-auth.php` or `inc/rest-public.php`');
		expect(persistenceSection).toContain('per-contract `src/api-schemas/*.openapi.json`');
		expect(compoundSection).toContain(
			'per-contract `src/blocks/demo-block/api-schemas/*.openapi.json`',
		);
		expect(compoundSection).toContain(
			'The hidden child block does not own REST routes or storage.',
		);
		expect(persistenceSection).not.toContain(
			'The hidden child block does not own REST routes or storage.',
		);
	});

	test('non-persistence scaffolds do not render PHP REST extension guidance', () => {
		expect(
			getPhpRestExtensionPointsSection('compound', {
				compoundPersistenceEnabled: false,
				slug: 'demo-block',
			}),
		).toBeNull();
	});

	test('workspace alias reuses official workspace short onboarding guidance', () => {
		expect(getOptionalOnboardingShortNote('npm', 'workspace')).toContain(
			'Skip npm run sync during normal npm run dev work.',
		);
		expect(getOptionalOnboardingShortNote('npm', 'workspace')).not.toContain(
			"Follow the template's own artifact-refresh guidance",
		);
	});
});
