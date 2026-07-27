/**
 * Derived from Gutenberg spacing sizes control helpers.
 */
export type SpacingSide = 'top' | 'right' | 'bottom' | 'left';

export const SPACING_SIDES = [
  'top',
  'right',
  'bottom',
  'left',
] as const satisfies readonly SpacingSide[];

/**
 * Derived from Gutenberg spacing axial side helpers.
 */
export type SpacingAxis = 'horizontal' | 'vertical';

export const SPACING_AXES = [
  'horizontal',
  'vertical',
] as const satisfies readonly SpacingAxis[];

export type SpacingDimension = SpacingSide | SpacingAxis;

export const SPACING_DIMENSIONS = [
  ...SPACING_SIDES,
  ...SPACING_AXES,
] as const satisfies readonly SpacingDimension[];
