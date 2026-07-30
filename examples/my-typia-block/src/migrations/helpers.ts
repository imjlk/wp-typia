import type {
  ManifestAttribute,
  ManifestDocument,
} from '@wp-typia/block-runtime/migration-types';

import { isNonArrayObject } from './plain-object';

export type {
  ManifestAttribute,
  ManifestDocument,
} from '@wp-typia/block-runtime/migration-types';

export interface MigrationRiskBucket {
  count: number;
  items: string[];
}

export interface MigrationRiskSummary {
  additive: MigrationRiskBucket;
  removal: MigrationRiskBucket;
  rename: MigrationRiskBucket;
  semanticTransform: MigrationRiskBucket;
  unionBreaking: MigrationRiskBucket;
}

export type RenameMap = Record< string, string >;
export type TransformMap = Record<
	string,
	( legacyValue: unknown, legacyInput: Record< string, unknown > ) => unknown
>;

function hasOwnKey( record: Record< string, unknown >, key: string ): boolean {
  return Object.prototype.hasOwnProperty.call( record, key );
}

function getSourcePath(
	currentPath: string,
	fallbackPath: string,
	renameMap: RenameMap,
): string {
  return renameMap[ currentPath ] ?? fallbackPath;
}

export function createDefaultValue( attribute: ManifestAttribute ): unknown {
  if ( attribute.typia.hasDefault ) {
    return attribute.typia.defaultValue;
  }
  if ( attribute.wp.hasDefault ) {
    return attribute.wp.defaultValue;
  }
  if ( attribute.wp.enum && attribute.wp.enum.length > 0 ) {
    return attribute.wp.enum[ 0 ];
  }

  switch ( attribute.ts.kind ) {
    case 'string':
      return '';
    case 'number':
      return 0;
    case 'boolean':
      return false;
    case 'array':
      return [];
    case 'object': {
      const result: Record< string, unknown > = {};
      for ( const [ key, property ] of Object.entries(
        attribute.ts.properties ?? {},
      ) ) {
        result[ key ] = createDefaultValue( property );
      }
      return result;
    }
    case 'union': {
      const firstBranch = Object.values(
        attribute.ts.union?.branches ?? {},
      )[ 0 ];
      return firstBranch ? createDefaultValue( firstBranch ) : null;
    }
    default:
      return null;
  }
}

export function getValueAtPath(
	input: Record< string, unknown >,
	path: string,
): unknown {
  if ( ! path ) {
    return undefined;
  }

  return path.split( '.' ).reduce< unknown >( ( value, segment ) => {
		if (
			typeof value !== 'object' ||
			value === null ||
			Array.isArray( value )
		) {
			return undefined;
		}
		return ( value as Record< string, unknown > )[ segment ];
	}, input );
}

export function resolveMigrationValue(
	attribute: ManifestAttribute,
	currentKey: string,
	fallbackPath: string,
	input: Record< string, unknown >,
	renameMap: RenameMap,
	transforms: TransformMap,
): unknown {
  const sourcePath = getSourcePath( currentKey, fallbackPath, renameMap );
  const legacyValue = getValueAtPath( input, sourcePath );
  const transformedValue = transforms[ currentKey ]
    ? transforms[ currentKey ](legacyValue, input)
    : legacyValue;

  return coerceValueFromManifest( attribute, transformedValue );
}

export function resolveMigrationAttribute(
	attribute: ManifestAttribute,
	currentPath: string,
	fallbackPath: string,
	input: Record< string, unknown >,
	renameMap: RenameMap,
	transforms: TransformMap,
): unknown {
  const sourcePath = getSourcePath( currentPath, fallbackPath, renameMap );

  switch ( attribute.ts.kind ) {
    case 'object': {
      const nextInput = Object.fromEntries(
        Object.entries( attribute.ts.properties ?? {} ).map(
          ( [ key, property ] ) => [
            key,
            resolveMigrationAttribute(
              property,
              `${ currentPath }.${ key }`,
              `${ sourcePath }.${ key }`,
              input,
              renameMap,
              transforms,
            ),
          ],
        ),
      );

      return coerceValueFromManifest( attribute, nextInput );
    }
    case 'union': {
      const legacyValue = getValueAtPath( input, sourcePath );
      if ( ! isNonArrayObject( legacyValue ) || ! attribute.ts.union ) {
        return createDefaultValue( attribute );
      }

      const { discriminator, branches } = attribute.ts.union;
      const branchKey = legacyValue[ discriminator ];
      if (
				typeof branchKey !== 'string' ||
				! hasOwnKey( branches, branchKey )
			) {
        return createDefaultValue( attribute );
      }

      const branchAttribute = branches[ branchKey ];
      const properties = branchAttribute.ts.properties ?? {};
      const nextInput = Object.fromEntries(
				Object.entries( properties )
					.filter( ( [ key ] ) => key !== discriminator )
					.map( ( [ key, property ] ) => [
						key,
						resolveMigrationAttribute(
							property,
							`${ currentPath }.${ branchKey }.${ key }`,
							`${ sourcePath }.${ key }`,
							input,
							renameMap,
							transforms,
						),
					] ),
			);

      return coerceValueFromManifest(attribute, {
        ...nextInput,
        [ discriminator ]: branchKey,
      });
    }
    default:
      return resolveMigrationValue(
        attribute,
        currentPath,
        sourcePath,
        input,
        renameMap,
        transforms,
      );
  }
}

export function coerceValueFromManifest(
	attribute: ManifestAttribute,
	value: unknown,
): unknown {
  if ( value === undefined || value === null ) {
    return createDefaultValue( attribute );
  }

  switch ( attribute.ts.kind ) {
    case 'string':
      return isValidString(attribute, value)
        ? value
        : createDefaultValue(attribute);
    case 'number':
      return isValidNumber(attribute, value)
        ? value
        : createDefaultValue(attribute);
    case 'boolean':
      return typeof value === 'boolean' ? value : createDefaultValue(attribute);
    case 'array':
      if ( ! Array.isArray( value ) || ! attribute.ts.items ) {
        return createDefaultValue( attribute );
      }
      return value.map(( item ) =>
        coerceValueFromManifest(attribute.ts.items as ManifestAttribute, item),
      );
    case 'object':
      if ( ! isNonArrayObject( value ) ) {
        return createDefaultValue( attribute );
      }
      return Object.fromEntries(
        Object.entries( attribute.ts.properties ?? {} ).map(
          ( [ key, property ] ) => [
            key,
            coerceValueFromManifest(
              property,
              ( value as Record< string, unknown > )[ key ],
            ),
          ],
        ),
      );
    case 'union':
      return coerceUnionValue( attribute, value );
    default:
      return createDefaultValue( attribute );
  }
}

export function manifestMatchesDocument(
	manifest: ManifestDocument,
	attributes: Record< string, unknown >,
): boolean {
  for ( const [ key, attribute ] of Object.entries(
    manifest.attributes ?? {},
  ) ) {
    const value = attributes[ key ];
    if (
			( value === undefined || value === null ) &&
			( ! attribute.ts.required ||
				attribute.typia.hasDefault ||
				attribute.wp.hasDefault )
		) {
      continue;
    }
    if ( ! manifestMatchesAttribute( attribute, value ) ) {
      return false;
    }
  }

  return true;
}

export function summarizeVersionDelta(
	legacyManifest: ManifestDocument,
	currentManifest: ManifestDocument,
): { added: string[]; removed: string[]; changed: string[] } {
  const currentAttributes = currentManifest.attributes ?? {};
  const legacyAttributes = legacyManifest.attributes ?? {};
  const added = Object.keys( currentAttributes ).filter(
    ( key ) => ! ( key in legacyAttributes ),
  );
  const removed = Object.keys( legacyAttributes ).filter(
    ( key ) => ! ( key in currentAttributes ),
  );
  const changed = Object.keys( currentAttributes ).filter( ( key ) => {
		if ( ! ( key in legacyAttributes ) ) {
			return false;
		}
		return (
			JSON.stringify( currentAttributes[ key ] ) !==
			JSON.stringify( legacyAttributes[ key ] )
		);
	} );

  return { added, changed, removed };
}

function manifestMatchesAttribute(
	attribute: ManifestAttribute,
	value: unknown,
): boolean {
  if (
		( value === undefined || value === null ) &&
		( ! attribute.ts.required ||
			attribute.typia.hasDefault ||
			attribute.wp.hasDefault )
	) {
    return true;
  }

  switch ( attribute.ts.kind ) {
    case 'string':
      return isValidString( attribute, value );
    case 'number':
      return isValidNumber( attribute, value );
    case 'boolean':
      return typeof value === 'boolean';
    case 'array':
      return (
				Array.isArray( value ) &&
				Boolean( attribute.ts.items ) &&
				value.every(( item ) =>
          manifestMatchesAttribute(
            attribute.ts.items as ManifestAttribute,
            item,
          ),
        )
			);
    case 'object':
      return (
				isNonArrayObject( value ) &&
				Object.entries( attribute.ts.properties ?? {} ).every(
          ( [ key, property ] ) =>
            manifestMatchesAttribute(
              property,
              ( value as Record< string, unknown > )[ key ],
            ),
        )
			);
    case 'union':
      return matchesUnionAttribute( attribute, value );
    default:
      return false;
  }
}

function matchesUnionAttribute(
	attribute: ManifestAttribute,
	value: unknown,
): boolean {
  if ( ! isNonArrayObject( value ) || ! attribute.ts.union ) {
    return false;
  }

  const { discriminator, branches } = attribute.ts.union;
  const branchKey = ( value as Record< string, unknown > )[ discriminator ];

  return (
		typeof branchKey === 'string' &&
		hasOwnKey( branches, branchKey ) &&
		manifestMatchesAttribute( branches[ branchKey ], value )
	);
}

function coerceUnionValue(
	attribute: ManifestAttribute,
	value: unknown,
): unknown {
  if ( ! isNonArrayObject( value ) || ! attribute.ts.union ) {
    return createDefaultValue( attribute );
  }

  const { discriminator, branches } = attribute.ts.union;
  const branchKey = ( value as Record< string, unknown > )[ discriminator ];
  if ( typeof branchKey !== 'string' || ! hasOwnKey( branches, branchKey ) ) {
    return createDefaultValue( attribute );
  }

  return coerceValueFromManifest( branches[ branchKey ], value );
}

function isValidString(
	attribute: ManifestAttribute,
	value: unknown,
): value is string {
  if ( typeof value !== 'string' ) {
    return false;
  }

  const { enum: enumValues } = attribute.wp;
  const { format, maxLength, minLength, pattern } =
		attribute.typia.constraints;

  if ( enumValues && ! enumValues.includes( value ) ) {
    return false;
  }
  if ( typeof minLength === 'number' && value.length < minLength ) {
    return false;
  }
  if ( typeof maxLength === 'number' && value.length > maxLength ) {
    return false;
  }
  if ( pattern ) {
    try {
      if ( ! new RegExp( pattern ).test( value ) ) {
        return false;
      }
    } catch {
      return false;
    }
  }
  if (
		format === 'uuid' &&
		! /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
	) {
    return false;
  }

  return true;
}

function isValidNumber(
	attribute: ManifestAttribute,
	value: unknown,
): value is number {
  if ( typeof value !== 'number' || Number.isNaN( value ) ) {
    return false;
  }

  const { enum: enumValues } = attribute.wp;
  const { maximum, minimum, typeTag } = attribute.typia.constraints;

  if ( enumValues && ! enumValues.includes( value ) ) {
    return false;
  }
  if ( typeof minimum === 'number' && value < minimum ) {
    return false;
  }
  if ( typeof maximum === 'number' && value > maximum ) {
    return false;
  }
  if (
		typeTag === 'uint32' &&
		( ! Number.isInteger( value ) || value < 0 || value > 4294967295 )
	) {
    return false;
  }

  return true;
}
