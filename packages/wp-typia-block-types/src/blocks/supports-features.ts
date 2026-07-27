/**
 * Derived from Gutenberg block support keys and commonly used block.json
 * support sections.
 */
export type BlockSupportFeature =
  | 'align'
  | 'alignWide'
  | 'allowedBlocks'
  | 'anchor'
  | 'ariaLabel'
  | 'autoRegister'
  | 'background'
  | 'border'
  | 'className'
  | 'color'
  | 'contentRole'
  | 'customClassName'
  | 'dimensions'
  | 'filter'
  | 'html'
  | 'inserter'
  | 'interactivity'
  | 'js'
  | 'layout'
  | 'lightbox'
  | 'listView'
  | 'lock'
  | 'locking'
  | 'multiple'
  | 'position'
  | 'renaming'
  | 'reusable'
  | 'shadow'
  | 'spacing'
  | 'splitting'
  | 'visibility'
  | 'typography';

export const BLOCK_SUPPORT_FEATURES = [
  'align',
  'alignWide',
  'allowedBlocks',
  'anchor',
  'ariaLabel',
  'autoRegister',
  'background',
  'border',
  'className',
  'color',
  'contentRole',
  'customClassName',
  'dimensions',
  'filter',
  'html',
  'inserter',
  'interactivity',
  'js',
  'layout',
  'lightbox',
  'listView',
  'lock',
  'locking',
  'multiple',
  'position',
  'renaming',
  'reusable',
  'shadow',
  'spacing',
  'splitting',
  'typography',
  'visibility',
] as const satisfies readonly BlockSupportFeature[];

export type TypographySupportKey =
  | 'fontFamily'
  | 'fontSize'
  | 'fontStyle'
  | 'fontWeight'
  | 'letterSpacing'
  | 'lineHeight'
  | 'dropCap'
  | 'textAlign'
  | 'textColumns'
  | 'textDecoration'
  | 'textTransform'
  | 'writingMode';

export const TYPOGRAPHY_SUPPORT_KEYS = [
  'fontFamily',
  'fontSize',
  'fontStyle',
  'fontWeight',
  'letterSpacing',
  'lineHeight',
  'dropCap',
  'textAlign',
  'textColumns',
  'textDecoration',
  'textTransform',
  'writingMode',
] as const satisfies readonly TypographySupportKey[];

export type SpacingSupportKey = 'blockGap' | 'margin' | 'padding';

export const SPACING_SUPPORT_KEYS = [
  'blockGap',
  'margin',
  'padding',
] as const satisfies readonly SpacingSupportKey[];
