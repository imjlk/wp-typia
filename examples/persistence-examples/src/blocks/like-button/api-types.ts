import { tags } from 'typia';

export interface PersistenceLikeStatusQuery {
  postId: number & tags.Type< 'uint32' >;
  resourceKey: string & tags.MinLength< 1 > & tags.MaxLength< 100 >;
}

export interface PersistenceLikeBootstrapQuery {
  postId: number & tags.Type< 'uint32' >;
  resourceKey: string & tags.MinLength< 1 > & tags.MaxLength< 100 >;
}

export interface PersistenceToggleLikeRequest {
  postId: number & tags.Type< 'uint32' >;
  resourceKey: string & tags.MinLength< 1 > & tags.MaxLength< 100 >;
}

export interface PersistenceLikeBootstrapResponse {
  canWrite: boolean;
  likedByCurrentUser: boolean;
  restNonce?: string & tags.MinLength< 1 > & tags.MaxLength< 128 >;
}

export interface PersistenceLikeStatusResponse {
  postId: number & tags.Type< 'uint32' >;
  resourceKey: string & tags.MinLength< 1 > & tags.MaxLength< 100 >;
  count: number & tags.Minimum< 0 > & tags.Type< 'uint32' >;
  storage: 'custom-table';
}

export interface PersistenceToggleLikeResponse {
  postId: number & tags.Type< 'uint32' >;
  resourceKey: string & tags.MinLength< 1 > & tags.MaxLength< 100 >;
  count: number & tags.Minimum< 0 > & tags.Type< 'uint32' >;
  likedByCurrentUser: boolean;
  storage: 'custom-table';
}
