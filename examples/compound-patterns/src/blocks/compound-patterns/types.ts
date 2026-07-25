import { tags } from 'typia';

export interface CompoundPatternsAttributes {
  heading: string &
		tags.MinLength< 1 > &
		tags.MaxLength< 80 > &
		tags.Default< 'Compound Patterns' >;
  intro?: string &
		tags.MinLength< 1 > &
		tags.MaxLength< 180 > &
		tags.Default< 'Add and reorder internal items inside this compound block.' >;
  showDividers?: boolean & tags.Default< true >;
}
