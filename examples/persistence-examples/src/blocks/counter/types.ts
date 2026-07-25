import type { ValidationResult } from '@wp-typia/block-runtime/validation';
import { tags } from 'typia';

export type {
  ValidationResult,
  TypiaValidationError,
} from '@wp-typia/block-runtime/validation';

export interface PersistenceCounterAttributes {
  content: string &
		tags.MinLength< 1 > &
		tags.MaxLength< 250 > &
		tags.Default< 'Persistence counter example' >;
  showCount?: boolean & tags.Default< true >;
  buttonLabel?: string &
		tags.MinLength< 1 > &
		tags.MaxLength< 40 > &
		tags.Default< 'Persist Count' >;
  resourceKey?: string &
		tags.MinLength< 1 > &
		tags.MaxLength< 100 > &
		tags.Default< 'primary' >;
}

export interface PersistenceCounterContext {
  buttonLabel: string;
  bootstrapReady: boolean;
  canWrite: boolean;
  count: number;
  error: string;
  isBootstrapping: boolean;
  isLoading: boolean;
  isSaving: boolean;
  postId: number;
  resourceKey: string;
  storage: 'custom-table';
  client?: PersistenceCounterClientState;
}

export interface PersistenceCounterState {
  isHydrated: boolean;
}

export interface PersistenceCounterClientState {
  bootstrapError: string;
  writeExpiry: number;
  writeToken: string;
}

export type PersistenceCounterValidationResult =
	ValidationResult< PersistenceCounterAttributes >;
