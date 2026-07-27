import { tags } from 'typia';

export interface PersistenceCounterQuery {
  postId: number & tags.Type< 'uint32' >;
  resourceKey: string & tags.MinLength< 1 > & tags.MaxLength< 100 >;
}

export interface PersistenceCounterBootstrapQuery {
  postId: number & tags.Type< 'uint32' >;
  resourceKey: string & tags.MinLength< 1 > & tags.MaxLength< 100 >;
}

export interface PersistenceCounterIncrementRequest {
  postId: number & tags.Type< 'uint32' >;
  publicWriteRequestId: string & tags.MinLength< 1 > & tags.MaxLength< 128 >;
  resourceKey: string & tags.MinLength< 1 > & tags.MaxLength< 100 >;
  publicWriteToken?: string & tags.MinLength< 1 > & tags.MaxLength< 512 >;
  delta?: number &
		tags.Minimum< 1 > &
		tags.Type< 'uint32' > &
		tags.Default< 1 >;
}

export interface PersistenceCounterBootstrapResponse {
  canWrite: boolean;
  publicWriteExpiresAt?: number & tags.Type< 'uint32' >;
  publicWriteToken?: string & tags.MinLength< 1 > & tags.MaxLength< 512 >;
}

export interface PersistenceCounterResponse {
  postId: number & tags.Type< 'uint32' >;
  resourceKey: string & tags.MinLength< 1 > & tags.MaxLength< 100 >;
  count: number & tags.Minimum< 0 > & tags.Type< 'uint32' >;
  storage: 'custom-table';
}
