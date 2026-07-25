import typia from 'typia';

import { toValidationResult } from '@wp-typia/rest';
import type {
  MyTypiaBlockCounterQuery,
  MyTypiaBlockCounterResponse,
  MyTypiaBlockIncrementRequest,
  WpPostRecord,
  WpPostTypeCollection,
} from './api-types';

const validateCounterQuery = typia.createValidate< MyTypiaBlockCounterQuery >();
const validateIncrementRequest =
	typia.createValidate< MyTypiaBlockIncrementRequest >();
const validateCounterResponse =
	typia.createValidate< MyTypiaBlockCounterResponse >();
const validatePostTypes = typia.createValidate< WpPostTypeCollection >();
const validatePosts = typia.createValidate< WpPostRecord[] >();
const validatePost = typia.createValidate< WpPostRecord >();

export const apiValidators = {
  counterQuery: ( input: unknown ) =>
    toValidationResult< MyTypiaBlockCounterQuery >(validateCounterQuery(input)),
  counterResponse: ( input: unknown ) =>
    toValidationResult< MyTypiaBlockCounterResponse >(
      validateCounterResponse(input),
    ),
  incrementRequest: ( input: unknown ) =>
    toValidationResult< MyTypiaBlockIncrementRequest >(
      validateIncrementRequest(input),
    ),
  post: ( input: unknown ) =>
    toValidationResult< WpPostRecord >(validatePost(input)),
  postCollection: ( input: unknown ) =>
    toValidationResult< WpPostRecord[] >(validatePosts(input)),
  postTypes: ( input: unknown ) =>
    toValidationResult< WpPostTypeCollection >(validatePostTypes(input)),
};
