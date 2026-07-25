type CryptoLike = Partial<
	Pick< Crypto, 'getRandomValues' | 'randomUUID' >
>;

const UUID_HEX_RADIX = 16;
const SCOPED_SUFFIX_LENGTH = 9;
const MAX_PERSISTENT_BLOCK_ID_ATTEMPTS = 32;

export type PersistentBlockIdentityRepairReason = 'missing' | 'duplicate';

export interface PersistentBlockIdentityNode {
  attributes?: Record< string, unknown > | null;
  clientId: string;
  innerBlocks?: readonly PersistentBlockIdentityNode[];
  name?: string;
}

export interface PersistentBlockIdentityRepair {
  clientId: string;
  nextValue: string;
  previousValue: string | null;
  reason: PersistentBlockIdentityRepairReason;
}

export interface EnsurePersistentBlockIdentityOptions {
  duplicateDetection?: boolean;
  existingIds?: Iterable< string >;
  generateId?: ( prefix: string ) => string;
  prefix: string;
  seenIds?: Iterable< string >;
  value: unknown;
}

export interface EnsurePersistentBlockIdentityResult {
  changed: boolean;
  previousValue: string | null;
  reason: PersistentBlockIdentityRepairReason | null;
  value: string;
}

export interface CollectPersistentBlockIdentityRepairsOptions {
  attributeName: string;
	/**
	 * Restrict duplicate detection and generated-id collision checks to one
	 * block type. Cross-type identity reuse remains valid when this is set.
	 */
  blockName?: string;
  duplicateDetection?: boolean;
  generateId?: ( prefix: string ) => string;
  prefix: string;
}

/**
 * Generate a UUID v4-style id for block attributes.
 *
 * @returns A runtime-safe UUID-like identifier for generated block data.
 * @category Utilities
 */
export function generateBlockId(): string {
  return generateUuidV4();
}

/**
 * Generate a prefixed runtime id for client-side attributes such as uniqueId.
 *
 * @param prefix Prefix chosen by the scaffold/template.
 * @returns A prefix-scoped identifier suitable for client-only attribute values.
 * @category Utilities
 */
export function generateScopedClientId( prefix: string ): string {
  return generatePrefixedScopedId( prefix );
}

/**
 * Generate a prefixed persistence resource key.
 *
 * @param prefix Prefix chosen by the scaffold/template.
 * @returns A prefix-scoped identifier for persistence resource keys.
 * @category Utilities
 */
export function generateResourceKey( prefix: string ): string {
  return generatePrefixedScopedId( prefix );
}

/**
 * Generate an opaque id for one public write attempt.
 *
 * @returns A UUID-like request identifier that can be attached to one write operation.
 * @category Utilities
 */
export function generatePublicWriteRequestId(): string {
  return generateUuidV4();
}

/**
 * Resolve one persistent block id against the ids already used in the current
 * document tree.
 *
 * Missing ids always get generated. Duplicate repair only happens when
 * `duplicateDetection` is enabled and the current value is already present in
 * `seenIds`.
 *
 * @param options Current id plus scope metadata used to preserve valid values and generate safe replacements.
 * @returns The preserved or regenerated persistent id and whether it changed.
 * @category Utilities
 */
export function ensurePersistentBlockIdentity(
	options: EnsurePersistentBlockIdentityOptions,
): EnsurePersistentBlockIdentityResult {
  const seenIds = createPersistentIdentitySet( options.seenIds );
  const currentValue = toPersistentBlockIdentityValue( options.value );
  if (
		currentValue &&
		( options.duplicateDetection === false ||
			! seenIds.has( currentValue ) )
	) {
    return {
      changed: false,
      previousValue: currentValue,
      reason: null,
      value: currentValue,
    };
  }

  const reservedIds = createPersistentIdentitySet( options.existingIds );
  for ( const seenId of seenIds ) {
    reservedIds.add( seenId );
  }

  const nextValue = generateUniquePersistentBlockIdentity(
    options.prefix,
    reservedIds,
    options.generateId,
  );

  return {
    changed: true,
    previousValue: currentValue,
    reason: currentValue ? 'duplicate' : 'missing',
    value: nextValue,
  };
}

/**
 * Collect the persistent-id repairs required to make one document tree safe for
 * duplicate-aware structured block workflows.
 *
 * Existing non-empty ids are preserved when they are unique. Missing ids are
 * generated, and only the later duplicates in one depth-first traversal are
 * repaired when duplicate detection is enabled. When `blockName` is set,
 * mismatched nodes are excluded from identity accounting while their nested
 * blocks are still traversed.
 *
 * @param blocks Current document tree rooted at the relevant editor scope.
 * @param options Attribute key plus prefix/generator settings.
 * @returns One repair patch per block that should regenerate or seed its persistent id.
 * @category Utilities
 */
export function collectPersistentBlockIdentityRepairs(
	blocks: readonly PersistentBlockIdentityNode[],
	options: CollectPersistentBlockIdentityRepairsOptions,
): PersistentBlockIdentityRepair[] {
  const duplicateCounts = new Map< string, number >();
  const reservedIds = new Set< string >();
  collectPersistentIdentityCounts(
    blocks,
    options.attributeName,
    options.blockName,
    duplicateCounts,
    reservedIds,
  );

  const preservedDuplicates = new Set< string >();
  const repairs: PersistentBlockIdentityRepair[] = [];

  for ( const block of blocks ) {
    collectPersistentIdentityRepairsForNode(
      block,
      options,
      duplicateCounts,
      preservedDuplicates,
      reservedIds,
      repairs,
    );
  }

  return repairs;
}

function generateUuidV4(): string {
  const cryptoObject = getCryptoObject();

  if ( typeof cryptoObject?.randomUUID === 'function' ) {
    return cryptoObject.randomUUID();
  }

  const bytes = fillRandomBytes( 16 );
  if ( bytes ) {
    bytes[ 6 ] = ( bytes[ 6 ] & 0x0f ) | 0x40;
    bytes[ 8 ] = ( bytes[ 8 ] & 0x3f ) | 0x80;
    return formatUuidBytes( bytes );
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(
		/[xy]/g,
		( character ) => {
			const randomNibble = Math.floor( Math.random() * UUID_HEX_RADIX );
			const value =
				character === 'x'
					? randomNibble
					: ( randomNibble & 0x03 ) | 0x08;
			return value.toString( UUID_HEX_RADIX );
		},
	);
}

function generatePrefixedScopedId( prefix: string ): string {
  return `${ prefix }-${ generateScopedSuffix() }`;
}

function collectPersistentIdentityCounts(
	blocks: readonly PersistentBlockIdentityNode[],
	attributeName: string,
	blockName: string | undefined,
	duplicateCounts: Map< string, number >,
	reservedIds: Set< string >,
): void {
  for ( const block of blocks ) {
    if ( blockName === undefined || block.name === blockName ) {
      const currentValue = toPersistentBlockIdentityValue(
        block.attributes?.[ attributeName ],
      );
      if ( currentValue ) {
        duplicateCounts.set(
          currentValue,
          ( duplicateCounts.get( currentValue ) ?? 0 ) + 1,
        );
        reservedIds.add( currentValue );
      }
    }

    if ( block.innerBlocks?.length ) {
      collectPersistentIdentityCounts(
        block.innerBlocks,
        attributeName,
        blockName,
        duplicateCounts,
        reservedIds,
      );
    }
  }
}

function collectPersistentIdentityRepairsForNode(
	block: PersistentBlockIdentityNode,
	options: CollectPersistentBlockIdentityRepairsOptions,
	duplicateCounts: Map< string, number >,
	preservedDuplicates: Set< string >,
	reservedIds: Set< string >,
	repairs: PersistentBlockIdentityRepair[],
): void {
  if ( options.blockName === undefined || block.name === options.blockName ) {
    const currentValue = toPersistentBlockIdentityValue(
      block.attributes?.[ options.attributeName ],
    );

    if ( ! currentValue ) {
      repairs.push({
        clientId: block.clientId,
        nextValue: generateUniquePersistentBlockIdentity(
          options.prefix,
          reservedIds,
          options.generateId,
        ),
        previousValue: null,
        reason: 'missing',
      });
    } else if (
			options.duplicateDetection !== false &&
			( duplicateCounts.get( currentValue ) ?? 0 ) > 1
		) {
      if ( ! preservedDuplicates.has( currentValue ) ) {
        preservedDuplicates.add( currentValue );
      } else {
        repairs.push({
          clientId: block.clientId,
          nextValue: generateUniquePersistentBlockIdentity(
            options.prefix,
            reservedIds,
            options.generateId,
          ),
          previousValue: currentValue,
          reason: 'duplicate',
        });
      }
    }
  }

  if ( block.innerBlocks?.length ) {
    for ( const innerBlock of block.innerBlocks ) {
      collectPersistentIdentityRepairsForNode(
        innerBlock,
        options,
        duplicateCounts,
        preservedDuplicates,
        reservedIds,
        repairs,
      );
    }
  }
}

function createPersistentIdentitySet(
	values: Iterable< string > | undefined,
): Set< string > {
  const ids = new Set< string >();

  if ( ! values ) {
    return ids;
  }

  for ( const value of values ) {
    const persistentValue = toPersistentBlockIdentityValue( value );
    if ( persistentValue ) {
      ids.add( persistentValue );
    }
  }

  return ids;
}

function generateUniquePersistentBlockIdentity(
	prefix: string,
	reservedIds: Set< string >,
	generateId: ( ( prefix: string ) => string ) | undefined,
): string {
  const generateScopedId = generateId ?? generateScopedClientId;

  for (
		let attempt = 1;
		attempt <= MAX_PERSISTENT_BLOCK_ID_ATTEMPTS;
		attempt++
	) {
    const nextValue = toPersistentBlockIdentityValue(generateScopedId(prefix));
    if ( nextValue && ! reservedIds.has( nextValue ) ) {
      reservedIds.add( nextValue );
      return nextValue;
    }
  }

  throw new Error(
    `Unable to generate a unique persistent block identity for prefix "${ prefix }" after ${ MAX_PERSISTENT_BLOCK_ID_ATTEMPTS } attempts.`,
  );
}

function toPersistentBlockIdentityValue( value: unknown ): string | null {
  if ( typeof value !== 'string' ) {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

function generateScopedSuffix(): string {
  const bytes = fillRandomBytes( SCOPED_SUFFIX_LENGTH );

  if ( bytes ) {
    return Array.from(
			bytes,
			( byte ) => ( byte % 36 ).toString( 36 ),
		).join( '' );
  }

  return Math.random()
		.toString( 36 )
		.slice( 2, 2 + SCOPED_SUFFIX_LENGTH )
		.padEnd( SCOPED_SUFFIX_LENGTH, '0' );
}

function formatUuidBytes( bytes: Uint8Array ): string {
  const hex = Array.from(
		bytes,
		( byte ) => byte.toString( UUID_HEX_RADIX ).padStart( 2, '0' ),
	).join( '' );

  return [
		hex.slice( 0, 8 ),
		hex.slice( 8, 12 ),
		hex.slice( 12, 16 ),
		hex.slice( 16, 20 ),
		hex.slice( 20 ),
	].join( '-' );
}

function fillRandomBytes( size: number ): Uint8Array | null {
  const cryptoObject = getCryptoObject();
  if ( typeof cryptoObject?.getRandomValues !== 'function' ) {
    return null;
  }

  const bytes = new Uint8Array( size );
  cryptoObject.getRandomValues( bytes );
  return bytes;
}

function getCryptoObject(): CryptoLike | undefined {
  return typeof globalThis.crypto === 'object' && globalThis.crypto
    ? (globalThis.crypto as CryptoLike)
    : undefined;
}
