/**
 * Derived from Gutenberg layout registry names.
 */
export type LayoutType = 'flow' | 'constrained' | 'flex' | 'grid';

export const LAYOUT_TYPES = [
  'flow',
  'constrained',
  'flex',
  'grid',
] as const satisfies readonly LayoutType[];

/**
 * Derived from Gutenberg flex layout options.
 */
export type FlexWrap = 'wrap' | 'nowrap';

export const FLEX_WRAP_OPTIONS = [
  'wrap',
  'nowrap',
] as const satisfies readonly FlexWrap[];

/**
 * Shared block editor orientation vocabulary.
 */
export type Orientation = 'horizontal' | 'vertical';

export const ORIENTATIONS = [
  'horizontal',
  'vertical',
] as const satisfies readonly Orientation[];
