export const COMPOUND_PERSISTENCE_PARENT_EDIT_TEMPLATE = `import type { BlockEditProps } from '@wp-typia/block-types/blocks/registration';
import { __ } from '@wordpress/i18n';
import {
  InspectorControls,
  InnerBlocks,
  RichText,
  store as blockEditorStore,
  useBlockProps,
} from '@wordpress/block-editor';
import {
  Notice,
  PanelBody,
  TextControl,
  ToggleControl,
} from '@wordpress/components';
import { useSelect } from '@wordpress/data';

import {
  type PersistentBlockIdentityNode,
  usePersistentBlockIdentity,
} from '@wp-typia/block-runtime/inspector';
import { getRootInnerBlocksPropsOptions } from './children';
import { useTypiaValidation } from './hooks';
import type { {{pascalCase}}Attributes } from './types';
import {
  createAttributeUpdater,
  validate{{pascalCase}}Attributes,
} from './validators';

type EditProps = BlockEditProps<{{pascalCase}}Attributes>;
type CompoundInnerBlocksProps = Parameters<typeof InnerBlocks>[0] & {
  defaultBlock?: [string, Record<string, unknown>];
  directInsert?: boolean;
};

const TypedInnerBlocks = InnerBlocks as unknown as (
  props: CompoundInnerBlocksProps,
) => ReturnType<typeof InnerBlocks>;

export default function Edit({
  attributes,
  clientId,
  setAttributes,
}: EditProps) {
  const blocks = useSelect(
    (select) =>
      (
        select(blockEditorStore) as {
          getBlocks: () => readonly PersistentBlockIdentityNode[];
        }
      ).getBlocks(),
    [],
  );
  usePersistentBlockIdentity({
    attributeName: 'resourceKey',
    attributes,
    blockName: '{{namespace}}/{{slugKebabCase}}',
    blocks,
    clientId,
    prefix: '{{resourceKeyPrefix}}',
    setAttributes,
  });
  const { errorMessages, isValid } = useTypiaValidation(
    attributes,
    validate{{pascalCase}}Attributes,
  );
  const updateAttribute = createAttributeUpdater(attributes, setAttributes);
  const blockProps = useBlockProps({
    className: '{{cssClassName}}',
  });
  const rootInnerBlocksPropsOptions = getRootInnerBlocksPropsOptions();

  return (
    <>
      <InspectorControls>
        <PanelBody title={__('Compound Settings', '{{textDomain}}')}>
          <ToggleControl
            label={__('Show dividers between items', '{{textDomain}}')}
            checked={attributes.showDividers ?? true}
            onChange={(value) => updateAttribute('showDividers', value)}
          />
          <ToggleControl
            label={__('Show persisted count', '{{textDomain}}')}
            checked={attributes.showCount ?? true}
            onChange={(value) => updateAttribute('showCount', value)}
          />
          <TextControl
            label={__('Button label', '{{textDomain}}')}
            value={attributes.buttonLabel ?? 'Persist Count'}
            onChange={(buttonLabel) =>
              updateAttribute('buttonLabel', buttonLabel)
            }
          />
          <TextControl
            label={__('Resource key', '{{textDomain}}')}
            value={attributes.resourceKey ?? ''}
            onChange={(resourceKey) =>
              updateAttribute('resourceKey', resourceKey)
            }
            help={__(
              'Stable key used by the persisted counter endpoint.',
              '{{textDomain}}',
            )}
          />
          <Notice status="info" isDismissible={false}>
            {__(
              'Storage mode: {{dataStorageMode}}',
              '{{textDomain}}',
            )}
          </Notice>
          <Notice status="info" isDismissible={false}>
            {__(
              'Persistence policy: {{persistencePolicy}}',
              '{{textDomain}}',
            )}
          </Notice>
        </PanelBody>
        {!isValid && (
          <PanelBody
            title={__('Validation Errors', '{{textDomain}}')}
            initialOpen
          >
            {errorMessages.map((error, index) => (
              <Notice key={index} status="error" isDismissible={false}>
                {error}
              </Notice>
            ))}
          </PanelBody>
        )}
      </InspectorControls>
      <div {...blockProps}>
        <RichText
          tagName="h3"
          className="{{cssClassName}}__heading"
          value={attributes.heading}
          onChange={(heading) => updateAttribute('heading', heading)}
          placeholder={__({{titleTsLiteral}}, '{{textDomain}}')}
        />
        <RichText
          tagName="p"
          className="{{cssClassName}}__intro"
          value={attributes.intro ?? ''}
          onChange={(intro) => updateAttribute('intro', intro)}
          placeholder={__(
            'Add and reorder internal items inside this compound block.',
            '{{textDomain}}',
          )}
        />
        {!isValid && (
          <Notice status="error" isDismissible={false}>
            <ul>
              {errorMessages.map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
          </Notice>
        )}
        <p className="{{cssClassName}}__meta">
          {__('Resource key:', '{{textDomain}}')}{' '}
          {attributes.resourceKey || '—'}
        </p>
        <div className="{{cssClassName}}__items">
          <TypedInnerBlocks {...rootInnerBlocksPropsOptions} />
        </div>
      </div>
    </>
  );
}
`;

export const COMPOUND_PERSISTENCE_PARENT_SAVE_TEMPLATE = `export default function Save() {
  return null;
}
`;

export const COMPOUND_PERSISTENCE_PARENT_VALIDATORS_TEMPLATE = `import typia from 'typia';
import currentManifest from './manifest-defaults-document';
{{validationTypesImport}}
import { generateResourceKey } from '@wp-typia/block-runtime/identifiers';
import { createTemplateValidatorToolkit } from '../../validator-toolkit';

const scaffoldValidators =
  createTemplateValidatorToolkit<{{pascalCase}}Attributes>({
    assert: typia.createAssert<{{pascalCase}}Attributes>(),
    clone: typia.plain.createClone<{{pascalCase}}Attributes>() as (
      value: {{pascalCase}}Attributes,
    ) => {{pascalCase}}Attributes,
    is: typia.createIs<{{pascalCase}}Attributes>(),
    manifest: currentManifest,
    prune: typia.plain.createPrune<{{pascalCase}}Attributes>(),
    random: typia.createRandom<{{pascalCase}}Attributes>() as (
      ...args: unknown[]
    ) => {{pascalCase}}Attributes,
    finalize: (normalized) => ({
      ...normalized,
      resourceKey:
        normalized.resourceKey && normalized.resourceKey.length > 0
          ? normalized.resourceKey
          : generateResourceKey('{{resourceKeyPrefix}}'),
    }),
    validate: typia.createValidate<{{pascalCase}}Attributes>(),
  });

export const validators = scaffoldValidators.validators;

export const validate{{pascalCase}}Attributes =
  scaffoldValidators.validateAttributes as (
    attributes: unknown,
  ) => {{pascalCase}}ValidationResult;

export const sanitize{{pascalCase}}Attributes =
  scaffoldValidators.sanitizeAttributes as (
    attributes: Partial<{{pascalCase}}Attributes>,
  ) => {{pascalCase}}Attributes;

export const createAttributeUpdater = scaffoldValidators.createAttributeUpdater;
`;

export const COMPOUND_PERSISTENCE_PARENT_INTERACTIVITY_TEMPLATE = `import { getContext, store } from '@wordpress/interactivity';
import { generatePublicWriteRequestId } from '@wp-typia/block-runtime/identifiers';

import { fetchBootstrap, fetchState, writeState } from './api';
import type {
  {{pascalCase}}ClientState,
  {{pascalCase}}Context,
  {{pascalCase}}State,
} from './types';

function hasExpiredPublicWriteToken(expiresAt?: number): boolean {
  return (
    typeof expiresAt === 'number' &&
    expiresAt > 0 &&
    Date.now() >= expiresAt * 1000
  );
}

function getWriteBlockedMessage(
  context: {{pascalCase}}Context,
): string {
  return context.persistencePolicy === 'authenticated'
    ? 'Sign in to persist this counter.'
    : 'Public writes are temporarily unavailable.';
}

const BOOTSTRAP_MAX_ATTEMPTS = 3;
const BOOTSTRAP_RETRY_DELAYS_MS = [250, 500];

async function waitForBootstrapRetry(delayMs: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

function getClientState(
  context: {{pascalCase}}Context,
): {{pascalCase}}ClientState {
  if (context.client) {
    return context.client;
  }

  context.client = {
    bootstrapError: '',
    writeExpiry: 0,
    writeNonce: '',
    writeToken: '',
  };

  return context.client;
}

function clearBootstrapError(
  context: {{pascalCase}}Context,
  clientState: {{pascalCase}}ClientState,
): void {
  if (context.error === clientState.bootstrapError) {
    context.error = '';
  }
  clientState.bootstrapError = '';
}

function setBootstrapError(
  context: {{pascalCase}}Context,
  clientState: {{pascalCase}}ClientState,
  message: string,
): void {
  clientState.bootstrapError = message;
  context.error = message;
}

const { actions, state } = store('{{slugKebabCase}}', {
  state: {
    isHydrated: false,
  } as {{pascalCase}}State,

  actions: {
    async loadState() {
      const context = getContext<{{pascalCase}}Context>();
      if (context.postId <= 0 || !context.resourceKey) {
        return;
      }

      context.isLoading = true;
      context.error = '';

      try {
        const result = await fetchState(
          {
            postId: context.postId,
            resourceKey: context.resourceKey,
          },
          {
            transportTarget: 'frontend',
          },
        );
        if (!result.isValid || !result.data) {
          context.error =
            result.errors[0]?.expected ?? 'Unable to load counter';
          return;
        }
        context.count = result.data.count;
      } catch (error) {
        context.error =
          error instanceof Error ? error.message : 'Unknown loading error';
      } finally {
        context.isLoading = false;
      }
    },
    async loadBootstrap() {
      const context = getContext<{{pascalCase}}Context>();
      const clientState = getClientState(context);
      if (context.postId <= 0 || !context.resourceKey) {
        context.bootstrapReady = true;
        context.canWrite = false;
        clientState.bootstrapError = '';
        clientState.writeExpiry = 0;
        clientState.writeNonce = '';
        clientState.writeToken = '';
        return;
      }

      context.isBootstrapping = true;

      let bootstrapSucceeded = false;
      let lastBootstrapError = 'Unable to initialize write access';
      const includePublicWriteCredentials = {{isPublicPersistencePolicy}};
      const includeRestNonce = {{isAuthenticatedPersistencePolicy}};

      for (let attempt = 1; attempt <= BOOTSTRAP_MAX_ATTEMPTS; attempt += 1) {
        try {
          const result = await fetchBootstrap(
            {
              postId: context.postId,
              resourceKey: context.resourceKey,
            },
            {
              transportTarget: 'frontend',
            },
          );
          if (!result.isValid || !result.data) {
            lastBootstrapError =
              result.errors[0]?.expected ?? 'Unable to initialize write access';
            if (attempt < BOOTSTRAP_MAX_ATTEMPTS) {
              await waitForBootstrapRetry(
                BOOTSTRAP_RETRY_DELAYS_MS[attempt - 1] ?? 750,
              );
              continue;
            }
            break;
          }

          clientState.writeExpiry =
            includePublicWriteCredentials &&
            'publicWriteExpiresAt' in result.data &&
            typeof result.data.publicWriteExpiresAt === 'number' &&
            result.data.publicWriteExpiresAt > 0
              ? result.data.publicWriteExpiresAt
              : 0;
          clientState.writeToken =
            includePublicWriteCredentials &&
            'publicWriteToken' in result.data &&
            typeof result.data.publicWriteToken === 'string' &&
            result.data.publicWriteToken.length > 0
              ? result.data.publicWriteToken
              : '';
          clientState.writeNonce =
            includeRestNonce &&
            'restNonce' in result.data &&
            typeof result.data.restNonce === 'string' &&
            result.data.restNonce.length > 0
              ? result.data.restNonce
              : '';
          context.bootstrapReady = true;
          context.canWrite =
            result.data.canWrite === true &&
            (context.persistencePolicy === 'authenticated'
              ? clientState.writeNonce.length > 0
              : clientState.writeToken.length > 0 &&
                !hasExpiredPublicWriteToken(clientState.writeExpiry));
          clearBootstrapError(context, clientState);
          bootstrapSucceeded = true;
          break;
        } catch (error) {
          lastBootstrapError =
            error instanceof Error ? error.message : 'Unknown bootstrap error';
          if (attempt < BOOTSTRAP_MAX_ATTEMPTS) {
            await waitForBootstrapRetry(
              BOOTSTRAP_RETRY_DELAYS_MS[attempt - 1] ?? 750,
            );
            continue;
          }
          break;
        }
      }

      if (!bootstrapSucceeded) {
        context.bootstrapReady = false;
        context.canWrite = false;
        clientState.writeExpiry = 0;
        clientState.writeNonce = '';
        clientState.writeToken = '';
        setBootstrapError(context, clientState, lastBootstrapError);
      }
      context.isBootstrapping = false;
    },
    async increment() {
      const context = getContext<{{pascalCase}}Context>();
      const clientState = getClientState(context);
      if (context.postId <= 0 || !context.resourceKey) {
        return;
      }
      if (!context.bootstrapReady) {
        await actions.loadBootstrap();
      }
      if (!context.bootstrapReady) {
        context.error = 'Write access is still initializing.';
        return;
      }
      if (
        context.persistencePolicy === 'public' &&
        hasExpiredPublicWriteToken(clientState.writeExpiry)
      ) {
        await actions.loadBootstrap();
      }
      if (
        context.persistencePolicy === 'public' &&
        hasExpiredPublicWriteToken(clientState.writeExpiry)
      ) {
        context.canWrite = false;
        context.error = getWriteBlockedMessage(context);
        return;
      }
      if (!context.canWrite) {
        context.error = getWriteBlockedMessage(context);
        return;
      }

      context.isSaving = true;
      context.error = '';

      try {
        const result = await writeState(
          {
            delta: 1,
            postId: context.postId,
            publicWriteRequestId:
              context.persistencePolicy === 'public'
                ? generatePublicWriteRequestId()
                : undefined,
            publicWriteToken:
              context.persistencePolicy === 'public' &&
              clientState.writeToken.length > 0
                ? clientState.writeToken
                : undefined,
            resourceKey: context.resourceKey,
          },
          {
            restNonce:
              clientState.writeNonce.length > 0
                ? clientState.writeNonce
                : undefined,
            transportTarget: 'frontend',
          },
        );
        if (!result.isValid || !result.data) {
          context.error =
            result.errors[0]?.expected ?? 'Unable to update counter';
          return;
        }
        context.count = result.data.count;
        context.storage = result.data.storage;
      } catch (error) {
        context.error =
          error instanceof Error ? error.message : 'Unknown update error';
      } finally {
        context.isSaving = false;
      }
    },
  },

  callbacks: {
    init() {
      const context = getContext<{{pascalCase}}Context>();
      context.client = {
        bootstrapError: '',
        writeExpiry: 0,
        writeNonce: '',
        writeToken: '',
      };
      context.bootstrapReady = false;
      context.canWrite = false;
      context.count = 0;
      context.error = '';
      context.isBootstrapping = false;
      context.isLoading = false;
      context.isSaving = false;
    },
    mounted() {
      state.isHydrated = true;
      if (typeof document !== 'undefined') {
        document.documentElement.dataset['{{slugCamelCase}}Hydrated'] =
          'true';
      }
      void Promise.allSettled([actions.loadState(), actions.loadBootstrap()]);
    },
  },
});
`;
