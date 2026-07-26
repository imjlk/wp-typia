---
title: 'Basic Block Tutorial: Building Your First Typia Block with `wp-typia`'
---

Welcome to the basic block tutorial for `wp-typia`. This hands-on guide walks through creating a fully functional, type-safe WordPress block with runtime validation. For clarity, this tutorial uses `wp-typia` with `npm`; if you choose a different package manager, swap the generated project commands accordingly.

## Prerequisites

- Node.js 24+ installed
- WordPress development environment
- Basic knowledge of TypeScript and React

## Step 1: Create Your Block

Let's start by creating a new block using the Basic template:

```bash
npx wp-typia my-typia-block --template basic --package-manager npm --yes --no-install
cd my-typia-block
npm install
```

## Step 2: Define Your Block Types

Open `src/types.ts` and define your block attributes:

```typescript
import { tags } from 'typia';

export interface MyTypiaBlockAttributes {
  /**
   * The main heading text
   */
  title: string &
    tags.MinLength<1> &
    tags.MaxLength<100> &
    tags.Default<'Hello World'>;

  /**
   * Subtitle text (optional)
   */
  subtitle?: string & tags.MaxLength<200> & tags.Default<''>;

  /**
   * Color theme
   */
  theme: ('light' | 'dark' | 'colorful') & tags.Default<'light'>;

  /**
   * Animation enabled
   */
  animate: boolean & tags.Default<true>;

  /**
   * Number of items to display
   */
  itemCount: number &
    tags.Type<'uint32'> &
    tags.Minimum<1> &
    tags.Maximum<10> &
    tags.Default<3>;
}
```

## Step 3: Generate block.json

Run the common sync script to regenerate the current type-derived artifacts, including `src/block.json`, `src/typia.manifest.json`, and `src/typia-validator.php`:

```bash
npm run sync
```

Check `src/block.json` - it should contain all your attributes with proper types and defaults.

Fresh scaffolds already include a starter `src/typia.manifest.json` so editor/runtime imports resolve before the first sync.

Use `npm run sync` for the common-case one-shot refresh before `npm run build`, `npm run typecheck`, or commit. The generated `dev` workflow watches `npm run sync-types` for you, `npm run start` still runs the same sync as a one-shot, and both `npm run build` and `npm run typecheck` verify that the checked-in artifacts are already current. `npm run sync-types` remains available for advanced/manual runs: it stays warn-only by default, `npm run sync-types -- --fail-on-lossy` fails only on lossy WordPress projection warnings, and `npm run sync-types -- --strict --report json` emits a CI-friendly JSON report while failing on every warning. This sync only generates metadata artifacts, not migration history.

## Step 4: Build the Edit Component

Modify `src/edit.tsx` to create your block editor:

```typescript
import { BlockEditProps } from '@wordpress/blocks';
import { useBlockProps, InspectorControls, RichText } from '@wordpress/block-editor';
import {
  PanelBody,
  ToggleControl,
  RangeControl,
  SelectControl
} from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { MyTypiaBlockAttributes } from './types';
import { createAttributeUpdater, validators } from './validators';

type EditProps = BlockEditProps<MyTypiaBlockAttributes>;

function Edit({ attributes, setAttributes }: EditProps) {
  const blockProps = useBlockProps();
  const updateAttribute = createAttributeUpdater(
    attributes,
    setAttributes,
    validators.validate
  );

  return (
    <>
      <InspectorControls>
        <PanelBody title={__('Block Settings', 'my-typia-block')}>
          <SelectControl
            label={__('Theme', 'my-typia-block')}
            value={attributes.theme}
            options={[
              { label: 'Light', value: 'light' },
              { label: 'Dark', value: 'dark' },
              { label: 'Colorful', value: 'colorful' },
            ]}
            onChange={(value) => updateAttribute('theme', value as any)}
          />

          <ToggleControl
            label={__('Enable Animation', 'my-typia-block')}
            checked={attributes.animate}
            onChange={(value) => updateAttribute('animate', value)}
          />

          <RangeControl
            label={__('Number of Items', 'my-typia-block')}
            value={attributes.itemCount}
            min={1}
            max={10}
            onChange={(value) => updateAttribute('itemCount', value || 1)}
          />
        </PanelBody>
      </InspectorControls>

      <div {...blockProps}>
        <div className={`my-typia-block theme-${attributes.theme}`}>
          <RichText
            tagName="h2"
            className="my-typia-block__title"
            value={attributes.title}
            onChange={(value) => updateAttribute('title', value)}
            placeholder={__('Add your title...', 'my-typia-block')}
          />
          <RichText
            tagName="p"
            className="my-typia-block__subtitle"
            value={attributes.subtitle || ''}
            onChange={(value) => updateAttribute('subtitle', value)}
            placeholder={__('Add an optional subtitle...', 'my-typia-block')}
          />
          <div className="my-typia-block__content">
            {Array.from({ length: attributes.itemCount }, (_, i) => (
              <div
                key={i}
                className={`my-typia-block__item ${
                  attributes.animate ? 'animate' : ''
                }`}
              >
                Item {i + 1}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

export default Edit;
```

## Step 5: Build the Save Component

Modify `src/save.tsx` for frontend rendering:

```typescript
import { RichText, useBlockProps } from '@wordpress/block-editor';
import { MyTypiaBlockAttributes } from './types';

interface SaveProps {
  attributes: MyTypiaBlockAttributes;
}

export default function Save({ attributes }: SaveProps) {
  const blockProps = useBlockProps.save();

  return (
    <div {...blockProps}>
      <div className={`my-typia-block theme-${attributes.theme}`}>
        <RichText.Content
          tagName="h2"
          className="my-typia-block__title"
          value={attributes.title}
        />
        {attributes.subtitle && (
          <RichText.Content
            tagName="p"
            className="my-typia-block__subtitle"
            value={attributes.subtitle}
          />
        )}
        <div className="my-typia-block__content">
          {Array.from({ length: attributes.itemCount }, (_, i) => (
            <div
              key={i}
              className={`my-typia-block__item ${
                attributes.animate ? 'animate' : ''
              }`}
            >
              Item {i + 1}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

## Step 6: Add Styles

Update `src/style.scss`:

```scss
.wp-block-my-typia-block {
  padding: 20px;
  border-radius: 8px;
  transition: all 0.3s ease;

  &.theme-light {
    background: #ffffff;
    color: #333333;
    border: 1px solid #e0e0e0;
  }

  &.theme-dark {
    background: #1a1a1a;
    color: #ffffff;
    border: 1px solid #333333;
  }

  &.theme-colorful {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: #ffffff;
    border: none;
  }

  &__title {
    margin: 0 0 10px 0;
    font-size: 2em;
    font-weight: bold;
  }

  &__subtitle {
    margin: 0 0 20px 0;
    opacity: 0.8;
  }

  &__content {
    display: grid;
    gap: 10px;
  }

  &__item {
    padding: 15px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 4px;

    &.animate {
      animation: fadeIn 0.5s ease forwards;
      opacity: 0;

      @for $i from 1 through 10 {
        &:nth-child(#{$i}) {
          animation-delay: #{$i * 0.1}s;
        }
      }
    }
  }
}

@keyframes fadeIn {
  to {
    opacity: 1;
    transform: translateY(0);
  }
  from {
    opacity: 0;
    transform: translateY(10px);
  }
}
```

## Step 7: Test Your Block

1. Start development:

   ```bash
   npm run dev
   ```

2. Go to WordPress admin and create a new post

3. Add your block and test:
   - Try entering an invalid title (too long or empty)
   - Change settings in the inspector
   - Verify the block saves and loads correctly

## Step 8: Add a Validator Test

The basic template does not scaffold a dedicated unit test runner, so we'll use Node.js' built-in test runner together with `ttsx`. This works on the supported Node.js 24+ baseline.

Create `src/validators.test.ts`:

```typescript
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { validators } from './validators';
import { MyTypiaBlockAttributes } from './types';

describe('MyTypiaBlock validators', () => {
  test('accepts valid attributes', () => {
    const validAttrs: MyTypiaBlockAttributes = {
      title: 'Test Title',
      subtitle: 'Test Subtitle',
      theme: 'dark',
      animate: true,
      itemCount: 5,
    };

    const result = validators.validate(validAttrs);
    assert.equal(result.isValid, true);
  });

  test('rejects invalid title length', () => {
    const invalidAttrs = {
      title: '',
      theme: 'light',
      animate: false,
      itemCount: 1,
    };

    const result = validators.validate(invalidAttrs as any);
    assert.equal(result.isValid, false);
  });
});
```

Run it with:

```bash
ttsx src/validators.test.ts
```

## Step 9: Build for Production

Once the editor flow looks good, create a production build:

```bash
npm run build
```

This regenerates `src/block.json` from your types and outputs the compiled assets in `build/`.

## What's Next?

Congratulations! You've built a type-safe WordPress block with runtime validation. Here's what you can explore next:

1. **Add Interactivity API**: Switch to the Interactivity template for frontend state
2. **Add Persistence**: Follow the [Persistence Block Tutorial](./persistence-block-tutorial.md) to add server-side data storage
3. **Add Compound Parent/Child Blocks**: Follow the [Compound Block Tutorial](./compound-block-tutorial.md) to scaffold a top-level container block with hidden internal children
4. **Add Migrations**: Use the showcase patterns from the `wp-typia` repository's `examples/my-typia-block` example if the block later needs snapshot-based legacy compatibility
5. **Custom Validators**: Create custom validation logic
6. **Block Variations**: Add multiple block variations
7. **Nested Blocks**: Support inner blocks

## Additional Resources

- [Typia Documentation](https://typia.io/)
- [WordPress Block Editor Handbook](https://developer.wordpress.org/block-editor/)
- [Persistence Block Tutorial](./persistence-block-tutorial.md) - Add server-side data storage
- [Compound Block Tutorial](./compound-block-tutorial.md) - Scaffold parent/child InnerBlocks patterns
- [Snapshot Migration Guide](../guides/migrations.md)
- [Interactivity Template Guide](../guides/interactivity.md)
- [Interactivity API Guide](https://developer.wordpress.org/block-editor/reference-guides/interactivity-api/)

---

Happy coding! 🚀
