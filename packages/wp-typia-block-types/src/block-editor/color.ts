/**
 * Practical CSS color vocabulary used by block editor controls and theme.json values.
 *
 * This is primarily a type-level DX helper today. Typia metadata generation does
 * not yet consume template literal aliases like `#${string}` or `rgb(${string})`
 * when they are imported into `types.ts`.
 */
export type CssColorValue =
	| `#${string}`
	| `rgb(${string})`
	| `rgba(${string})`
	| `hsl(${string})`
	| `hsla(${string})`
	| `var(${string})`
	| `color-mix(${string})`
	| 'transparent'
	| 'currentColor';

/**
 * Pipeline-compatible named-color subset for use in `types.ts`.
 *
 * Prefer this alias when the value needs to flow through `sync-types`,
 * `typia.manifest.json`, and the generated PHP validator unchanged.
 */
export type CssNamedColor =
	| 'transparent'
	| 'currentColor'
	| 'inherit'
	| 'initial'
	| 'unset';

export const CSS_NAMED_COLORS = [
  'transparent',
  'currentColor',
  'inherit',
  'initial',
  'unset',
] as const satisfies readonly CssNamedColor[];

/**
 * Derived from Gutenberg duotone preset structures.
 */
export interface DuotonePalette {
  colors: readonly [CssColorValue, CssColorValue];
  name?: string;
  slug?: string;
}
