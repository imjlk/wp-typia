import { tags } from 'typia';

export interface CompoundPatternsItemAttributes {
  title: string &
		tags.MinLength< 1 > &
		tags.MaxLength< 80 > &
		tags.Default< 'Compound Patterns Item' >;
  body: string &
		tags.MinLength< 1 > &
		tags.MaxLength< 280 > &
		tags.Default< 'Add supporting details for this internal item.' >;
}
