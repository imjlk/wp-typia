export const INTERACTIVITY_EDIT_TEMPLATE = `import type { BlockEditProps } from '@wp-typia/block-types/blocks/registration';
import { __ } from '@wordpress/i18n';
import { useBlockProps, InspectorControls, RichText, BlockControls, AlignmentToolbar } from '@wordpress/block-editor';
import { PanelBody, RangeControl, Button, Notice } from '@wordpress/components';
import { useState } from '@wordpress/element';
import currentManifest from './manifest-document';
import { {{slugCamelCase}}Store } from './interactivity-store';
import {
  InspectorFromManifest,
  useEditorFields,
  useTypedAttributeUpdater,
} from '@wp-typia/block-runtime/inspector';
import type { {{pascalCase}}Attributes } from './types';
import {
  sanitize{{pascalCase}}Attributes,
  validate{{pascalCase}}Attributes,
} from './validators';
import { useTypiaValidation } from './hooks';

type EditProps = BlockEditProps<{{pascalCase}}Attributes>;

const actionButtonRowStyle = { display: 'flex', gap: '8px', marginTop: '16px' };
const validationListStyle = { margin: 0, paddingLeft: '1em' };

export default function Edit({ attributes, setAttributes, isSelected }: EditProps) {
  const [isPreviewing, setIsPreviewing] = useState(false);
  const editorFields = useEditorFields(currentManifest, {
    manual: ['content', 'clickCount', 'maxClicks'],
    labels: {
      alignment: __('Alignment', '{{textDomain}}'),
      animation: __('Animation', '{{textDomain}}'),
      interactiveMode: __('Interactive Mode', '{{textDomain}}'),
      isVisible: __('Visible', '{{textDomain}}'),
      showCounter: __('Show Counter', '{{textDomain}}'),
    },
  });
  const { errorMessages, isValid } = useTypiaValidation(
    attributes,
    validate{{pascalCase}}Attributes,
  );
  const validateEditorUpdate = (nextAttributes: {{pascalCase}}Attributes) => {
    try {
      return {
        data: sanitize{{pascalCase}}Attributes(nextAttributes),
        errors: [],
        isValid: true as const,
      };
    } catch {
      return validate{{pascalCase}}Attributes(nextAttributes);
    }
  };
  const { updateField } = useTypedAttributeUpdater(
    attributes,
    setAttributes,
    validateEditorUpdate
  );
  const alignmentValue = editorFields.getStringValue(
    attributes,
    'alignment',
    'left'
  ) as NonNullable<{{pascalCase}}Attributes['alignment']>;
  const clickCount = attributes.clickCount ?? 0;
  const isVisible = editorFields.getBooleanValue(
    attributes,
    'isVisible',
    true
  );
  const isAnimating = attributes.isAnimating ?? false;
  const maxClicks = attributes.maxClicks ?? 0;
  const showCounter = editorFields.getBooleanValue(
    attributes,
    'showCounter',
    true
  );
  const interactiveMode = editorFields.getStringValue(
    attributes,
    'interactiveMode',
    'click'
  ) as NonNullable<{{pascalCase}}Attributes['interactiveMode']>;
  const animation = editorFields.getStringValue(
    attributes,
    'animation',
    'none'
  ) as NonNullable<{{pascalCase}}Attributes['animation']>;

  const blockProps = useBlockProps({
    className: \`{{cssClassName}} {{cssClassName}}--\${interactiveMode}\`,
    'data-wp-interactive': {{slugCamelCase}}Store.directive.interactive,
    'data-wp-context': JSON.stringify(
      {{slugCamelCase}}Store.createContext({
        clicks: clickCount,
        isAnimating,
        isVisible,
        animation,
        maxClicks,
      })
    )
  });
  const previewContentStyle = { textAlign: alignmentValue };
  const progressBarStyle = { width: \`\${(clickCount / maxClicks) * 100}%\` };
  const clicksDirective = {{slugCamelCase}}Store.directive.state('clicks');
  const isAnimatingDirective = {{slugCamelCase}}Store.directive.state('isAnimating');
  const progressDirective = {{slugCamelCase}}Store.directive.state('progress') + " + '%'";

  const resetCounter = () => {
    updateField('clickCount', 0);
    updateField('isAnimating', false);
  };

  const testAnimation = () => {
    updateField('isAnimating', true);
    setTimeout(() => {
      updateField('isAnimating', false);
    }, 1000);
  };

  return (
    <>
      <BlockControls>
        <AlignmentToolbar
          value={alignmentValue}
          onChange={(value) => updateField('alignment', (value || alignmentValue) as NonNullable<{{pascalCase}}Attributes['alignment']>)}
        />
      </BlockControls>

      <InspectorControls>
        <InspectorFromManifest
          attributes={attributes}
          fieldLookup={editorFields}
          onChange={updateField}
          paths={['alignment', 'interactiveMode', 'animation', 'showCounter', 'isVisible']}
          title={__('Interactive Settings', '{{textDomain}}')}
        />

        <PanelBody title={__('Counter Settings', '{{textDomain}}')}>
          <RangeControl
            label={__('Max Clicks', '{{textDomain}}')}
            value={maxClicks}
            onChange={(value) => updateField('maxClicks', value ?? maxClicks)}
            min={0}
            max={100}
            help={__('Set to 0 for unlimited clicks', '{{textDomain}}')}
          />

          <div style={actionButtonRowStyle}>
            <Button
              variant="secondary"
              onClick={resetCounter}
              isSmall
            >
              {__('Reset Counter', '{{textDomain}}')}
            </Button>
            <Button
              variant="secondary"
              onClick={testAnimation}
              isSmall
            >
              {__('Test Animation', '{{textDomain}}')}
            </Button>
          </div>
        </PanelBody>

        {!isValid && (
          <PanelBody title={__('Validation Errors', '{{textDomain}}')} initialOpen>
            {errorMessages.map((error, index) => (
              <Notice key={index} status="error" isDismissible={false}>
                {error}
              </Notice>
            ))}
          </PanelBody>
        )}

        {isSelected && (
          <PanelBody title={__('Preview', '{{textDomain}}')}>
            <Button
              variant={isPreviewing ? 'primary' : 'secondary'}
              onClick={() => setIsPreviewing(!isPreviewing)}
              aria-pressed={isPreviewing}
              isSmall
            >
              {isPreviewing
                ? __('Disable Preview Mode', '{{textDomain}}')
                : __('Enable Preview Mode', '{{textDomain}}')}
            </Button>

            {clickCount > 0 && (
              <Notice status="info" isDismissible={false}>
                {__('Current clicks:', '{{textDomain}}')} {clickCount}
                {maxClicks > 0 && \` / \${maxClicks}\`}
              </Notice>
            )}
          </PanelBody>
        )}
      </InspectorControls>

      <div {...blockProps}>
        <div
          className={\`{{cssClassName}}__content \${isAnimating ? 'is-animating' : ''}\`}
          style={previewContentStyle}
          data-wp-on--click={isPreviewing ? {{slugCamelCase}}Store.directive.action('handleClick') : undefined}
          data-wp-on--mouseenter={isPreviewing && interactiveMode === 'hover' ? {{slugCamelCase}}Store.directive.action('handleMouseEnter') : undefined}
          data-wp-on--mouseleave={isPreviewing && interactiveMode === 'hover' ? {{slugCamelCase}}Store.directive.action('handleMouseLeave') : undefined}
        >
          <RichText
            tagName="p"
            value={attributes.content}
            onChange={(value) => updateField('content', value)}
            placeholder={__( {{titleJson}} + ' – click me to interact!', '{{textDomain}}')}
          />

          {!isValid && (
            <Notice status="error" isDismissible={false}>
              <p>
                <strong>{__('Validation Errors', '{{textDomain}}')}</strong>
              </p>
              <ul style={validationListStyle}>
                {errorMessages.map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
              </ul>
            </Notice>
          )}

          {showCounter && (
            <div className="{{cssClassName}}__counter">
              <span className="{{cssClassName}}__counter-label">
                {__('Clicks:', '{{textDomain}}')}
              </span>
              <span
                className="{{cssClassName}}__counter-value"
                data-wp-text={clicksDirective}
              >
                {clickCount}
              </span>
            </div>
          )}

          {maxClicks > 0 && (
            <div className="{{cssClassName}}__progress">
              <div
                className="{{cssClassName}}__progress-bar"
                style={progressBarStyle}
                data-wp-style--width={progressDirective}
              />
            </div>
          )}

          {animation !== 'none' && (
            <div
              className={\`{{cssClassName}}__animation \${isAnimating ? 'is-active' : ''}\`}
              data-wp-class--is-active={isAnimatingDirective}
            >
              {animation}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
`;

export const INTERACTIVITY_SAVE_TEMPLATE = `import { useBlockProps, RichText } from '@wordpress/block-editor';
import { __ } from '@wordpress/i18n';
import { {{slugCamelCase}}Store } from './interactivity-store';
import type { {{pascalCase}}Attributes } from './types';

export default function Save({ attributes }: { attributes: {{pascalCase}}Attributes }) {
  const clickCount = attributes.clickCount ?? 0;
  const interactiveMode = attributes.interactiveMode ?? 'click';
  const animation = attributes.animation ?? 'none';
  const isAnimating = attributes.isAnimating ?? false;
  const isVisible = attributes.isVisible ?? true;
  const maxClicks = attributes.maxClicks ?? 0;
  const showCounter = attributes.showCounter ?? true;
  const contentStyle = { textAlign: attributes.alignment };
  const clickActionDirective = {{slugCamelCase}}Store.directive.action('handleClick');
  const visibilityHiddenDirective = {{slugCamelCase}}Store.directive.negate(
    {{slugCamelCase}}Store.directive.state('isVisible')
  );
  const clicksDirective = {{slugCamelCase}}Store.directive.state('clicks');
  const clampedClicksDirective = {{slugCamelCase}}Store.directive.state('clampedClicks');
  const isAnimatingDirective = {{slugCamelCase}}Store.directive.state('isAnimating');
  const completionHiddenDirective = {{slugCamelCase}}Store.directive.negate(
    {{slugCamelCase}}Store.directive.state('isComplete')
  );
  const resetActionDirective = {{slugCamelCase}}Store.directive.action('reset');
  const blockProps = useBlockProps.save({
    className: \`{{cssClassName}} {{cssClassName}}--\${interactiveMode}\`,
    'data-wp-interactive': {{slugCamelCase}}Store.directive.interactive,
    'data-wp-context': JSON.stringify(
      {{slugCamelCase}}Store.createContext({
        clicks: clickCount,
        isAnimating,
        isVisible,
        animation,
        maxClicks,
      })
    )
  });
  const progressDirective = {{slugCamelCase}}Store.directive.state('progress') + " + '%'";

  return (
    <div {...blockProps}>
      <div
        className={\`{{cssClassName}}__content \${isAnimating ? 'is-animating' : ''}\`}
        style={contentStyle}
        data-wp-on--click={clickActionDirective}
        data-wp-on--mouseenter={interactiveMode === 'hover' ? {{slugCamelCase}}Store.directive.action('handleMouseEnter') : undefined}
        data-wp-on--mouseleave={interactiveMode === 'hover' ? {{slugCamelCase}}Store.directive.action('handleMouseLeave') : undefined}
        data-wp-bind--hidden={visibilityHiddenDirective}
      >
        <RichText.Content
          tagName="p"
          value={attributes.content}
          className="{{cssClassName}}__text"
        />

        {showCounter && (
          <div
            className="{{cssClassName}}__counter"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            <span className="{{cssClassName}}__counter-label">
              { __( 'Clicks:', '{{textDomain}}' ) }
            </span>
            <span
              className="{{cssClassName}}__counter-value"
              data-wp-text={clicksDirective}
            >
              {clickCount}
            </span>
          </div>
        )}

        {maxClicks > 0 && (
          <div className="{{cssClassName}}__progress">
            <div
              className="{{cssClassName}}__progress-bar"
              role="progressbar"
              aria-label={ __( 'Click progress', '{{textDomain}}' ) }
              aria-valuemin={0}
              aria-valuemax={maxClicks}
              aria-valuenow={Math.min(clickCount, maxClicks)}
              data-wp-bind--aria-valuenow={clampedClicksDirective}
              data-wp-style--width={progressDirective}
            />
          </div>
        )}

        <div
          className={\`{{cssClassName}}__animation \${animation}\`}
          aria-hidden="true"
          data-wp-class--is-active={isAnimatingDirective}
        />

        {maxClicks > 0 && (
          <div
            className="{{cssClassName}}__completion"
            role="status"
            aria-live="polite"
            aria-atomic="true"
            data-wp-bind--hidden={completionHiddenDirective}
          >
            { __( '🎉 Complete!', '{{textDomain}}' ) }
          </div>
        )}

        <button
          className="{{cssClassName}}__reset"
          data-wp-on--click={resetActionDirective}
          aria-label={ __( 'Reset counter', '{{textDomain}}' ) }
        >
          <span aria-hidden="true">↻</span>
          <span className="screen-reader-text">
            { __( 'Reset counter', '{{textDomain}}' ) }
          </span>
        </button>
      </div>
    </div>
  );
}
`;

export const INTERACTIVITY_INDEX_TEMPLATE = `import {
  registerScaffoldBlockType,
  type BlockConfiguration,
} from '@wp-typia/block-types/blocks/registration';
import type { BlockSupports } from '@wp-typia/block-types/blocks/supports';
import {
  buildScaffoldBlockRegistration,
  parseScaffoldBlockMetadata,
} from '@wp-typia/block-runtime/blocks';

import Edit from './edit';
import Save from './save';
import metadata from './block-metadata';
import './editor.scss';
import './style.scss';

import type { {{pascalCase}}Attributes } from './types';

const scaffoldSupports = {
  html: false,
  align: true,
  anchor: true,
  className: true,
  interactivity: true,
} satisfies BlockSupports;

const registration = buildScaffoldBlockRegistration(
  parseScaffoldBlockMetadata<BlockConfiguration<{{pascalCase}}Attributes>>(metadata),
  {
    supports: scaffoldSupports,
    edit: Edit,
    save: Save,
  }
);

registerScaffoldBlockType(registration.name, registration.settings);
`;

export const INTERACTIVITY_STORE_TEMPLATE = `import type {
  {{pascalCase}}Context,
  {{pascalCase}}State,
} from './types';

type InteractivityActionShape = object;
type InteractivityCallbackShape = object;
type InteractivityContextShape = object;
type InteractivityStateShape = object;
type InteractivityCallable =
  | ((...args: unknown[]) => unknown)
  | ReturnType<typeof import('@wordpress/interactivity').withSyncEvent>;
type InteractivityKey<T extends object> = Extract<keyof T, string>;
type InteractivityMethodKey<T extends object> = {
  [Key in InteractivityKey<T>]: T[Key] extends InteractivityCallable ? Key : never;
}[InteractivityKey<T>];

type InteractivityDirectivePath<
  Root extends string,
  Key extends string,
> = \`\${Root}.\${Key}\`;

type NegatedInteractivityDirectivePath<Path extends string> = \`!\${Path}\`;

export interface TypedInteractivityDirectiveHelpers<
  State extends InteractivityStateShape,
  Context extends InteractivityContextShape,
  Actions extends InteractivityActionShape,
  Callbacks extends InteractivityCallbackShape,
  Namespace extends string,
> {
  readonly interactive: Namespace;
  action<Key extends InteractivityMethodKey<Actions>>(
    key: Key,
  ): InteractivityDirectivePath<'actions', Key>;
  callback<Key extends InteractivityMethodKey<Callbacks>>(
    key: Key,
  ): InteractivityDirectivePath<'callbacks', Key>;
  state<Key extends InteractivityKey<State>>(
    key: Key,
  ): InteractivityDirectivePath<'state', Key>;
  context<Key extends InteractivityKey<Context>>(
    key: Key,
  ): InteractivityDirectivePath<'context', Key>;
  negate<Path extends string>(
    path: Path,
  ): NegatedInteractivityDirectivePath<Path>;
}

export interface TypedInteractivityStore<
  Namespace extends string,
  State extends InteractivityStateShape,
  Context extends InteractivityContextShape,
  Actions extends InteractivityActionShape,
  Callbacks extends InteractivityCallbackShape,
> {
  readonly namespace: Namespace;
  readonly state: State;
  readonly context: Context;
  readonly actions: Actions;
  readonly callbacks: Callbacks;
  readonly directive: TypedInteractivityDirectiveHelpers<
    State,
    Context,
    Actions,
    Callbacks,
    Namespace
  >;
  createContext(value: Context): Context;
}

export function defineInteractivityStore<
  Namespace extends string,
  State extends InteractivityStateShape,
  Context extends InteractivityContextShape,
  Actions extends InteractivityActionShape,
  Callbacks extends InteractivityCallbackShape,
>(config: {
  readonly namespace: Namespace;
  readonly state: State;
  readonly context: Context;
  readonly actions: Actions;
  readonly callbacks: Callbacks;
}): TypedInteractivityStore<Namespace, State, Context, Actions, Callbacks> {
  return {
    namespace: config.namespace,
    state: config.state,
    context: config.context,
    actions: config.actions,
    callbacks: config.callbacks,
    directive: {
      interactive: config.namespace,
      action<Key extends InteractivityMethodKey<Actions>>(key: Key) {
        return \`actions.\${key}\` as InteractivityDirectivePath<'actions', Key>;
      },
      callback<Key extends InteractivityMethodKey<Callbacks>>(key: Key) {
        return \`callbacks.\${key}\` as InteractivityDirectivePath<'callbacks', Key>;
      },
      state<Key extends InteractivityKey<State>>(key: Key) {
        return \`state.\${key}\` as InteractivityDirectivePath<'state', Key>;
      },
      context<Key extends InteractivityKey<Context>>(key: Key) {
        return \`context.\${key}\` as InteractivityDirectivePath<'context', Key>;
      },
      negate<Path extends string>(path: Path) {
        return \`!\${path}\` as NegatedInteractivityDirectivePath<Path>;
      },
    },
    createContext(value) {
      return value;
    },
  };
}

type InteractivityActionHandler = InteractivityCallable;

export interface {{pascalCase}}StoreActions {
  handleClick: InteractivityActionHandler;
  handleMouseEnter: InteractivityActionHandler;
  handleMouseLeave: InteractivityActionHandler;
  reset: InteractivityActionHandler;
}

export interface {{pascalCase}}StoreCallbacks {}

export const {{slugCamelCase}}Store = defineInteractivityStore({
  namespace: '{{slugKebabCase}}',
  state: {} as {{pascalCase}}State,
  context: {} as {{pascalCase}}Context,
  actions: {} as {{pascalCase}}StoreActions,
  callbacks: {} as {{pascalCase}}StoreCallbacks,
});
`;

export const INTERACTIVITY_SCRIPT_TEMPLATE = `/**
 * WordPress Interactivity API implementation for {{title}} block
 */
import { store, getContext, getElement, withSyncEvent } from '@wordpress/interactivity';
import {
  {{slugCamelCase}}Store,
  type {{pascalCase}}StoreActions,
} from './interactivity-store';
import type { {{pascalCase}}Context, {{pascalCase}}State } from './types';

function getBlockContext() {
  return getContext<{{pascalCase}}Context>();
}

const actions: {{pascalCase}}StoreActions = {
  // Handle block click
  handleClick: () => {
    const context = getBlockContext();
    const { ref } = getElement();

    if (!ref) {
      return;
    }

    if (context.maxClicks > 0 && context.clicks >= context.maxClicks) {
      return;
    }

    const previousClicks = context.clicks;

    // Increment click counter
    context.clicks += 1;

    // Trigger animation
    if (context.animation !== 'none') {
      context.isAnimating = true;
      setTimeout(() => {
        context.isAnimating = false;
      }, 1000);
    }

    // Emit custom event
    ref.dispatchEvent(new CustomEvent('{{slugKebabCase}}:click', {
      detail: { clicks: context.clicks }
    }));

    // Check if max clicks reached
    if (context.maxClicks > 0 && previousClicks < context.maxClicks && context.clicks === context.maxClicks) {
      ref.dispatchEvent(new CustomEvent('{{slugKebabCase}}:complete', {
        detail: { totalClicks: context.clicks }
      }));
    }
  },

  // Handle hover events
  handleMouseEnter: () => {
    const context = getBlockContext();
    if (context.animation === 'none') return;
    context.isAnimating = true;
  },

  handleMouseLeave: () => {
    const context = getBlockContext();
    if (context.animation === 'none') return;
    context.isAnimating = false;
  },

  // Reset counter
  reset: withSyncEvent((event: Event) => {
    event.stopPropagation();
    const context = getBlockContext();
    context.clicks = 0;
    context.isAnimating = false;
  })
};

const state = {
    get clicks() {
      return getBlockContext().clicks;
    },
    get isAnimating() {
      return getBlockContext().isAnimating;
    },
    get isVisible() {
      return getBlockContext().isVisible;
    },
    get progress() {
      const context = getBlockContext();
      const clampedClicks =
        context.maxClicks > 0
          ? Math.min(context.clicks, context.maxClicks)
          : context.clicks;
      return context.maxClicks > 0 ? (clampedClicks / context.maxClicks) * 100 : 0;
    },
    get clampedClicks() {
      const context = getBlockContext();
      return context.maxClicks > 0
        ? Math.min(context.clicks, context.maxClicks)
        : context.clicks;
    },
    get isComplete() {
      const context = getBlockContext();
      return context.clicks >= context.maxClicks && context.maxClicks > 0;
    }
} satisfies {{pascalCase}}State;

// Store configuration
store({{slugCamelCase}}Store.namespace, {
  // State - reactive data that updates the UI
  state,
  actions,
  callbacks: {{slugCamelCase}}Store.callbacks,
});
`;

export const INTERACTIVITY_VALIDATORS_TEMPLATE = `import typia from 'typia';
import currentManifest from "./manifest-defaults-document";
import { {{pascalCase}}Attributes, {{pascalCase}}ValidationResult } from "./types";
import { createTemplateValidatorToolkit } from "./validator-toolkit";

const scaffoldValidators = createTemplateValidatorToolkit<{{pascalCase}}Attributes>({
  assert: typia.createAssert<{{pascalCase}}Attributes>(),
  clone: typia.misc.createClone<{{pascalCase}}Attributes>() as (
    value: {{pascalCase}}Attributes,
  ) => {{pascalCase}}Attributes,
  is: typia.createIs<{{pascalCase}}Attributes>(),
  manifest: currentManifest,
  prune: typia.misc.createPrune<{{pascalCase}}Attributes>(),
  random: typia.createRandom<{{pascalCase}}Attributes>() as (
    ...args: unknown[]
  ) => {{pascalCase}}Attributes,
  validate: typia.createValidate<{{pascalCase}}Attributes>(),
});

export const validate{{pascalCase}}Attributes =
  scaffoldValidators.validateAttributes as (
    attributes: unknown,
  ) => {{pascalCase}}ValidationResult;

export const validators = scaffoldValidators.validators;

export const sanitize{{pascalCase}}Attributes =
  scaffoldValidators.sanitizeAttributes as (
    attributes: Partial<{{pascalCase}}Attributes>,
  ) => {{pascalCase}}Attributes;

/**
 * Runtime type guard for checking if an object is {{pascalCase}}Attributes.
 */
export const is{{pascalCase}}Attributes = (obj: unknown): obj is {{pascalCase}}Attributes => {
  return validators.is(obj);
};

export const createAttributeUpdater = scaffoldValidators.createAttributeUpdater;
`;
