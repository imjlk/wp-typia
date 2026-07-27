import { getContext, store } from '@wordpress/interactivity';
import { generatePublicWriteRequestId } from '@wp-typia/block-runtime/identifiers';

import { fetchCounter, fetchCounterBootstrap, incrementCounter } from './api';
import type {
  PersistenceCounterClientState,
  PersistenceCounterContext,
  PersistenceCounterState,
} from './types';

function hasExpiredPublicWriteToken( expiresAt?: number ): boolean {
  return (
		typeof expiresAt === 'number' &&
		expiresAt > 0 &&
		Date.now() >= expiresAt * 1000
	);
}

function getWriteBlockedMessage(): string {
  return 'Public writes are temporarily unavailable.';
}

const BOOTSTRAP_MAX_ATTEMPTS = 3;
const BOOTSTRAP_RETRY_DELAYS_MS = [ 250, 500 ];

async function waitForBootstrapRetry( delayMs: number ): Promise< void > {
  await new Promise(( resolve ) => {
    setTimeout(resolve, delayMs);
  });
}

function getClientState(
	context: PersistenceCounterContext,
): PersistenceCounterClientState {
  if ( context.client ) {
    return context.client;
  }

  context.client = {
    bootstrapError: '',
    writeExpiry: 0,
    writeToken: '',
  };

  return context.client;
}

function clearBootstrapError(
	context: PersistenceCounterContext,
	clientState: PersistenceCounterClientState,
) {
  if ( context.error === clientState.bootstrapError ) {
    context.error = '';
  }
  clientState.bootstrapError = '';
}

function setBootstrapError(
	context: PersistenceCounterContext,
	clientState: PersistenceCounterClientState,
	message: string,
) {
  clientState.bootstrapError = message;
  context.error = message;
}

const { actions, state } = store( 'persistenceExamplesCounter', {
	state: {
		isHydrated: false,
	} as PersistenceCounterState,

	actions: {
		async loadCounter() {
			const context = getContext< PersistenceCounterContext >();
			if ( context.postId <= 0 || ! context.resourceKey ) {
				return;
			}

			context.isLoading = true;
			context.error = '';

			try {
				const result = await fetchCounter( {
					postId: context.postId,
					resourceKey: context.resourceKey,
				} );
				if ( ! result.isValid || ! result.data ) {
					context.error =
						result.errors[ 0 ]?.expected ??
						'Unable to load the counter';
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
			const context = getContext< PersistenceCounterContext >();
			const clientState = getClientState( context );
			if ( context.postId <= 0 || ! context.resourceKey ) {
				context.bootstrapReady = true;
				context.canWrite = false;
				clientState.bootstrapError = '';
				clientState.writeExpiry = 0;
				clientState.writeToken = '';
				return;
			}

			context.isBootstrapping = true;

			let lastBootstrapError = 'Unable to initialize write access';
			let bootstrapSucceeded = false;

			for (
				let attempt = 1;
				attempt <= BOOTSTRAP_MAX_ATTEMPTS;
				attempt += 1
			) {
				try {
					const result = await fetchCounterBootstrap( {
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

					clientState.writeExpiry =
						typeof result.data.publicWriteExpiresAt === 'number' &&
						result.data.publicWriteExpiresAt > 0
							? result.data.publicWriteExpiresAt
							: 0;
					clientState.writeToken =
						typeof result.data.publicWriteToken === 'string' &&
						result.data.publicWriteToken.length > 0
							? result.data.publicWriteToken
							: '';
					context.bootstrapReady = true;
					context.canWrite =
						result.data.canWrite === true &&
						clientState.writeToken.length > 0 &&
						! hasExpiredPublicWriteToken( clientState.writeExpiry );
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
				clientState.writeExpiry = 0;
				clientState.writeToken = '';
				setBootstrapError( context, clientState, lastBootstrapError );
			}
			context.isBootstrapping = false;
		},
		async increment() {
			const context = getContext< PersistenceCounterContext >();
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
			const clientState = getClientState( context );
			if ( hasExpiredPublicWriteToken( clientState.writeExpiry ) ) {
				await actions.loadBootstrap();
			}
			if ( hasExpiredPublicWriteToken( clientState.writeExpiry ) ) {
				context.canWrite = false;
				context.error = getWriteBlockedMessage();
				return;
			}
			if ( ! context.canWrite ) {
				context.error = getWriteBlockedMessage();
				return;
			}

			context.isSaving = true;
			context.error = '';

			try {
				const result = await incrementCounter( {
					delta: 1,
					postId: context.postId,
					publicWriteRequestId: generatePublicWriteRequestId(),
					publicWriteToken: clientState.writeToken,
					resourceKey: context.resourceKey,
				} );
				if ( ! result.isValid || ! result.data ) {
					context.error =
						result.errors[ 0 ]?.expected ??
						'Unable to update the counter';
					return;
				}

				context.count = result.data.count;
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
			const context = getContext< PersistenceCounterContext >();
			context.client = {
				bootstrapError: '',
				writeExpiry: 0,
				writeToken: '',
			};
			context.bootstrapReady = false;
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
				document.documentElement.dataset.persistenceCounterHydrated =
					'true';
			}
			void Promise.allSettled( [
				actions.loadCounter(),
				actions.loadBootstrap(),
			] );
		},
	},
} );
