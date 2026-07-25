import {
  getDiagnosticSeverity,
  handleDiagnostics,
} from './shared/diagnostics.js';
import type {
  BindingSourceAuthoringDiagnostic,
  BindingSourceDefinition,
  BindingSourceDiagnostic,
  DefineBindingSourceOptions,
} from './bindings-core.js';

const SOURCE_NAME_PATTERN =
  /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u;
const FIELD_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]*$/u;

export function createBindingSourceDiagnostics(
  source: BindingSourceDefinition,
  options: {
    readonly editor: boolean;
    readonly fieldsList: boolean;
    readonly server: boolean;
    readonly strict: boolean;
  },
): readonly BindingSourceAuthoringDiagnostic[] {
  const diagnostics: BindingSourceAuthoringDiagnostic[] = [];
  const severity = getDiagnosticSeverity(options.strict);

  if (!SOURCE_NAME_PATTERN.test(source.name)) {
    diagnostics.push({
      code: 'invalid-source-name',
      message: `Block binding source "${source.name}" must be lowercase and namespaced, such as "acme/profile-data".`,
      severity,
      sourceName: source.name,
    });
  }

  if (options.server && !source.getValueCallback) {
    diagnostics.push({
      code: 'missing-php-callback',
      message: `Block binding source "${source.name}" needs getValueCallback when server registration is enabled.`,
      severity,
      sourceName: source.name,
    });
  }

  if (options.fieldsList && !options.editor) {
    diagnostics.push({
      code: 'fields-list-requires-editor',
      message: `Block binding source "${source.name}" enables getFieldsList() without editor registration.`,
      severity,
      sourceName: source.name,
    });
  }

  const seenFields = new Set<string>();
  for (const field of source.fields ?? []) {
    if (!FIELD_NAME_PATTERN.test(field.name)) {
      diagnostics.push({
        code: 'invalid-field-name',
        fieldName: field.name,
        message: `Block binding source "${source.name}" field "${field.name}" must be a stable identifier.`,
        severity,
        sourceName: source.name,
      });
    }
    if (seenFields.has(field.name)) {
      diagnostics.push({
        code: 'duplicate-field-name',
        fieldName: field.name,
        message: `Block binding source "${source.name}" declares duplicate field "${field.name}".`,
        severity,
        sourceName: source.name,
      });
    }
    seenFields.add(field.name);
  }

  for (const target of source.bindableAttributes ?? []) {
    if (!SOURCE_NAME_PATTERN.test(target.blockName)) {
      diagnostics.push({
        blockName: target.blockName,
        code: 'invalid-block-name',
        message: `Bindable attributes target "${target.blockName}" must be a lowercase namespaced block name.`,
        severity,
        sourceName: source.name,
      });
    }

    const seenAttributes = new Set<string>();
    for (const attribute of target.attributes) {
      if (!FIELD_NAME_PATTERN.test(attribute)) {
        diagnostics.push({
          attribute,
          blockName: target.blockName,
          code: 'invalid-bindable-attribute',
          message: `Bindable attribute "${attribute}" for "${target.blockName}" must be a stable identifier.`,
          severity,
          sourceName: source.name,
        });
      }
      if (seenAttributes.has(attribute)) {
        diagnostics.push({
          attribute,
          blockName: target.blockName,
          code: 'duplicate-bindable-attribute',
          message: `Bindable attribute "${attribute}" for "${target.blockName}" is declared more than once.`,
          severity,
          sourceName: source.name,
        });
      }
      seenAttributes.add(attribute);
    }
  }

  return diagnostics;
}

export function handleBindingSourceDiagnostics(
  diagnostics: readonly BindingSourceDiagnostic[],
  onDiagnostic: DefineBindingSourceOptions['onDiagnostic'],
  logger: DefineBindingSourceOptions['logger'],
): void {
  handleDiagnostics(diagnostics, onDiagnostic, {
    failureHeading: 'WordPress block binding source check failed:',
    logger,
  });
}
