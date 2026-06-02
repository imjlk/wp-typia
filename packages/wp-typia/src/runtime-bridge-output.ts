export type {
  CreateProgressPayload,
  InitPlanLayoutKind,
  RuntimeCompletionPayload,
  SerializableCompletionPayload,
  StructuredCompletionSuccessPayload,
  StructuredInitPlan,
  StructuredInitSuccessPayload,
} from './runtime-output/types';
export {
  buildStructuredCompletionSuccessPayload,
  buildStructuredInitSuccessPayload,
  extractCompletionProjectDir,
  serializeCompletionPayload,
} from './runtime-output/structured';
export {
  buildCreateCompletionPayload,
  buildCreateDryRunPayload,
  formatCreateProgressLine,
} from './runtime-output/create';
export {
  buildAddCompletionPayload,
  buildAddDryRunPayload,
} from './runtime-output/add';
export { buildInitCompletionPayload } from './runtime-output/init';
export { buildMigrationCompletionPayload } from './runtime-output/migrate';
export { buildSyncDryRunPayload } from './runtime-output/sync';
export { printBlock, printCompletionPayload } from './runtime-output/print';

/**
 * Converts external layer options into prompt-compatible select items.
 *
 * @param options External layer options returned by the block generator.
 * @returns Prompt select options with labels and hints.
 */
export { toExternalLayerPromptOptions } from './external-layer-prompt-options';
