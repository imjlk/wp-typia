export interface SamchonGraphValidationResult {
  errors: string[];
  valid: boolean;
}

export { SAMCHON_GRAPH_POLICY } from './samchon-graph-policy.mjs';

export function validateSamchonGraphConfig(
  repoRoot?: string,
): SamchonGraphValidationResult;
