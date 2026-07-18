export interface SamchonGraphValidationResult {
  errors: string[];
  valid: boolean;
}

export const SAMCHON_GRAPH_POLICY: Readonly<{
  approvalMode: 'approve';
  args: readonly ['scripts/run-samchon-graph.mjs'];
  binaryName: 'samchon-graph';
  command: 'node';
  configFile: '.codex/config.toml';
  cwd: '..';
  languages: readonly ['typescript', 'php'];
  mode: 'static';
  packageName: '@samchon/graph';
  version: '0.1.0';
}>;

export function validateSamchonGraphConfig(
  repoRoot?: string,
): SamchonGraphValidationResult;
