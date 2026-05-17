import { z } from 'zod';

import { COMPOUND_INNER_BLOCKS_PRESET_IDS } from '@wp-typia/project-tools/compound-inner-blocks';
import {
  ADD_BLOCK_TEMPLATE_IDS,
  EDITOR_PLUGIN_SLOT_IDS,
  PATTERN_CATALOG_SCOPE_IDS,
} from '@wp-typia/project-tools/cli-add';
import { HOOKED_BLOCK_POSITION_IDS } from '@wp-typia/project-tools/hooked-blocks';

import {
  ADD_KIND_IDS,
  type AddFieldName,
  getAddHiddenBooleanSubmitFieldNames,
  getAddHiddenStringSubmitFieldNames,
  getAddVisibleFieldNames as getRegisteredAddVisibleFieldNames,
  isAddPersistenceTemplate as isRegisteredAddPersistenceTemplate,
} from '../add-kind-registry';
import {
  appendTruthyBooleanFields,
  appendNormalizedOptionalStringFields,
  sanitizeVisibleSubmitValues,
} from './submit-value-sanitizers';

import {
  FIRST_PARTY_SELECT_FIELD_BODY_HEIGHT,
  FIRST_PARTY_TEXT_FIELD_BODY_HEIGHT,
  getFirstPartyScrollTop,
  getFirstPartyViewportHeight,
} from './first-party-form-model';

export const ADD_FLOW_DATA_STORAGE_IDS = [
  'custom-table',
  'post-meta',
] as const;
export const ADD_FLOW_PERSISTENCE_POLICY_IDS = [
  'authenticated',
  'public',
] as const;

const repeatableStringFieldSchema = z
  .union([z.string(), z.array(z.string())])
  .optional();

export const addFlowSchema = z.object({
  'alternate-render-targets': z.string().optional(),
  anchor: z.string().optional(),
  attribute: z.string().optional(),
  auth: z.string().optional(),
  block: z.string().optional(),
  'body-type': z.string().optional(),
  'catalog-title': z.string().optional(),
  'controller-class': z.string().optional(),
  'controller-extends': z.string().optional(),
  'data-storage': z.enum(ADD_FLOW_DATA_STORAGE_IDS).optional(),
  'external-layer-id': z.string().optional(),
  'external-layer-source': z.string().optional(),
  from: z.string().optional(),
  'inner-blocks-preset': z.enum(COMPOUND_INNER_BLOCKS_PRESET_IDS).optional(),
  kind: z.enum(ADD_KIND_IDS).default('block'),
  manual: z.boolean().optional(),
  'hide-from-rest': z.boolean().optional(),
  'from-post-meta': z.string().optional(),
  'meta-path': z.string().optional(),
  'meta-key': z.string().optional(),
  method: z.string().optional(),
  methods: z.string().optional(),
  name: z.string().optional(),
  namespace: z.string().optional(),
  path: z.string().optional(),
  'permission-callback': z.string().optional(),
  'persistence-policy': z.enum(ADD_FLOW_PERSISTENCE_POLICY_IDS).optional(),
  'post-type': z.string().optional(),
  'post-meta': z.string().optional(),
  position: z.enum(HOOKED_BLOCK_POSITION_IDS).optional(),
  'query-type': z.string().optional(),
  'release-zip': z.boolean().optional(),
  'response-type': z.string().optional(),
  'route-pattern': z.string().optional(),
  scope: z.enum(PATTERN_CATALOG_SCOPE_IDS).optional(),
  'section-role': z.string().optional(),
  'secret-field': z.string().optional(),
  'secret-has-value-field': z.string().optional(),
  'secret-masked-response-field': z.string().optional(),
  'secret-preserve-on-empty': z.string().optional(),
  'secret-state-field': z.string().optional(),
  service: z.string().optional(),
  slot: z.enum(EDITOR_PLUGIN_SLOT_IDS).optional(),
  source: z.string().optional(),
  // Repeatable --tag is a CLI-only round-trip field. Interactive users can
  // enter comma-separated catalog tags through the visible `tags` field.
  tag: repeatableStringFieldSchema,
  tags: repeatableStringFieldSchema,
  template: z.enum(ADD_BLOCK_TEMPLATE_IDS).optional(),
  'thumbnail-url': z.string().optional(),
  type: z.string().optional(),
  to: z.string().optional(),
  'wp-env': z.boolean().optional(),
});

export type AddFlowValues = z.infer<typeof addFlowSchema>;

const ADD_FIELD_HEIGHTS: Record<AddFieldName, number> = {
  anchor: FIRST_PARTY_TEXT_FIELD_BODY_HEIGHT,
  attribute: FIRST_PARTY_TEXT_FIELD_BODY_HEIGHT,
  block: FIRST_PARTY_SELECT_FIELD_BODY_HEIGHT,
  'catalog-title': FIRST_PARTY_TEXT_FIELD_BODY_HEIGHT,
  'data-storage': FIRST_PARTY_SELECT_FIELD_BODY_HEIGHT,
  'alternate-render-targets': FIRST_PARTY_TEXT_FIELD_BODY_HEIGHT,
  from: FIRST_PARTY_TEXT_FIELD_BODY_HEIGHT,
  'inner-blocks-preset': FIRST_PARTY_SELECT_FIELD_BODY_HEIGHT,
  kind: FIRST_PARTY_SELECT_FIELD_BODY_HEIGHT,
  methods: FIRST_PARTY_TEXT_FIELD_BODY_HEIGHT,
  'meta-path': FIRST_PARTY_TEXT_FIELD_BODY_HEIGHT,
  name: FIRST_PARTY_TEXT_FIELD_BODY_HEIGHT,
  namespace: FIRST_PARTY_TEXT_FIELD_BODY_HEIGHT,
  'post-meta': FIRST_PARTY_TEXT_FIELD_BODY_HEIGHT,
  'persistence-policy': FIRST_PARTY_SELECT_FIELD_BODY_HEIGHT,
  'post-type': FIRST_PARTY_TEXT_FIELD_BODY_HEIGHT,
  position: FIRST_PARTY_SELECT_FIELD_BODY_HEIGHT,
  'section-role': FIRST_PARTY_TEXT_FIELD_BODY_HEIGHT,
  slot: FIRST_PARTY_SELECT_FIELD_BODY_HEIGHT,
  source: FIRST_PARTY_TEXT_FIELD_BODY_HEIGHT,
  scope: FIRST_PARTY_SELECT_FIELD_BODY_HEIGHT,
  tags: FIRST_PARTY_TEXT_FIELD_BODY_HEIGHT,
  template: FIRST_PARTY_SELECT_FIELD_BODY_HEIGHT,
  'thumbnail-url': FIRST_PARTY_TEXT_FIELD_BODY_HEIGHT,
  type: FIRST_PARTY_TEXT_FIELD_BODY_HEIGHT,
  to: FIRST_PARTY_TEXT_FIELD_BODY_HEIGHT,
};

export function getAddFieldLayoutNames(): AddFieldName[] {
  return Object.keys(ADD_FIELD_HEIGHTS) as AddFieldName[];
}

export function isAddPersistenceTemplate(template?: string): boolean {
  return isRegisteredAddPersistenceTemplate(template);
}

export function getVisibleAddFieldNames(
  values: Partial<AddFlowValues>,
): Array<AddFieldName> {
  return getRegisteredAddVisibleFieldNames({
    kind: values.kind,
    template: values.template,
  });
}

export function getAddViewportHeight(terminalHeight = 24): number {
  return getFirstPartyViewportHeight(terminalHeight);
}

export function getAddScrollTop(options: {
  activeFieldName: string | null;
  values: Partial<AddFlowValues>;
  viewportHeight: number;
}): number {
  const { activeFieldName, values, viewportHeight } = options;
  return getFirstPartyScrollTop({
    activeFieldName,
    fieldHeights: ADD_FIELD_HEIGHTS,
    visibleFieldNames: getVisibleAddFieldNames(values),
    viewportHeight,
  });
}

export function sanitizeAddSubmitValues(
  values: AddFlowValues,
): Record<string, unknown> {
  const sanitized = sanitizeVisibleSubmitValues(
    values,
    getVisibleAddFieldNames(values),
  );

  return appendNormalizedOptionalStringFields(
    appendTruthyBooleanFields(
      sanitized,
      values,
      getAddHiddenBooleanSubmitFieldNames(values.kind),
    ),
    values,
    getAddHiddenStringSubmitFieldNames(values.kind),
  );
}
