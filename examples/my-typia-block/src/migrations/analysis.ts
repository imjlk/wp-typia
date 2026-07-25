import { validators } from '../validators';
import { parseManifestDocument } from '@wp-typia/block-runtime/editor';
import migrationRegistry from './generated/registry';
import {
  type ManifestAttribute,
  type ManifestDocument,
  manifestMatchesDocument,
  summarizeVersionDelta,
} from './helpers';
import { isNonArrayObject } from './plain-object';
import {
  type MigrationAnalysis,
  type MigrationPreview,
  type UnionBranchPreview,
  createEmptyRiskSummary,
} from './types';

interface MigrationResolution {
  analysis: MigrationAnalysis;
  preview: MigrationPreview;
}

const manifestDocumentCache = new WeakMap< object, ManifestDocument >();

function parseCachedManifestDocument( manifest: unknown ): ManifestDocument {
  if ( typeof manifest !== 'object' || manifest === null ) {
    return parseManifestDocument< ManifestDocument >( manifest );
  }

  const cached = manifestDocumentCache.get( manifest );
  if ( cached ) {
    return cached;
  }

  const parsed = parseManifestDocument< ManifestDocument >( manifest );
  manifestDocumentCache.set( manifest, parsed );
  return parsed;
}

const currentManifestDocument = parseCachedManifestDocument(
  migrationRegistry.currentManifest,
);

/**
 * Returns the migration analysis for one block attribute payload.
 * @param attributes
 */
export function detectBlockMigration(
	attributes: Record< string, unknown >,
): MigrationAnalysis {
  return resolveMigrationState( attributes ).analysis;
}

/**
 * Applies the matching migration rule and returns the migrated attributes.
 * @param attributes
 */
export function autoMigrate( attributes: Record< string, unknown > ) {
  const resolution = resolveMigrationState( attributes );
  if ( ! resolution.preview.after ) {
    throw new Error(
			resolution.preview.validationErrors[ 0 ] ??
				resolution.preview.unresolved[ 0 ] ??
				'Unable to migrate block attributes because no supported snapshot matched.',
		);
  }

  return resolution.preview.after;
}

/**
 * Resolves the current migration state, preview, and risk metadata for one block.
 * @param attributes
 */
export function resolveMigrationState(
	attributes: Record< string, unknown >,
): MigrationResolution {
  const currentValidation = validators.validate( attributes as any );
  if ( currentValidation.isValid ) {
    return {
			analysis: {
				affectedFields: {
					added: [],
					changed: [],
					removed: [],
				},
				confidence: 1,
				currentMigrationVersion:
					migrationRegistry.currentMigrationVersion,
				needsMigration: false,
				reasons: [ 'Current Typia validator accepted the attributes.' ],
				riskSummary: createEmptyRiskSummary(),
				targetMigrationVersion:
					migrationRegistry.currentMigrationVersion,
				warnings: [],
			} satisfies MigrationAnalysis,
			preview: createPreview( {
				after: attributes,
				before: attributes,
				currentManifest: currentManifestDocument,
				legacyManifest: null,
				status: 'current',
				unresolved: [],
				validationErrors: [],
			} ),
		};
  }

  for ( const entry of migrationRegistry.entries ) {
    if (
			manifestMatchesDocument(
        parseCachedManifestDocument(entry.manifest),
        attributes,
      )
		) {
      const migrated = entry.rule.migrate( attributes );
      const migratedValidation = validators.validate( migrated as any );
      const unresolved = Array.isArray(entry.rule.unresolved)
        ? [...entry.rule.unresolved]
        : [];
      const validationErrors = migratedValidation.isValid
        ? []
        : formatValidationErrors(migratedValidation.errors);
      let status: 'auto' | 'manual' = 'manual';
      if ( migratedValidation.isValid && unresolved.length === 0 ) {
        status = 'auto';
      }
      const preview = createPreview({
        after: migratedValidation.isValid
          ? (migrated as Record< string, unknown >)
          : null,
        before: attributes,
        currentManifest: currentManifestDocument,
        legacyManifest: parseCachedManifestDocument(entry.manifest),
        status,
        unresolved,
        validationErrors,
      });
      const delta = summarizeVersionDelta(
        parseCachedManifestDocument(entry.manifest),
        currentManifestDocument,
      );
      let confidence = 0.95;
      if ( ! migratedValidation.isValid ) {
        confidence = 0.2;
      } else if ( unresolved.length > 0 ) {
        confidence = 0.8;
      }

      return {
				analysis: {
					affectedFields: delta,
					confidence,
					currentMigrationVersion: entry.fromMigrationVersion,
					needsMigration: true,
					reasons: [
						`Snapshot ${ entry.fromMigrationVersion } matched this block.`,
						...preview.unionBranches.map(
							( branch ) =>
								`Union ${ branch.field }: ${
									branch.legacyBranch ?? 'unknown'
								} -> ${ branch.nextBranch ?? 'unknown' } (${
									branch.status
								})`,
						),
					],
					riskSummary: entry.riskSummary ?? createEmptyRiskSummary(),
					targetMigrationVersion:
						migrationRegistry.currentMigrationVersion,
					warnings: [ ...unresolved, ...validationErrors ],
				} satisfies MigrationAnalysis,
				preview,
			};
    }
  }

  return {
		analysis: {
			affectedFields: {
				added: [],
				changed: [],
				removed: [],
			},
			confidence: 0.2,
			currentMigrationVersion: 'unknown',
			needsMigration: true,
			reasons: [
				'No legacy snapshot matched and current Typia validator rejected the attributes.',
			],
			riskSummary: createEmptyRiskSummary(),
			targetMigrationVersion: migrationRegistry.currentMigrationVersion,
			warnings: formatValidationErrors( currentValidation.errors ),
		} satisfies MigrationAnalysis,
		preview: createPreview( {
			after: null,
			before: attributes,
			currentManifest: currentManifestDocument,
			legacyManifest: null,
			status: 'unknown',
			unresolved: [
				'Manual migration review is required because the block does not match any supported snapshot.',
			],
			validationErrors: formatValidationErrors(
				currentValidation.errors,
			),
		} ),
	};
}

function createPreview( {
	after,
	before,
	currentManifest,
	legacyManifest,
	status,
	unresolved,
	validationErrors,
}: {
  after: Record< string, unknown > | null;
  before: Record< string, unknown >;
  currentManifest: ManifestDocument;
  legacyManifest: ManifestDocument | null;
  status: UnionBranchPreview[ 'status' ];
  unresolved: string[];
  validationErrors: string[];
} ): MigrationPreview {
  return {
    after,
    before,
    changedFields: after ? collectChangedFieldPaths(before, after) : [],
    unresolved,
    unionBranches: collectUnionBranchPreview(
      legacyManifest,
      currentManifest,
      before,
      after,
      status,
    ),
    validationErrors,
  };
}

function collectChangedFieldPaths(
	before: Record< string, unknown >,
	after: Record< string, unknown >,
	prefix = '',
): string[] {
  const keys = new Set([...Object.keys( before ), ...Object.keys( after )]);
  const changes: string[] = [];

  for ( const key of keys ) {
    const nextPrefix = prefix ? `${ prefix }.${ key }` : key;
    const left = before[ key ];
    const right = after[ key ];

    if ( isNonArrayObject( left ) && isNonArrayObject( right ) ) {
      changes.push(...collectChangedFieldPaths( left, right, nextPrefix ));
      continue;
    }
    if ( JSON.stringify( left ) !== JSON.stringify( right ) ) {
      changes.push( nextPrefix );
    }
  }

  return changes;
}

function collectUnionBranchPreview(
	legacyManifest: ManifestDocument | null,
	currentManifest: ManifestDocument,
	before: Record< string, unknown >,
	after: Record< string, unknown > | null,
	status: UnionBranchPreview[ 'status' ],
): UnionBranchPreview[] {
  const fieldNames = new Set< string >();

  for ( const [ field, attribute ] of Object.entries(
    legacyManifest?.attributes ?? {},
  ) ) {
    if ( attribute.ts.kind === 'union' ) {
      fieldNames.add( field );
    }
  }
  for ( const [ field, attribute ] of Object.entries(
    currentManifest.attributes ?? {},
  ) ) {
    if ( attribute.ts.kind === 'union' ) {
      fieldNames.add( field );
    }
  }

  return [ ...fieldNames ].map(( field ) => {
    const legacyAttribute = legacyManifest?.attributes?.[ field ] ?? null;
    const currentAttribute = currentManifest.attributes?.[ field ] ?? null;
    return {
      field,
      legacyBranch: resolveUnionBranchKey(legacyAttribute, before[ field ]),
      nextBranch: resolveUnionBranchKey(
        currentAttribute,
        ( after ?? before )[ field ],
      ),
      status,
    };
  });
}

function resolveUnionBranchKey(
	attribute: ManifestAttribute | null,
	value: unknown,
): string | null {
  if (
		! attribute ||
		attribute.ts.kind !== 'union' ||
		! attribute.ts.union ||
		! isNonArrayObject( value )
	) {
    return null;
  }

  const discriminatorValue = value[ attribute.ts.union.discriminator ];
  if ( typeof discriminatorValue !== 'string' ) {
    return null;
  }

  return Object.prototype.hasOwnProperty.call(
    attribute.ts.union.branches,
    discriminatorValue,
  )
    ? discriminatorValue
    : null;
}

function formatValidationErrors(
	errors: Array< { expected?: string; path?: string } > = [],
): string[] {
  return errors.map(( error ) => {
    const pathLabel = error.path ?? '$';
    const expectedLabel = error.expected ?? 'unknown';
    return `${ pathLabel }: ${ expectedLabel }`;
  });
}
