/**
 * Derived from Gutenberg aspect ratio presets and dimensions controls.
 */
export type AspectRatio =
	| 'auto'
	| '1'
	| '1/1'
	| '4/3'
	| '3/4'
	| '3/2'
	| '2/3'
	| '16/9'
	| '9/16'
	| '21/9';

export const ASPECT_RATIOS = [
  'auto',
  '1',
  '1/1',
  '4/3',
  '3/4',
  '3/2',
  '2/3',
  '16/9',
  '9/16',
  '21/9',
] as const satisfies readonly AspectRatio[];

/**
 * Practical min-height value surface for WordPress dimension controls.
 *
 * This is primarily a type-level DX helper today. Typia metadata generation does
 * not yet consume imported template literal aliases such as `${number}px`.
 */
export type MinHeightValue =
	| `${number}px`
	| `${number}rem`
	| `${number}em`
	| `${number}%`
	| `${number}vh`
	| `${number}vw`
	| `var(${string})`
	| `clamp(${string})`
	| `min(${string})`
	| `max(${string})`;

/**
 * Pipeline-compatible min-height keyword subset for use in `types.ts`.
 */
export type MinHeightKeyword = 'auto' | 'inherit' | 'initial' | 'unset';

export const MIN_HEIGHT_KEYWORDS = [
  'auto',
  'inherit',
  'initial',
  'unset',
] as const satisfies readonly MinHeightKeyword[];
