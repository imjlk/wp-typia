import type { TextAlignment } from '@wp-typia/block-types/block-editor/alignment';
import type { CssNamedColor } from '@wp-typia/block-types/block-editor/color';
import type { AspectRatio } from '@wp-typia/block-types/block-editor/dimensions';
import type {
  BlockColorSupportAttributes,
  BlockTypographySupportAttributes,
} from '@wp-typia/block-types/block-editor/style-attributes';
import { tags } from 'typia';

type ShowcaseFontSize = 'small' | 'medium' | 'large' | 'xlarge';

/**
 * My Typia Block block attributes with Typia validation
 */
export interface MyTypiaBlockAttributes {
	/**
	 * Unique identifier
	 */
  id?: string & tags.Format< 'uuid' >;

	/**
	 * Block version for migrations
	 */
  version?: number & tags.Type< 'uint32' > & tags.Default< 1 >;

	/**
	 * Custom CSS class
	 */
  className?: string & tags.MaxLength< 100 >;

	/**
	 * Main content
	 */
  content: string &
		tags.MinLength< 0 > &
		tags.MaxLength< 1000 > &
		tags.Default< '' >;

	/**
	 * Text alignment
	 */
  alignment?: TextAlignment & tags.Default< 'left' >;

	/**
	 * Is the block visible
	 */
  isVisible?: boolean & tags.Default< true >;

	/**
	 * Showcase-only richer typography controls.
	 */
  fontSize?: BlockTypographySupportAttributes[ 'fontSize' ] &
		ShowcaseFontSize &
		tags.Default< 'medium' >;

	/**
	 * Pipeline-compatible semantic color values from @wp-typia/block-types.
	 */
  textColor?: BlockColorSupportAttributes[ 'textColor' ] &
		CssNamedColor &
		tags.Default< 'currentColor' >;

  backgroundColor?: BlockColorSupportAttributes[ 'backgroundColor' ] &
		CssNamedColor &
		tags.Default< 'transparent' >;

  aspectRatio?: AspectRatio & tags.Default< '16/9' >;

  padding?: {
    top: number & tags.Minimum< 0 > & tags.Default< 0 >;
    right: number & tags.Minimum< 0 > & tags.Default< 0 >;
    bottom: number & tags.Minimum< 0 > & tags.Default< 0 >;
    left: number & tags.Minimum< 0 > & tags.Default< 0 >;
  };

  borderRadius?: number & tags.Minimum< 0 > & tags.Default< 0 >;

  animation?: ( 'none' | 'fadeIn' | 'bounce' ) & tags.Default< 'none' >;

  linkTarget?:
		| {
				kind: 'url';
				href: string & tags.Format< 'uri' >;
		  }
		| {
				kind: 'post';
				postId: number & tags.Type< 'uint32' >;
		  };
}

/**
 * My Typia Block interactivity state
 */
export interface MyTypiaBlockState {
  count: number;
  isActive: boolean;
  isHydrated: boolean;
  isVisible: boolean;
  isLoading: boolean;
  isSaving?: boolean;
  error?: string;
}
