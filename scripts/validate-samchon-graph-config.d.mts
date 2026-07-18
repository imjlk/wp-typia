export interface SamchonGraphValidationResult {
  errors: string[];
  valid: boolean;
}

export const SAMCHON_GRAPH_POLICY: Readonly<{
  approvalMode: 'approve';
  command: 'bunx';
  configFile: '.codex/config.toml';
  languages: readonly ['typescript', 'php'];
  packageName: '@samchon/graph';
  version: '0.1.0';
}>;

export function validateSamchonGraphConfig(
  repoRoot?: string,
): SamchonGraphValidationResult;
