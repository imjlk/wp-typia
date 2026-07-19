import { afterEach, describe, expect, test } from 'bun:test';

import {
	collectPersistentBlockIdentityRepairs,
	ensurePersistentBlockIdentity,
	generateBlockId,
	generatePublicWriteRequestId,
	generateResourceKey,
	generateScopedClientId,
} from '@wp-typia/block-runtime/identifiers';

const originalCryptoDescriptor = Object.getOwnPropertyDescriptor(
	globalThis,
	'crypto'
);
const originalMathRandom = Math.random;

afterEach( () => {
	if ( originalCryptoDescriptor ) {
		Object.defineProperty( globalThis, 'crypto', originalCryptoDescriptor );
	} else {
		Reflect.deleteProperty( globalThis, 'crypto' );
	}

	Math.random = originalMathRandom;
} );

describe( '@wp-typia/block-runtime/identifiers', () => {
	test( 'generateBlockId uses crypto.randomUUID when available', () => {
		const nativeUuid = '00000000-0000-4000-8000-000000000000';
		mockCrypto( {
			randomUUID: () => nativeUuid,
		} );

		expect( generateBlockId() ).toBe( nativeUuid );
	} );

	test( 'UUID helpers fall back to getRandomValues before Math.random', () => {
		mockCrypto( {
			getRandomValues: ( target ) => {
				target.set( [
					0x00, 0x01, 0x02, 0x03,
					0x04, 0x05, 0x06, 0x07,
					0x08, 0x09, 0x0a, 0x0b,
					0x0c, 0x0d, 0x0e, 0x0f,
				] );
				return target;
			},
		} );

		expect( generateBlockId() ).toBe( '00010203-0405-4607-8809-0a0b0c0d0e0f' );
		expect( generatePublicWriteRequestId() ).toBe(
			'00010203-0405-4607-8809-0a0b0c0d0e0f'
		);
	} );

	test( 'UUID helpers fall back to Math.random when crypto is unavailable', () => {
		mockCrypto( undefined );
		Math.random = () => 0.5;

		expect( generateBlockId() ).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
		);
		expect( generatePublicWriteRequestId() ).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
		);
	} );

	test( 'prefixed helpers preserve the prefix-suffix shape', () => {
		mockCrypto( {
			getRandomValues: ( target ) => {
				target.set( [ 0, 1, 2, 3, 4, 5, 6, 7, 8 ] );
				return target;
			},
		} );

		expect( generateScopedClientId( 'demo' ) ).toBe( 'demo-012345678' );
		expect( generateResourceKey( 'demo' ) ).toBe( 'demo-012345678' );
	} );

	test( 'prefixed helpers fall back to Math.random when crypto is unavailable', () => {
		mockCrypto( undefined );
		Math.random = () => 0.5;

		expect( generateScopedClientId( 'demo' ) ).toMatch( /^demo-[a-z0-9]{9}$/ );
		expect( generateResourceKey( 'demo' ) ).toMatch( /^demo-[a-z0-9]{9}$/ );
	} );

	test( 'ensurePersistentBlockIdentity preserves unique ids and regenerates missing or duplicate values', () => {
		expect(
			ensurePersistentBlockIdentity( {
				existingIds: [ 'sec-existing' ],
				prefix: 'sec',
				seenIds: [ 'sec-existing' ],
				value: 'sec-current',
			} )
		).toEqual( {
			changed: false,
			previousValue: 'sec-current',
			reason: null,
			value: 'sec-current',
		} );

		expect(
			ensurePersistentBlockIdentity( {
				existingIds: [ 'sec-existing' ],
				generateId: () => 'sec-generated',
				prefix: 'sec',
				seenIds: [ 'sec-existing' ],
				value: undefined,
			} )
		).toEqual( {
			changed: true,
			previousValue: null,
			reason: 'missing',
			value: 'sec-generated',
		} );

		expect(
			ensurePersistentBlockIdentity( {
				existingIds: [ 'sec-existing' ],
				generateId: () => 'sec-duplicate-fix',
				prefix: 'sec',
				seenIds: [ 'sec-existing' ],
				value: 'sec-existing',
			} )
		).toEqual( {
			changed: true,
			previousValue: 'sec-existing',
			reason: 'duplicate',
			value: 'sec-duplicate-fix',
		} );
	} );

	test( 'collectPersistentBlockIdentityRepairs only patches missing ids and later duplicates in one tree', () => {
		const repairs = collectPersistentBlockIdentityRepairs(
			[
				{
					attributes: {
						sectionId: 'sec-keep',
					},
					clientId: 'parent',
					innerBlocks: [
						{
							attributes: {},
							clientId: 'child-missing',
						},
						{
							attributes: {
								sectionId: 'sec-keep',
							},
							clientId: 'child-duplicate',
						},
						{
							attributes: {
								sectionId: 'custom-stable',
							},
							clientId: 'child-custom',
						},
					],
				},
			],
			{
				attributeName: 'sectionId',
				generateId: ( ( values ) => {
					let index = 0;
					return () => values[ index++ ] ?? `sec-fallback-${ index }`;
				} )( [ 'sec-generated', 'sec-regenerated' ] ),
				prefix: 'sec',
			}
		);

		expect( repairs ).toEqual( [
			{
				clientId: 'child-missing',
				nextValue: 'sec-generated',
				previousValue: null,
				reason: 'missing',
			},
			{
				clientId: 'child-duplicate',
				nextValue: 'sec-regenerated',
				previousValue: 'sec-keep',
				reason: 'duplicate',
			},
		] );
	} );

	test( 'collectPersistentBlockIdentityRepairs scopes duplicate repair to one block type', () => {
		const repairs = collectPersistentBlockIdentityRepairs(
			[
				{
					attributes: { resourceKey: 'shared-key' },
					clientId: 'first-counter',
					name: 'demo/counter',
				},
				{
					attributes: {},
					clientId: 'group',
					innerBlocks: [
						{
							attributes: { resourceKey: 'shared-key' },
							clientId: 'other-counter',
							name: 'demo/other-counter',
						},
						{
							attributes: { resourceKey: 'shared-key' },
							clientId: 'duplicate-counter',
							name: 'demo/counter',
						},
						{
							attributes: {},
							clientId: 'other-missing',
							name: 'demo/other-counter',
						},
					],
					name: 'core/group',
				},
				{
					attributes: {},
					clientId: 'missing-counter',
					name: 'demo/counter',
				},
			],
			{
				attributeName: 'resourceKey',
				blockName: 'demo/counter',
				generateId: ( ( values ) => {
					let index = 0;
					return () => values[ index++ ] ?? `counter-fallback-${ index }`;
				} )( [ 'counter-duplicate', 'counter-missing' ] ),
				prefix: 'counter',
			}
		);

		expect( repairs ).toEqual( [
			{
				clientId: 'duplicate-counter',
				nextValue: 'counter-duplicate',
				previousValue: 'shared-key',
				reason: 'duplicate',
			},
			{
				clientId: 'missing-counter',
				nextValue: 'counter-missing',
				previousValue: null,
				reason: 'missing',
			},
		] );
	} );

	test( 'ensurePersistentBlockIdentity handles one-shot seenId iterables safely', () => {
		function* createSeenIds() {
			yield 'sec-existing';
		}

		expect(
			ensurePersistentBlockIdentity( {
				existingIds: [ 'sec-existing' ],
				generateId: ( ( values ) => {
					let index = 0;
					return () => values[ index++ ] ?? `sec-fallback-${ index }`;
				} )( [ 'sec-existing', 'sec-fixed' ] ),
				prefix: 'sec',
				seenIds: createSeenIds(),
				value: 'sec-existing',
			} )
		).toEqual( {
			changed: true,
			previousValue: 'sec-existing',
			reason: 'duplicate',
			value: 'sec-fixed',
		} );
	} );
} );

function mockCrypto(
	value:
		| {
				getRandomValues?: ( target: Uint8Array ) => Uint8Array;
				randomUUID?: () => string;
		  }
		| undefined
) {
	Object.defineProperty( globalThis, 'crypto', {
		configurable: true,
		value,
	});
}
