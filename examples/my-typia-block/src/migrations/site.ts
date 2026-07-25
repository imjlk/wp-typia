import apiFetch from '@wordpress/api-fetch';
import { parse, serialize } from '@wordpress/blocks';
import type { BlockInstance } from '@wp-typia/block-types/blocks/registration';
import typia from 'typia';

import {
  getEditablePostTypes,
  getPostByRestBase,
  getPostsByRestBase,
} from '../wp-api';
import type { WpPostRecord, WpPostType } from '../api-types';
import migrationConfig from './config';
import { resolveMigrationState } from './analysis';
import type {
  BatchMigrationBlockResult,
  BatchMigrationResult,
  BlockScanResult,
} from './types';

type ParsedBlock = BlockInstance< Record< string, unknown > >;

interface GroupedScanResult {
  postId: number;
  postTitle: string;
  postType: string;
  rawContent: string;
  restBase: string;
  results: BlockScanResult[];
}

interface EditablePostUpdateRequest {
  content: string;
}

interface EditablePostType {
  rest_base: WpPostType[ 'rest_base' ];
  slug: WpPostType[ 'slug' ];
}

type EditablePostRecord = WpPostRecord;

/**
 * Scans editable posts for blocks that still need migration work.
 * @param blockName
 */
export async function scanSiteForMigrations(
	blockName: string = migrationConfig.blockName,
): Promise< BlockScanResult[] > {
  const postTypes = await fetchEditablePostTypes();
  const results: BlockScanResult[] = [];

  for ( const postType of postTypes ) {
    const posts = await fetchAllPosts( postType.rest_base );
    for ( const post of posts ) {
      const content = post?.content?.raw;
      if ( typeof content !== 'string' || content.length === 0 ) {
        continue;
      }

      const blocks = parse( content );
      walkBlocks( blocks, [], ( block, blockPath ) => {
				if ( block.name !== blockName ) {
					return;
				}

				const attributes = ( block.attributes ?? {} ) as Record<
					string,
					unknown
				>;
				const resolution = resolveMigrationState( attributes );

				if (
					resolution.analysis.needsMigration ||
					resolution.preview.changedFields.length > 0 ||
					resolution.preview.unresolved.length > 0 ||
					resolution.preview.validationErrors.length > 0
				) {
					results.push( {
						analysis: resolution.analysis,
						attributes,
						blockName,
						blockPath,
						postId: post.id,
						postTitle: post?.title?.rendered ?? `Post ${ post.id }`,
						postType: postType.slug,
						preview: resolution.preview,
						rawContent: content,
						restBase: postType.rest_base,
					} );
				}
			} );
    }
  }

  return results;
}

/**
 * Replays a scan result set and writes migrated post content when requested.
 * @param results
 * @param root0
 * @param root0.dryRun
 */
export async function batchMigrateScanResults(
	results: BlockScanResult[],
	{ dryRun = false }: { dryRun?: boolean } = {},
): Promise< BatchMigrationResult > {
  const grouped = groupResultsByPost( results );
  const summary: BatchMigrationResult = {
    errors: [],
    failed: 0,
    posts: [],
    successful: 0,
    total: Object.keys( grouped ).length,
  };

  for ( const group of Object.values( grouped ) ) {
    const blockPreviews = group.results.map( ( result ) => {
			const resolution = resolveMigrationState( result.attributes );
			const reason =
				resolution.preview.validationErrors[ 0 ] ??
				resolution.preview.unresolved[ 0 ] ??
				undefined;
			const status =
				resolution.preview.after &&
				resolution.preview.unresolved.length === 0 &&
				resolution.preview.validationErrors.length === 0
					? 'success'
					: 'failed';

			return {
				blockPath: result.blockPath,
				currentMigrationVersion:
					resolution.analysis.currentMigrationVersion,
				preview: resolution.preview,
				reason,
				status,
				targetMigrationVersion:
					resolution.analysis.targetMigrationVersion,
			} satisfies BatchMigrationBlockResult;
		} );

    const failedPreview = blockPreviews.find(
      ( preview ) => preview.status === 'failed',
    );
    if ( failedPreview ) {
      summary.failed += 1;
      summary.errors.push( {
				postId: group.postId,
				reason:
					failedPreview.reason ??
					'One or more blocks could not be migrated.',
			} );
      summary.posts.push({
        postId: group.postId,
        postTitle: group.postTitle,
        postType: group.postType,
        previews: blockPreviews,
        reason: failedPreview.reason,
        status: 'failed',
      });
      continue;
    }

    try {
      const migratedContent = migratePostContent(
        blockPreviews,
        group.rawContent,
      );
      if ( ! dryRun ) {
        const latestPost = await fetchPostById(group.restBase, group.postId);
        const latestContent = latestPost.content?.raw;
        if (
					typeof latestContent !== 'string' ||
					latestContent !== group.rawContent
				) {
          recordBatchFailure(
            summary,
            group,
            blockPreviews,
            'Post content changed after the scan. Re-run the migration scan before writing.',
          );
          continue;
        }

        await apiFetch({
          body: typia.json.assertStringify< EditablePostUpdateRequest >({
            content: migratedContent,
          }),
          headers: {
            'Content-Type': 'application/json',
          },
          method: 'POST',
          path: `/wp/v2/${ group.restBase }/${ group.postId }`,
        });
      }
    } catch ( error ) {
      recordBatchFailure(
        summary,
        group,
        blockPreviews,
        error instanceof Error
          ? error.message
          : 'One or more posts could not be migrated.',
      );
      continue;
    }

    summary.successful += 1;
    summary.posts.push({
      postId: group.postId,
      postTitle: group.postTitle,
      postType: group.postType,
      previews: blockPreviews,
      status: 'success',
    });
  }

  return summary;
}

function recordBatchFailure(
	summary: BatchMigrationResult,
	group: GroupedScanResult,
	blockPreviews: BatchMigrationBlockResult[],
	reason: string,
) {
  summary.failed += 1;
  summary.errors.push({
    postId: group.postId,
    reason,
  });
  summary.posts.push({
    postId: group.postId,
    postTitle: group.postTitle,
    postType: group.postType,
    previews: blockPreviews,
    reason,
    status: 'failed',
  });
}

async function fetchEditablePostTypes(): Promise< EditablePostType[] > {
  const result = await getEditablePostTypes();
  if ( ! result.isValid || ! result.data ) {
    throw new Error(
			result.errors[ 0 ]?.expected ??
				'Unable to validate editable post types.',
		);
  }

  return Object.values( result.data )
		.filter( ( postType ) => postType?.viewable && postType?.rest_base )
		.map( ( postType ) => ( {
			rest_base: postType.rest_base!,
			slug: postType.slug!,
		} ) );
}

async function fetchAllPosts(
	restBase: string,
): Promise< EditablePostRecord[] > {
  let page = 1;
  let totalPages = 1;
  const entries: EditablePostRecord[] = [];

  do {
    const result = await getPostsByRestBase( restBase, page );
    if ( ! result.validation.isValid || ! result.validation.data ) {
      throw new Error(
				result.validation.errors[ 0 ]?.expected ??
					`Unable to validate post collection for ${ restBase }.`,
			);
    }
    totalPages = Number.parseInt(
      result.response.headers.get( 'X-WP-TotalPages' ) ?? '1',
      10,
    );
    entries.push( ...result.validation.data );
    page += 1;
  } while ( page <= totalPages );

  return entries;
}

async function fetchPostById(
	restBase: string,
	postId: number,
): Promise< EditablePostRecord > {
  const result = await getPostByRestBase( restBase, postId );
  if ( ! result.isValid || ! result.data ) {
    throw new Error(
			result.errors[ 0 ]?.expected ??
				`Unable to validate post ${ postId } for ${ restBase }.`,
		);
  }

  return result.data;
}

function walkBlocks(
	blocks: ParsedBlock[],
	pathPrefix: number[],
	visitor: ( block: ParsedBlock, path: number[] ) => void,
): void {
  blocks.forEach( ( block, index ) => {
		const blockPath = [ ...pathPrefix, index ];
		visitor( block, blockPath );
		if (
			Array.isArray( block.innerBlocks ) &&
			block.innerBlocks.length > 0
		) {
			walkBlocks( block.innerBlocks, blockPath, visitor );
		}
	} );
}

function groupResultsByPost(
	results: BlockScanResult[],
): Record< string, GroupedScanResult > {
  return results.reduce< Record< string, GroupedScanResult > >(
		( accumulator, result ) => {
			const key = `${ result.restBase }:${ result.postId }`;
			if ( ! accumulator[ key ] ) {
				accumulator[ key ] = {
					postId: result.postId,
					postTitle: result.postTitle,
					postType: result.postType,
					rawContent: result.rawContent,
					restBase: result.restBase,
					results: [],
				};
			}
			accumulator[ key ].results.push( result );
			return accumulator;
		},
		{},
	);
}

function migratePostContent(
	results: BatchMigrationBlockResult[],
	rawContent: string,
): string {
  const replacements = new Map(
		results
			.filter( ( result ) => result.preview.after )
			.map( ( result ) => [
				result.blockPath.join( '.' ),
				result.preview.after as Record< string, unknown >,
			] ),
	);
  const blocks = parse( rawContent ) as ParsedBlock[];
  const nextBlocks = replaceBlocks( blocks, [], replacements );
  return serialize( nextBlocks );
}

function replaceBlocks(
	blocks: ParsedBlock[],
	pathPrefix: number[],
	replacements: Map< string, Record< string, unknown > >,
): ParsedBlock[] {
  return blocks.map(( block, index ) => {
    const blockPath = [...pathPrefix, index];
    const replacement = replacements.get(blockPath.join('.'));
    const innerBlocks = Array.isArray(block.innerBlocks)
      ? replaceBlocks(block.innerBlocks, blockPath, replacements)
      : [];

    if ( ! replacement ) {
      return {
        ...block,
        innerBlocks,
      };
    }

    return {
      ...block,
      attributes: replacement,
      innerBlocks,
    };
  });
}
