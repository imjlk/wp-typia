/**
 * Adds wp-typia metadata tags to Typia's public `tags` namespace.
 *
 * Keep this augmentation separate from the local `tags` facade so TypeScript
 * does not merge the facade declaration back into the imported namespace.
 */
import type {} from 'typia';
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

declare module 'typia' {
  export namespace tags {
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
}
