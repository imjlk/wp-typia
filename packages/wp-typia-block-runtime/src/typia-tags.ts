/**
 * Exposes wp-typia metadata tags alongside Typia's built-in tags for the
 * block attribute and REST contract projection pipeline.
 *
 * Generated projects can import `tags` from this module when they need
 * wp-typia-only tags such as `Secret`, `Source`, or `Selector`.
 */
import './typia-tags-augmentation.js';
import type { tags as TypiaTags } from 'typia';
import type {
  WpTypiaPreserveOnEmpty,
  WpTypiaPreserveOnEmptyValue,
  WpTypiaSecret,
  WpTypiaSecretValue,
  WpTypiaSelector,
  WpTypiaSelectorValue,
  WpTypiaSource,
  WpTypiaSourceValue,
  WpTypiaWriteOnly,
  WpTypiaWriteOnlyValue,
} from './typia-tag-shapes.js';

export namespace tags {
  export type Default<Value extends boolean | bigint | number | string> =
    TypiaTags.Default<Value>;

  export type ExclusiveMaximum<Value extends bigint | number> =
    TypiaTags.ExclusiveMaximum<Value>;

  export type ExclusiveMinimum<Value extends bigint | number> =
    TypiaTags.ExclusiveMinimum<Value>;

  export type Format<Value extends TypiaTags.Format.Value> =
    TypiaTags.Format<Value>;

  export type MaxItems<Value extends number> = TypiaTags.MaxItems<Value>;

  export type MaxLength<Value extends number> = TypiaTags.MaxLength<Value>;

  export type Maximum<Value extends bigint | number> =
    TypiaTags.Maximum<Value>;

  export type MinItems<Value extends number> = TypiaTags.MinItems<Value>;

  export type MinLength<Value extends number> = TypiaTags.MinLength<Value>;

  export type Minimum<Value extends bigint | number> =
    TypiaTags.Minimum<Value>;

  export type MultipleOf<Value extends bigint | number> =
    TypiaTags.MultipleOf<Value>;

  export type Pattern<Value extends string> = TypiaTags.Pattern<Value>;

  export type Type<
    Value extends
      | 'int32'
      | 'uint32'
      | 'int64'
      | 'uint64'
      | 'float'
      | 'double',
  > = TypiaTags.Type<Value>;

  export type Secret<MaskedStateField extends WpTypiaSecretValue> =
    WpTypiaSecret<MaskedStateField>;

  export type PreserveOnEmpty<Value extends WpTypiaPreserveOnEmptyValue> =
    WpTypiaPreserveOnEmpty<Value>;

  export type Source<Value extends WpTypiaSourceValue> = WpTypiaSource<Value>;

  export type Selector<Value extends WpTypiaSelectorValue> =
    WpTypiaSelector<Value>;

  export type WriteOnly<Value extends WpTypiaWriteOnlyValue> =
    WpTypiaWriteOnly<Value>;
}
