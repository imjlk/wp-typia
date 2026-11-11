import {
  CLI_DIAGNOSTIC_CODES,
  createCliDiagnosticCodeError,
} from '@wp-typia/project-tools/cli-diagnostics';

import {
  readOptionalDashedOrCamelStringFlag,
  readOptionalStrictStringFlag,
} from '../cli-string-flags';
import {
  createNamedExecutionPlan,
  defineAddKindRegistryEntry,
  NAME_NAMESPACE_METHODS_VISIBLE_FIELDS,
  requireAddKindName,
  type AddRestResourceResult,
} from '../add-kind-registry-shared';

const REST_RESOURCE_GENERATED_USAGE =
  'Generated: wp-typia add rest-resource <name> [--namespace <vendor/v1>] [--methods <list,read,create,update,delete>] [--route-pattern <route-pattern>] [--permission-callback <callback>] [--controller-class <ClassName>] [--controller-extends <BaseClass>] [--dry-run]';
const REST_RESOURCE_MANUAL_USAGE =
  'Manual: wp-typia add rest-resource <name> --manual [--namespace <vendor/v1>] [--method <GET|POST|PUT|PATCH|DELETE>] [--auth <public|authenticated|public-write-protected>] [--path <route-pattern>|--route-pattern <route-pattern>] [--permission-callback <callback>] [--controller-class <ClassName>] [--controller-extends <BaseClass>] [--query-type <Type>] [--body-type <Type>] [--response-type <Type>] [--secret-field <field>] [--secret-state-field|--secret-has-value-field <field>] [--secret-preserve-on-empty <true|false>] [--secret-storage <option|secrets-api>] [--dry-run]';
const REST_RESOURCE_USAGE = `${REST_RESOURCE_GENERATED_USAGE}\n${REST_RESOURCE_MANUAL_USAGE}`;
const REST_RESOURCE_MISSING_NAME_MESSAGE = [
  '`wp-typia add rest-resource` requires <name>. Usage:',
  `  ${REST_RESOURCE_GENERATED_USAGE}`,
  `  ${REST_RESOURCE_MANUAL_USAGE}`,
].join('\n');
const SECRET_PRESERVE_ON_EMPTY_TRUE_VALUES = new Set(['1', 'true', 'yes']);
const SECRET_PRESERVE_ON_EMPTY_FALSE_VALUES = new Set(['0', 'false', 'no']);
const SECRET_STORAGE_VALUES = new Set(['option', 'secrets-api']);

function readOptionalSecretPreserveOnEmptyFlag(
  flags: Record<string, unknown>,
): boolean | undefined {
  const value = flags['secret-preserve-on-empty'] ?? flags.secretPreserveOnEmpty;
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value !== 'string') {
    throw createCliDiagnosticCodeError(
      CLI_DIAGNOSTIC_CODES.MISSING_ARGUMENT,
      '`--secret-preserve-on-empty` requires a value.',
    );
  }

  const normalized = value.trim().toLowerCase();
  if (normalized.length === 0) {
    throw createCliDiagnosticCodeError(
      CLI_DIAGNOSTIC_CODES.MISSING_ARGUMENT,
      '`--secret-preserve-on-empty` requires a value.',
    );
  }
  if (SECRET_PRESERVE_ON_EMPTY_TRUE_VALUES.has(normalized)) {
    return true;
  }
  if (SECRET_PRESERVE_ON_EMPTY_FALSE_VALUES.has(normalized)) {
    return false;
  }

  throw createCliDiagnosticCodeError(
    CLI_DIAGNOSTIC_CODES.INVALID_ARGUMENT,
    'Manual REST contract --secret-preserve-on-empty must be true or false.',
  );
}

function readOptionalSecretStorageFlag(
  flags: Record<string, unknown>,
  options: {
    manual: boolean;
    secretFieldName: string | undefined;
  },
): 'option' | 'secrets-api' | undefined {
  const value = flags['secret-storage'] ?? flags.secretStorage;
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw createCliDiagnosticCodeError(
      CLI_DIAGNOSTIC_CODES.MISSING_ARGUMENT,
      '`--secret-storage` requires a value.',
    );
  }

  const normalized = value.trim().toLowerCase();
  if (normalized.length === 0) {
    throw createCliDiagnosticCodeError(
      CLI_DIAGNOSTIC_CODES.MISSING_ARGUMENT,
      '`--secret-storage` requires a value.',
    );
  }
  if (!SECRET_STORAGE_VALUES.has(normalized)) {
    throw createCliDiagnosticCodeError(
      CLI_DIAGNOSTIC_CODES.INVALID_ARGUMENT,
      'Manual REST contract --secret-storage must be option or secrets-api.',
    );
  }
  if (!options.manual) {
    throw createCliDiagnosticCodeError(
      CLI_DIAGNOSTIC_CODES.INVALID_ARGUMENT,
      'Manual REST contract --secret-storage requires --manual and --secret-field.',
    );
  }
  if (!options.secretFieldName) {
    throw createCliDiagnosticCodeError(
      CLI_DIAGNOSTIC_CODES.INVALID_ARGUMENT,
      'Manual REST contract --secret-storage requires --secret-field.',
    );
  }

  return normalized as 'option' | 'secrets-api';
}

export const restResourceAddKindEntry =
  defineAddKindRegistryEntry<AddRestResourceResult>({
    completion: {
      nextSteps: (values) =>
        values.mode === 'manual'
          ? [
              `Review src/rest/${values.restResourceSlug}/ and edit the manual contract types to match the external route owner.`,
              'Run sync-rest --check after changing the contract types to verify schemas, OpenAPI, and client artifacts.',
              ...(values.secretStorage === 'secrets-api'
                ? [
                    `Call the server-side helpers in inc/rest/${values.restResourceSlug}-secret.php from the route owner. Responses stay limited to the masked boolean.`,
                  ]
                : []),
            ]
          : [
              `Review src/rest/${values.restResourceSlug}/ and inc/rest/${values.restResourceSlug}.php.`,
              'Run your workspace build or dev command to verify the generated REST resource contract.',
            ],
      summaryLines: (values, projectDir) => [
        `REST resource: ${values.restResourceSlug}`,
        `Mode: ${values.mode}`,
        `Namespace: ${values.namespace}`,
        ...(values.mode === 'manual'
          ? [
              `Route: ${values.method} /${values.namespace}${values.pathPattern}`,
              `Auth: ${values.auth}`,
              ...(values.secretFieldName
                ? [
                    `Secret field: ${values.secretFieldName} -> ${values.secretStateFieldName}`,
                    `Secret preserve on empty: ${values.secretPreserveOnEmpty}`,
                    ...(values.secretStorage === 'secrets-api'
                      ? [`Secret storage: ${values.secretStorage}`]
                      : []),
                  ]
                : []),
              ...(values.permissionCallback
                ? [`Declared permission callback: ${values.permissionCallback}`]
                : []),
              ...(values.controllerClass
                ? [`Declared controller class: ${values.controllerClass}`]
                : []),
              ...(values.controllerExtends
                ? [`Declared controller base: ${values.controllerExtends}`]
                : []),
            ]
          : [
              `Methods: ${values.methods}`,
              ...(values.routePattern
                ? [`Item route: /${values.namespace}${values.routePattern}`]
                : []),
              ...(values.permissionCallback
                ? [`Permission callback: ${values.permissionCallback}`]
                : []),
              ...(values.controllerClass
                ? [`Controller class: ${values.controllerClass}`]
                : []),
            ]),
        `Project directory: ${projectDir}`,
      ],
      title: 'Added REST resource contract',
    },
    description: 'Add a generated or type-only REST resource contract',
    hiddenBooleanSubmitFields: ['manual'],
    hiddenStringSubmitFields: [
      'auth',
      'body-type',
      'controller-class',
      'controller-extends',
      'method',
      'path',
      'permission-callback',
      'query-type',
      'response-type',
      'route-pattern',
      'secret-field',
      'secret-has-value-field',
      'secret-masked-response-field',
      'secret-preserve-on-empty',
      'secret-state-field',
      'secret-storage',
    ],
    nameLabel: 'REST resource name',
    async prepareExecution(context) {
      const name = requireAddKindName(
        context,
        REST_RESOURCE_MISSING_NAME_MESSAGE,
      );
      const auth = readOptionalStrictStringFlag(context.flags, 'auth');
      const bodyTypeName = readOptionalStrictStringFlag(
        context.flags,
        'body-type',
      );
      const controllerClass = readOptionalDashedOrCamelStringFlag(
        context.flags,
        'controller-class',
        'controllerClass',
      );
      const controllerExtends = readOptionalDashedOrCamelStringFlag(
        context.flags,
        'controller-extends',
        'controllerExtends',
      );
      const manual = Boolean(context.flags.manual);
      const method = readOptionalStrictStringFlag(context.flags, 'method');
      const methods = readOptionalStrictStringFlag(context.flags, 'methods');
      const namespace = readOptionalStrictStringFlag(context.flags, 'namespace');
      const permissionCallback = readOptionalDashedOrCamelStringFlag(
        context.flags,
        'permission-callback',
        'permissionCallback',
      );
      const pathPattern = readOptionalStrictStringFlag(context.flags, 'path');
      const queryTypeName = readOptionalStrictStringFlag(
        context.flags,
        'query-type',
      );
      const responseTypeName = readOptionalStrictStringFlag(
        context.flags,
        'response-type',
      );
      const routePattern = readOptionalDashedOrCamelStringFlag(
        context.flags,
        'route-pattern',
        'routePattern',
      );
      const secretFieldName = readOptionalDashedOrCamelStringFlag(
        context.flags,
        'secret-field',
        'secretField',
      );
      const secretHasValueFieldName = readOptionalDashedOrCamelStringFlag(
        context.flags,
        'secret-has-value-field',
        'secretHasValueField',
      );
      const secretMaskedResponseFieldName = readOptionalDashedOrCamelStringFlag(
        context.flags,
        'secret-masked-response-field',
        'secretMaskedResponseField',
      );
      const secretPreserveOnEmpty = readOptionalSecretPreserveOnEmptyFlag(
        context.flags,
      );
      const secretStorage = readOptionalSecretStorageFlag(context.flags, {
        manual,
        secretFieldName,
      });
      const secretStateFieldName = readOptionalDashedOrCamelStringFlag(
        context.flags,
        'secret-state-field',
        'secretStateField',
      );

      return createNamedExecutionPlan(context, {
        execute: ({ cwd, name }) =>
          context.addRuntime.runAddRestResourceCommand({
            auth,
            bodyTypeName,
            controllerClass,
            controllerExtends,
            cwd,
            manual,
            method,
            methods,
            namespace,
            permissionCallback,
            pathPattern,
            queryTypeName,
            restResourceName: name,
            responseTypeName,
            routePattern,
            secretFieldName,
            secretHasValueFieldName,
            secretMaskedResponseFieldName,
            secretPreserveOnEmpty,
            secretStateFieldName,
            secretStorage,
          }),
        getValues: (result) => ({
          auth: result.auth ?? '',
          controllerClass: result.controllerClass ?? '',
          controllerExtends: result.controllerExtends ?? '',
          method: result.method ?? '',
          methods: result.methods.join(', '),
          mode: result.mode,
          namespace: result.namespace,
          pathPattern: result.pathPattern ?? '',
          permissionCallback: result.permissionCallback ?? '',
          restResourceSlug: result.restResourceSlug,
          routePattern: result.routePattern ?? '',
          secretFieldName: result.secretFieldName ?? '',
          secretPreserveOnEmpty:
            result.secretPreserveOnEmpty === undefined
              ? ''
              : String(result.secretPreserveOnEmpty),
          secretStateFieldName: result.secretStateFieldName ?? '',
          ...(result.secretStorage === 'secrets-api'
            ? { secretStorage: result.secretStorage }
            : {}),
        }),
        missingNameMessage: REST_RESOURCE_MISSING_NAME_MESSAGE,
        name,
        warnLine: context.warnLine,
      });
    },
    sortOrder: 80,
    supportsDryRun: true,
    usage: REST_RESOURCE_USAGE,
    visibleFieldNames: () => NAME_NAMESPACE_METHODS_VISIBLE_FIELDS,
  });
