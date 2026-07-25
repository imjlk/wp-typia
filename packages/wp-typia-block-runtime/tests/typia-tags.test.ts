import { expect, test } from 'bun:test';
import type { tags as TypiaTags } from 'typia';

import type { tags as WpTypiaTags } from '../src/typia-tags.js';

function acceptLocalTags(
  value: string &
    WpTypiaTags.Source<'html'> &
    WpTypiaTags.Selector<'.content'>,
): string {
  return value;
}

function acceptAugmentedTypiaTags(
  value: string &
    TypiaTags.Source<'html'> &
    TypiaTags.Selector<'.content'>,
): string {
  return value;
}

test('keeps local and augmented Typia tag APIs compatible', () => {
  const value = 'content' as string &
    WpTypiaTags.Source<'html'> &
    WpTypiaTags.Selector<'.content'>;

  expect(acceptLocalTags(value)).toBe('content');
  expect(acceptAugmentedTypiaTags(value)).toBe('content');
});
