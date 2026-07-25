export type WpTypiaSecretValue = string;
export type WpTypiaPreserveOnEmptyValue = boolean;
export type WpTypiaSourceValue = 'html' | 'text' | 'rich-text';
export type WpTypiaSelectorValue = string;
export type WpTypiaWriteOnlyValue = true;

export type WpTypiaSecret<
  MaskedStateField extends WpTypiaSecretValue,
> = {
  readonly __wpTypiaSecret?: MaskedStateField;
};

export type WpTypiaPreserveOnEmpty<
  Value extends WpTypiaPreserveOnEmptyValue,
> = {
  readonly __wpTypiaPreserveOnEmpty?: Value;
};

export type WpTypiaSource<Value extends WpTypiaSourceValue> = {
  readonly __wpTypiaSource?: Value;
};

export type WpTypiaSelector<Value extends WpTypiaSelectorValue> = {
  readonly __wpTypiaSelector?: Value;
};

export type WpTypiaWriteOnly<Value extends WpTypiaWriteOnlyValue> = {
  readonly __wpTypiaWriteOnly?: Value;
};
