import type {
  BlockInnerBlocksTemplateContract,
  BlockNestingContract,
} from '@wp-typia/block-runtime/metadata-core';

export const NESTED_BLOCK_FAMILY_BLOCK_NAMES = [
  'example/container',
  'example/section',
  'example/title',
  'example/body',
  'example/media',
] as const;

export const NESTED_BLOCK_FAMILY_NESTING = {
  'example/container': {
    allowedBlocks: ['example/section'],
    template: [
      [
        'example/section',
        { role: 'intro' },
        [
          ['example/title', { placeholder: 'Add a title' }],
          ['example/body', { placeholder: 'Add supporting copy' }],
          ['example/media', { aspectRatio: '16:9' }],
        ],
      ],
    ],
  },
  'example/section': {
    allowedBlocks: ['example/title', 'example/body', 'example/media'],
    parent: ['example/container'],
  },
  'example/title': {
    parent: ['example/section'],
  },
  'example/body': {
    ancestor: ['example/container'],
  },
  'example/media': {
    parent: ['example/section'],
  },
} as const satisfies BlockNestingContract;

export const NESTED_BLOCK_FAMILY_TEMPLATES = {
  'example/container': NESTED_BLOCK_FAMILY_NESTING['example/container'].template,
} as const satisfies BlockInnerBlocksTemplateContract;

export const NESTED_BLOCK_FAMILY_PATTERN_CONTENT = [
	'<!-- wp:example/container -->',
	'<div class="wp-block-example-container">',
	'<!-- wp:example/section {"role":"intro"} -->',
	'<section class="wp-block-example-section">',
	'<!-- wp:example/title {"text":"Nested family title"} /-->',
	'<!-- wp:example/body {"content":"Reusable supporting copy."} /-->',
	'<!-- wp:example/media {"aspectRatio":"16:9"} /-->',
	'</section>',
	'<!-- /wp:example/section -->',
	'</div>',
	'<!-- /wp:example/container -->',
].join('\n');
