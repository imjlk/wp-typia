import { getContext, store } from '@wordpress/interactivity';

import { fetchLikeBootstrap, fetchLikeStatus, toggleLike } from './api';
import type {
  PersistenceLikeButtonClientState,
  PersistenceLikeButtonContext,
  PersistenceLikeButtonState,
} from './types';

function getButtonLabel(
	context: PersistenceLikeButtonContext,
	liked: boolean,
): string {
  return liked ? context.unlikeLabel : context.likeLabel;
}

const BOOTSTRAP_MAX_ATTEMPTS = 3;
const BOOTSTRAP_RETRY_DELAYS_MS = [ 250, 500 ];

async function waitForBootstrapRetry( delayMs: number ): Promise< void > {
  await new Promise(( resolve ) => {
    setTimeout(resolve, delayMs);
  });
}

function getClientState(
	context: PersistenceLikeButtonContext,
): PersistenceLikeButtonClientState {
  if ( context.client ) {
    return context.client;
  }

  context.client = {
    bootstrapError: '',
    liked: false,
    writeNonce: '',
  };

  return context.client;
}

function clearBootstrapError(
	context: PersistenceLikeButtonContext,
	clientState: PersistenceLikeButtonClientState,
) {
  if ( context.error === clientState.bootstrapError ) {
    context.error = '';
  }
  clientState.bootstrapError = '';
}

function setBootstrapError(
	context: PersistenceLikeButtonContext,
	clientState: PersistenceLikeButtonClientState,
	message: string,
) {
  clientState.bootstrapError = message;
  context.error = message;
}

const { actions, state } = store( 'persistenceExamplesLikeButton', {
	state: {
		isHydrated: false,
	} as PersistenceLikeButtonState,

	actions: {
		async loadStatus() {
			const context = getContext< PersistenceLikeButtonContext >();
			if ( context.postId <= 0 || ! context.resourceKey ) {
				return;
			}

			context.isLoading = true;
			context.error = '';

			try {
				const result = await fetchLikeStatus( {
					postId: context.postId,
					resourceKey: context.resourceKey,
				} );
				if ( ! result.isValid || ! result.data ) {
					context.error =
						result.errors[ 0 ]?.expected ??
						'Unable to load like state';
					return;
				}

				context.count = result.data.count;
			} catch ( error ) {
				context.error =
					error instanceof Error
						? error.message
						: 'Unknown loading error';
			} finally {
				context.isLoading = false;
			}
		},
		async loadBootstrap() {
			const context = getContext< PersistenceLikeButtonContext >();
			const clientState = getClientState( context );
			if ( context.postId <= 0 || ! context.resourceKey ) {
				context.bootstrapReady = true;
				context.buttonLabel = context.likeLabel;
				context.canWrite = false;
				clientState.bootstrapError = '';
				clientState.liked = false;
				clientState.writeNonce = '';
				return;
			}

			context.isBootstrapping = true;

			let bootstrapSucceeded = false;
			let lastBootstrapError = 'Unable to initialize write access';

			for (
				let attempt = 1;
				attempt <= BOOTSTRAP_MAX_ATTEMPTS;
				attempt += 1
			) {
				try {
					const result = await fetchLikeBootstrap( {
						postId: context.postId,
						resourceKey: context.resourceKey,
					} );
					if ( ! result.isValid || ! result.data ) {
						lastBootstrapError =
							result.errors[ 0 ]?.expected ??
							'Unable to initialize write access';
						if ( attempt < BOOTSTRAP_MAX_ATTEMPTS ) {
							await waitForBootstrapRetry(
								BOOTSTRAP_RETRY_DELAYS_MS[ attempt - 1 ] ?? 750,
							);
							continue;
						}
						break;
					}

					context.bootstrapReady = true;
					clientState.writeNonce =
						typeof result.data.restNonce === 'string' &&
						result.data.restNonce.length > 0
							? result.data.restNonce
							: '';
					context.canWrite =
						result.data.canWrite === true &&
						clientState.writeNonce.length > 0;
					clientState.liked = result.data.likedByCurrentUser === true;
					context.buttonLabel = getButtonLabel(
						context,
						clientState.liked,
					);
					clearBootstrapError( context, clientState );
					bootstrapSucceeded = true;
					break;
				} catch ( error ) {
					lastBootstrapError =
						error instanceof Error
							? error.message
							: 'Unknown bootstrap error';
					if ( attempt < BOOTSTRAP_MAX_ATTEMPTS ) {
						await waitForBootstrapRetry(
							BOOTSTRAP_RETRY_DELAYS_MS[ attempt - 1 ] ?? 750,
						);
						continue;
					}
					break;
				}
			}

			if ( ! bootstrapSucceeded ) {
				context.bootstrapReady = false;
				context.canWrite = false;
				clientState.liked = false;
				clientState.writeNonce = '';
				setBootstrapError( context, clientState, lastBootstrapError );
			}
			context.isBootstrapping = false;
		},
		async toggle() {
			const context = getContext< PersistenceLikeButtonContext >();
			if ( context.postId <= 0 || ! context.resourceKey ) {
				return;
			}
			if ( ! context.bootstrapReady ) {
				await actions.loadBootstrap();
			}
			if ( ! context.bootstrapReady ) {
				context.error = 'Write access is still initializing.';
				return;
			}
			if ( ! context.canWrite ) {
				context.error = 'Sign in to like this item.';
				return;
			}
			const clientState = getClientState( context );

			context.isSaving = true;
			context.error = '';

			try {
				const result = await toggleLike(
					{
						postId: context.postId,
						resourceKey: context.resourceKey,
					},
					clientState.writeNonce,
				);
				if ( ! result.isValid || ! result.data ) {
					context.error =
						result.errors[ 0 ]?.expected ?? 'Unable to toggle like';
					return;
				}

				context.count = result.data.count;
				clientState.liked = result.data.likedByCurrentUser;
				context.buttonLabel = getButtonLabel(
					context,
					result.data.likedByCurrentUser,
				);
			} catch ( error ) {
				context.error =
					error instanceof Error
						? error.message
						: 'Unknown update error';
			} finally {
				context.isSaving = false;
			}
		},
	},

	callbacks: {
		init() {
			const context = getContext< PersistenceLikeButtonContext >();
			context.client = {
				bootstrapError: '',
				liked: false,
				writeNonce: '',
			};
			context.bootstrapReady = false;
			context.buttonLabel = context.likeLabel;
			context.canWrite = false;
			context.count = 0;
			context.error = '';
			context.isBootstrapping = false;
			context.isLoading = false;
			context.isSaving = false;
		},
		mounted() {
			state.isHydrated = true;
			if ( typeof document !== 'undefined' ) {
				document.documentElement.dataset.persistenceLikeButtonHydrated =
					'true';
			}
			void Promise.allSettled( [
				actions.loadStatus(),
				actions.loadBootstrap(),
			] );
		},
	},
} );
