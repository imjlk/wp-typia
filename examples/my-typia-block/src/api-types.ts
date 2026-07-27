import { tags } from 'typia';

export interface MyTypiaBlockCounterQuery {
  postId: number & tags.Type< 'uint32' >;
  resourceKey: string & tags.MinLength< 1 > & tags.MaxLength< 100 >;
}

export interface MyTypiaBlockIncrementRequest {
  postId: number & tags.Type< 'uint32' >;
  resourceKey: string & tags.MinLength< 1 > & tags.MaxLength< 100 >;
  delta?: number &
		tags.Minimum< 1 > &
		tags.Type< 'uint32' > &
		tags.Default< 1 >;
}

export interface MyTypiaBlockCounterResponse {
  postId: number & tags.Type< 'uint32' >;
  resourceKey: string & tags.MinLength< 1 > & tags.MaxLength< 100 >;
  count: number & tags.Minimum< 0 > & tags.Type< 'uint32' >;
  storage: 'custom-table';
}

export interface WpPostType {
  rest_base: string & tags.MinLength< 1 >;
  slug: string & tags.MinLength< 1 >;
  viewable: boolean;
}

export interface WpPostRecord {
  content?: { raw?: string };
  id: number & tags.Type< 'uint32' >;
  title?: { rendered?: string };
}

export type WpPostTypeCollection = Record< string, WpPostType >;
