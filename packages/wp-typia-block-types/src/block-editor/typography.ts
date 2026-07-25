/**
 * Derived from Gutenberg text-transform control values.
 */
export type TextTransform = 'none' | 'capitalize' | 'uppercase' | 'lowercase';

export const TEXT_TRANSFORMS = [
  'none',
  'capitalize',
  'uppercase',
  'lowercase',
] as const satisfies readonly TextTransform[];

/**
 * Derived from Gutenberg text-decoration control values.
 */
export type TextDecoration = 'none' | 'underline' | 'line-through';

export const TEXT_DECORATIONS = [
  'none',
  'underline',
  'line-through',
] as const satisfies readonly TextDecoration[];

/**
 * Derived from Gutenberg font appearance controls.
 */
export type FontStyle = 'normal' | 'italic';

export const FONT_STYLES = [
  'normal',
  'italic',
] as const satisfies readonly FontStyle[];

/**
 * Derived from Gutenberg writing mode control values.
 */
export type WritingMode = 'horizontal-tb' | 'vertical-rl' | 'vertical-lr';

export const WRITING_MODES = [
  'horizontal-tb',
  'vertical-rl',
  'vertical-lr',
] as const satisfies readonly WritingMode[];
