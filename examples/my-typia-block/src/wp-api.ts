import apiFetch from '@wordpress/api-fetch';
import { createValidatedFetch } from '@wp-typia/rest';

import { apiValidators } from './api-validators';
import type { WpPostRecord, WpPostTypeCollection } from './api-types';

const fetchPostTypes = createValidatedFetch< WpPostTypeCollection >(
  apiValidators.postTypes,
  apiFetch,
);
const fetchPosts = createValidatedFetch< WpPostRecord[] >(
  apiValidators.postCollection,
  apiFetch,
);
const fetchPost = createValidatedFetch< WpPostRecord >(
  apiValidators.post,
  apiFetch,
);

export function getEditablePostTypes() {
  return fetchPostTypes.fetch({
    parse: false,
    path: '/wp/v2/types?context=edit',
  });
}

export function getPostsByRestBase( restBase: string, page: number ) {
  return fetchPosts.fetchWithResponse({
    parse: false,
    path: `/wp/v2/${ restBase }?context=edit&per_page=100&page=${ page }`,
  });
}

export function getPostByRestBase( restBase: string, postId: number ) {
  return fetchPost.fetch({
    path: `/wp/v2/${ restBase }/${ postId }?context=edit`,
  });
}
