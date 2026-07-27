/* eslint-disable no-console */
import { store, getContext } from '@wordpress/interactivity';
import { getCounter, incrementCounter } from './api';
import { MyTypiaBlockState } from './types';

const { actions, state } = store( 'my-typia-block', {
	state: {
		count: 0,
		isActive: false,
		isHydrated: false,
		isVisible: true,
		isLoading: false,
		isSaving: false,
	} as MyTypiaBlockState,

	actions: {
		toggle() {
			state.isActive = ! state.isActive;
			console.log( 'MyTypiaBlock toggled:', state.isActive );
		},

		hide() {
			state.isVisible = false;
		},

		show() {
			state.isVisible = true;
		},

		async loadContent() {
			state.isLoading = true;

			try {
				// Simulate async operation
				await new Promise( ( resolve ) => setTimeout( resolve, 1000 ) );

				// Get context data
				const context = getContext< {
					content: string;
					alignment: string;
				} >();

				console.log( 'MyTypiaBlock content loaded:', context );
			} catch ( error ) {
				state.error =
					error instanceof Error ? error.message : 'Unknown error';
				console.error( 'MyTypiaBlock loading failed:', error );
			} finally {
				state.isLoading = false;
			}
		},
		async loadCounter() {
			const context = getContext< {
				id?: string;
				postId?: number;
			} >();
			if ( ! context.id || ! context.postId ) {
				return;
			}

			state.isLoading = true;
			state.error = undefined;

			try {
				const result = await getCounter( {
					postId: context.postId,
					resourceKey: context.id,
				} );
				if ( ! result.isValid || ! result.data ) {
					state.error =
						result.errors[ 0 ]?.expected ??
						'Unable to load counter';
					return;
				}
				state.count = result.data.count;
			} catch ( error ) {
				state.error =
					error instanceof Error ? error.message : 'Unknown error';
			} finally {
				state.isLoading = false;
			}
		},
		async incrementCounter() {
			const context = getContext< {
				id?: string;
				postId?: number;
				restNonce?: string;
			} >();
			if ( ! context.id || ! context.postId ) {
				return;
			}

			state.isSaving = true;
			state.error = undefined;

			try {
				const result = await incrementCounter(
					{
						delta: 1,
						postId: context.postId,
						resourceKey: context.id,
					},
					context.restNonce,
				);
				if ( ! result.isValid || ! result.data ) {
					state.error =
						result.errors[ 0 ]?.expected ??
						'Unable to increment counter';
					return;
				}
				state.count = result.data.count;
			} catch ( error ) {
				state.error =
					error instanceof Error ? error.message : 'Unknown error';
			} finally {
				state.isSaving = false;
			}
		},
	},

	callbacks: {
		init() {
			console.log(
				'MyTypiaBlock initialized with Typia validation and Interactivity API',
			);
		},

		mounted() {
			const context = getContext();
			console.log( 'MyTypiaBlock mounted with context:', context );
			state.isHydrated = true;
			if ( typeof document !== 'undefined' ) {
				document.documentElement.dataset.myTypiaBlockHydrated = 'true';
			}
			void actions.loadCounter();
		},
	},
} );
