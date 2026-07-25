import type { MyTypiaBlockAttributes } from '../../../types';
import currentManifest from '../../../../typia.manifest.json';
import {
  type ManifestAttribute,
  type RenameMap,
  type TransformMap,
  resolveMigrationAttribute,
} from '../../helpers';

export const renameMap: RenameMap = {
	// renameMap is illustrative here: migrate still writes the current `content`
	// field after pulling from a legacy `headline` path.
	content: 'headline',
	'padding.top': 'spacing.top',
};

export const transforms: TransformMap = {
	borderRadius: ( legacyValue ) => {
		const numericValue =
			typeof legacyValue === 'number'
				? legacyValue
				: Number( legacyValue ?? 0 );
		return Number.isNaN( numericValue ) ? undefined : numericValue;
	},
	// Branch changes still need human review. The generated scaffold will keep this unresolved
	// until you decide how to map the legacy branch contract.
	'linkTarget.url.href': ( legacyValue, legacyInput ) => {
		if ( typeof legacyValue === 'string' ) {
			return legacyValue;
		}

		const fallbackHref =
			typeof legacyInput.cta === 'object' &&
			legacyInput.cta &&
			'href' in legacyInput.cta
				? legacyInput.cta.href
				: undefined;

		return typeof fallbackHref === 'string' ? fallbackHref : undefined;
	},
};

export const unresolved = [
  'linkTarget: union-branch-removal (branch post was removed)',
] as const;

function getRequiredManifestAttribute( key: string ): ManifestAttribute {
  const manifestAttributes = currentManifest.attributes as Record<
		string,
		ManifestAttribute
	>;
  const attribute = manifestAttributes[ key ];

  if ( ! attribute ) {
    throw new Error(
      `Migration example is missing the required manifest attribute "${ key }".`,
    );
  }

  return attribute;
}

export function migrate(
	input: Record< string, unknown >,
): MyTypiaBlockAttributes {
  return {
    content: resolveMigrationAttribute(
      getRequiredManifestAttribute('content'),
      'content',
      'content',
      input,
      renameMap,
      transforms,
    ),
    padding: resolveMigrationAttribute(
      getRequiredManifestAttribute('padding'),
      'padding',
      'padding',
      input,
      renameMap,
      transforms,
    ),
    borderRadius: resolveMigrationAttribute(
      getRequiredManifestAttribute('borderRadius'),
      'borderRadius',
      'borderRadius',
      input,
      renameMap,
      transforms,
    ),
    linkTarget: resolveMigrationAttribute(
      getRequiredManifestAttribute('linkTarget'),
      'linkTarget',
      'linkTarget',
      input,
      renameMap,
      transforms,
    ),
  } as MyTypiaBlockAttributes;
}
