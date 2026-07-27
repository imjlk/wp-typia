import type { ComponentProps } from 'react';
import type BlockAlignmentToolbar from '@wordpress/block-editor/components/block-alignment-toolbar';
import type BlockVerticalAlignmentToolbar from '@wordpress/block-editor/components/block-vertical-alignment-toolbar';

type DerivedBlockAlignment = Exclude<ComponentProps<typeof BlockAlignmentToolbar>['value'], undefined>;
type DerivedBlockVerticalAlignment = Exclude<
	ComponentProps<typeof BlockVerticalAlignmentToolbar>['value'],
	undefined
>;

/**
 * Derived from DefinitelyTyped's BlockAlignmentToolbar props.
 * Source of truth: @types/wordpress__block-editor/components/block-alignment-toolbar.d.ts
 */
export type BlockAlignment = 'left' | 'center' | 'right' | 'wide' | 'full';

export const BLOCK_ALIGNMENTS = [
  'left',
  'center',
  'right',
  'wide',
  'full',
] as const satisfies readonly DerivedBlockAlignment[];

/**
 * Derived from Gutenberg's TextAlignmentControl source and README.
 * There is no stable unofficial narrow export for this union today.
 */
export type TextAlignment = 'left' | 'center' | 'right' | 'justify';

export const TEXT_ALIGNMENTS = [
  'left',
  'center',
  'right',
  'justify',
] as const satisfies readonly TextAlignment[];

/**
 * Derived from DefinitelyTyped's BlockVerticalAlignmentToolbar props.
 * Source of truth: @types/wordpress__block-editor/components/block-vertical-alignment-toolbar.d.ts
 */
export type BlockVerticalAlignment = 'top' | 'center' | 'bottom';

export const BLOCK_VERTICAL_ALIGNMENTS = [
  'top',
  'center',
  'bottom',
] as const satisfies readonly DerivedBlockVerticalAlignment[];

/**
 * Derived from Gutenberg's justify-content control source.
 */
export type JustifyContent = 'left' | 'center' | 'right' | 'space-between' | 'stretch';

export const JUSTIFY_CONTENT_OPTIONS = [
  'left',
  'center',
  'right',
  'space-between',
  'stretch',
] as const satisfies readonly JustifyContent[];

/**
 * Derived from Gutenberg's block alignment matrix control source.
 */
export type BlockContentPosition =
	| 'center'
	| 'center center'
	| 'center left'
	| 'center right'
	| 'top center'
	| 'top left'
	| 'top right'
	| 'bottom center'
	| 'bottom left'
	| 'bottom right';

export const BLOCK_CONTENT_POSITIONS = [
  'center',
  'center center',
  'center left',
  'center right',
  'top center',
  'top left',
  'top right',
  'bottom center',
  'bottom left',
  'bottom right',
] as const satisfies readonly BlockContentPosition[];
